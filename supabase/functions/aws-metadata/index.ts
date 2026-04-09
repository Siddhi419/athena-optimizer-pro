const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

interface QueryExecutionMetrics {
  state: string;
  executionTimeMs: number;
  dataScannedBytes: number;
}

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function ok(data: Record<string, unknown>) {
  return jsonResponse({ ok: true, data });
}

function fail(error: string, diagnostics: Record<string, unknown> = {}) {
  return jsonResponse({ ok: false, error, diagnostics });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function awsRequest(creds: AwsCreds, service: string, target: string, body: Record<string, unknown>) {
  const host = `${service}.${creds.region}.amazonaws.com`;
  const url = `https://${host}/`;
  const bodyStr = JSON.stringify(body);
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const shortDate = dateStamp.slice(0, 8);
  const encoder = new TextEncoder();

  async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(msg));
  }

  async function sha256(data: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.1',
    host,
    'x-amz-date': dateStamp,
    'x-amz-target': target,
  };

  if (creds.sessionToken) {
    headers['x-amz-security-token'] = creds.sessionToken;
  }

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map((key) => `${key}:${headers[key]}\n`).join('');
  const payloadHash = await sha256(bodyStr);
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${shortDate}/${creds.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', dateStamp, credentialScope, await sha256(canonicalRequest)].join('\n');
  const kDate = await hmac(encoder.encode(`AWS4${creds.secretAccessKey}`), shortDate);
  const kRegion = await hmac(kDate, creds.region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = [...new Uint8Array(await hmac(kSigning, stringToSign))].map((b) => b.toString(16).padStart(2, '0')).join('');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      Authorization: authHeader,
    },
    body: bodyStr,
  });

  if (!resp.ok) {
    throw new Error(`AWS ${service} error (${resp.status}): ${await resp.text()}`);
  }

  return resp.json();
}

function buildStartQueryBody(sql: string, database: string, outputLocation?: string) {
  const body: Record<string, unknown> = {
    QueryString: sql,
    QueryExecutionContext: { Database: database || 'default' },
  };

  if (outputLocation) {
    body.ResultConfiguration = { OutputLocation: outputLocation };
  }

  return body;
}

async function waitForQuery(creds: AwsCreds, queryExecutionId: string): Promise<QueryExecutionMetrics> {
  let state = 'QUEUED';
  let executionTimeMs = 0;
  let dataScannedBytes = 0;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const statusResult = await awsRequest(creds, 'athena', 'AmazonAthena.GetQueryExecution', {
      QueryExecutionId: queryExecutionId,
    });

    const execution = statusResult.QueryExecution;
    state = execution?.Status?.State || 'UNKNOWN';
    executionTimeMs = execution?.Statistics?.EngineExecutionTimeInMillis || 0;
    dataScannedBytes = execution?.Statistics?.DataScannedInBytes || 0;

    if (state === 'SUCCEEDED') return { state, executionTimeMs, dataScannedBytes };
    if (state === 'FAILED') throw new Error(execution?.Status?.StateChangeReason || 'Query execution failed');
    if (state === 'CANCELLED') throw new Error('Query was cancelled');
  }

  throw new Error('Query timed out while waiting for Athena');
}

async function executeQuery(creds: AwsCreds, sql: string, database: string, outputLocation?: string) {
  const startResult = await awsRequest(creds, 'athena', 'AmazonAthena.StartQueryExecution', buildStartQueryBody(sql, database, outputLocation));
  const queryExecutionId = startResult.QueryExecutionId;

  if (!queryExecutionId) throw new Error('Failed to start query execution');

  const { state, executionTimeMs, dataScannedBytes } = await waitForQuery(creds, queryExecutionId);
  const resultsResponse = await awsRequest(creds, 'athena', 'AmazonAthena.GetQueryResults', {
    QueryExecutionId: queryExecutionId,
  });

  const resultSet = resultsResponse.ResultSet;
  const columns = resultSet?.ResultSetMetadata?.ColumnInfo?.map((column: { Name?: string }) => column.Name || '') || [];
  const rows = (resultSet?.Rows || [])
    .slice(1)
    .map((row: { Data?: Array<{ VarCharValue?: string }> }) => row.Data?.map((cell) => cell.VarCharValue || '') || []);

  return { columns, rows, queryExecutionId, state, dataScannedBytes, executionTimeMs };
}

