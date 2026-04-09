import { corsHeaders } from '@supabase/supabase-js/cors'

interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

async function awsRequest(creds: AwsCreds, service: string, target: string, body: Record<string, unknown>) {
  const host = `${service}.${creds.region}.amazonaws.com`;
  const url = `https://${host}/`;
  const bodyStr = JSON.stringify(body);
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const shortDate = dateStamp.slice(0, 8);

  // AWS Signature V4
  const encoder = new TextEncoder();
  
  async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(msg));
  }

  async function sha256(data: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const contentType = 'application/x-amz-json-1.1';
  const headers: Record<string, string> = {
    'content-type': contentType,
    'host': host,
    'x-amz-date': dateStamp,
    'x-amz-target': target,
  };
  if (creds.sessionToken) {
    headers['x-amz-security-token'] = creds.sessionToken;
  }

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');
  const payloadHash = await sha256(bodyStr);

  const canonicalRequest = [
    'POST', '/', '', canonicalHeaders, signedHeaders, payloadHash
  ].join('\n');

  const credentialScope = `${shortDate}/${creds.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', dateStamp, credentialScope, await sha256(canonicalRequest)
  ].join('\n');

  const kDate = await hmac(encoder.encode('AWS4' + creds.secretAccessKey), shortDate);
  const kRegion = await hmac(kDate, creds.region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = [...new Uint8Array(await hmac(kSigning, stringToSign))].map(b => b.toString(16).padStart(2, '0')).join('');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': authHeader,
    },
    body: bodyStr,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AWS ${service} error (${resp.status}): ${errText}`);
  }
  return resp.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json();
    const { accessKeyId, secretAccessKey, sessionToken, region, action, databaseName } = reqBody;

    if (!accessKeyId || !secretAccessKey || !region) {
      return new Response(JSON.stringify({ error: 'Missing credentials' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ databases }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'listTables') {
      const tables: Array<{
        name: string; databaseName: string;
        columns: Array<{ name: string; type: string }>;
        partitionKeys: Array<{ name: string; type: string }>;
        location?: string; tableType?: string;
      }> = [];
      let nextToken: string | undefined;
      do {
        const body: Record<string, unknown> = { DatabaseName: databaseName };
        if (nextToken) body.NextToken = nextToken;
        const res = await awsRequest(creds, 'glue', 'AWSGlue.GetTables', body);
        for (const t of res.TableList || []) {
          tables.push({
            name: t.Name || '',
            databaseName,
            columns: (t.StorageDescriptor?.Columns || []).map((c: any) => ({ name: c.Name || '', type: c.Type || '' })),
            partitionKeys: (t.PartitionKeys || []).map((c: any) => ({ name: c.Name || '', type: c.Type || '' })),
            location: t.StorageDescriptor?.Location,
            tableType: t.TableType,
          });
        }
        nextToken = res.NextToken;
      } while (nextToken);
      return new Response(JSON.stringify({ tables }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

      // Get output location for each workgroup
      for (const wg of workgroups) {
        try {
          const detail = await awsRequest(creds, 'athena', 'AmazonAthena.GetWorkGroup', { WorkGroup: wg.name });
          wg.outputLocation = detail.WorkGroup?.Configuration?.ResultConfiguration?.OutputLocation;
        } catch { /* skip */ }
      }

      return new Response(JSON.stringify({ workgroups }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});