async function explainQuery(creds: AwsCreds, sql: string, database: string, outputLocation?: string) {
  for (const prefix of ['EXPLAIN ANALYZE', 'EXPLAIN']) {
    try {
      const startResult = await awsRequest(
        creds,
        'athena',
        'AmazonAthena.StartQueryExecution',
        buildStartQueryBody(`${prefix} ${sql}`, database, outputLocation)
      );
      const queryExecutionId = startResult.QueryExecutionId;
      if (!queryExecutionId) continue;

      const { executionTimeMs, dataScannedBytes } = await waitForQuery(creds, queryExecutionId);
      const resultsResponse = await awsRequest(creds, 'athena', 'AmazonAthena.GetQueryResults', {
        QueryExecutionId: queryExecutionId,
      });

      const queryPlan = (resultsResponse.ResultSet?.Rows || [])
        .map((row: { Data?: Array<{ VarCharValue?: string }> }) => row.Data?.map((cell) => cell.VarCharValue || '').join(' ') || '')
        .join('\n');

      return { dataScannedBytes, executionTimeMs, queryPlan };
    } catch (error) {
      if (prefix === 'EXPLAIN') throw error;
    }
  }

  throw new Error('EXPLAIN query failed');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const reqBody = await req.json();
    const { accessKeyId, secretAccessKey, sessionToken, region, action, databaseName, sql, database, outputLocation } = reqBody;

    if (!accessKeyId || !secretAccessKey || !region || !action) {
      return fail('Missing credentials or action', {
        errorStage: 'validate_request',
        processingTimeMs: Date.now() - startTime,
      });
    }

    const creds: AwsCreds = { accessKeyId, secretAccessKey, sessionToken, region };

    if (action === 'listDatabases') {
      const databases: Array<{ name: string; description?: string; locationUri?: string }> = [];
      let nextToken: string | undefined;
      do {
        const body: Record<string, unknown> = {};
        if (nextToken) body.NextToken = nextToken;
        const res = await awsRequest(creds, 'glue', 'AWSGlue.GetDatabases', body);
        for (const db of res.DatabaseList || []) {
          databases.push({ name: db.Name || '', description: db.Description, locationUri: db.LocationUri });
        }
        nextToken = res.NextToken;
      } while (nextToken);

      return ok({ databases, processingTimeMs: Date.now() - startTime });
    }

    if (action === 'listTables') {
      if (!databaseName) {
        return fail('Missing database name', { errorStage: 'validate_request', processingTimeMs: Date.now() - startTime });
      }

      const tables: Array<{ name: string; databaseName: string; columns: Array<{ name: string; type: string }>; partitionKeys: Array<{ name: string; type: string }>; location?: string; tableType?: string }> = [];
      let nextToken: string | undefined;
      do {
        const body: Record<string, unknown> = { DatabaseName: databaseName };
        if (nextToken) body.NextToken = nextToken;
        const res = await awsRequest(creds, 'glue', 'AWSGlue.GetTables', body);
        for (const t of res.TableList || []) {
          tables.push({
            name: t.Name || '',
            databaseName,
            columns: (t.StorageDescriptor?.Columns || []).map((c: { Name?: string; Type?: string }) => ({ name: c.Name || '', type: c.Type || '' })),
            partitionKeys: (t.PartitionKeys || []).map((c: { Name?: string; Type?: string }) => ({ name: c.Name || '', type: c.Type || '' })),
            location: t.StorageDescriptor?.Location,
            tableType: t.TableType,
          });
        }
        nextToken = res.NextToken;
      } while (nextToken);

      return ok({ tables, processingTimeMs: Date.now() - startTime });
    }

    if (action === 'listWorkgroups') {
      const workgroups: Array<{ name: string; outputLocation?: string; state?: string }> = [];
      let nextToken: string | undefined;
      do {
        const body: Record<string, unknown> = {};
        if (nextToken) body.NextToken = nextToken;
        const res = await awsRequest(creds, 'athena', 'AmazonAthena.ListWorkGroups', body);
        for (const wg of res.WorkGroups || []) {
          workgroups.push({ name: wg.Name || '', state: wg.State });
        }
        nextToken = res.NextToken;
      } while (nextToken);

      for (const wg of workgroups) {
        try {
          const detail = await awsRequest(creds, 'athena', 'AmazonAthena.GetWorkGroup', { WorkGroup: wg.name });
          wg.outputLocation = detail.WorkGroup?.Configuration?.ResultConfiguration?.OutputLocation;
        } catch {
        }
      }

      return ok({ workgroups, processingTimeMs: Date.now() - startTime });
    }

    if (action === 'executeQuery') {
      if (!sql) {
        return fail('Missing SQL query', { errorStage: 'validate_request', processingTimeMs: Date.now() - startTime });
      }

      return ok({ ...(await executeQuery(creds, sql, database || 'default', outputLocation)), processingTimeMs: Date.now() - startTime });
    }

    if (action === 'explainQuery') {
      if (!sql) {
        return fail('Missing SQL query', { errorStage: 'validate_request', processingTimeMs: Date.now() - startTime });
      }

      return ok({ ...(await explainQuery(creds, sql, database || 'default', outputLocation)), processingTimeMs: Date.now() - startTime });
    }

    return fail(`Unknown action: ${action}`, { errorStage: 'validate_request', processingTimeMs: Date.now() - startTime });
  } catch (err) {
    return fail(getErrorMessage(err), { errorStage: 'request_failed', processingTimeMs: Date.now() - startTime });
  }
});