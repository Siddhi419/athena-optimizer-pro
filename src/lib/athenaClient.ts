import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from '@aws-sdk/client-athena';

export interface AthenaQueryResult {
  columns: string[];
  rows: string[][];
  queryExecutionId: string;
  state: string;
  dataScannedBytes: number;
  executionTimeMs: number;
}

interface TempCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

function createAthenaClient(creds: TempCredentials, region: string): AthenaClient {
  return new AthenaClient({
    region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {}),
    },
  });
}

async function waitForQuery(
  client: AthenaClient,
  queryExecutionId: string
): Promise<{ state: string; executionTimeMs: number; dataScannedBytes: number }> {
  let state: QueryExecutionState | string = 'QUEUED';
  let executionTimeMs = 0;
  let dataScannedBytes = 0;

  while (state === 'QUEUED' || state === 'RUNNING') {
    await new Promise((r) => setTimeout(r, 1000));
    const statusResult = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );
    const execution = statusResult.QueryExecution;
    state = execution?.Status?.State || 'UNKNOWN';
    if (state === 'FAILED') throw new Error(execution?.Status?.StateChangeReason || 'Query execution failed');
    if (state === 'CANCELLED') throw new Error('Query was cancelled');
    if (execution?.Statistics) {
      executionTimeMs = execution.Statistics.EngineExecutionTimeInMillis || 0;
      dataScannedBytes = execution.Statistics.DataScannedInBytes || 0;
    }
  }

  return { state, executionTimeMs, dataScannedBytes };
}

export async function executeAthenaQuery(
  sql: string,
  creds: TempCredentials,
  database: string = 'default',
  outputLocation: string = 's3://athena-query-results-bucket/',
  region: string = 'us-east-1'
): Promise<AthenaQueryResult> {
  const client = createAthenaClient(creds, region);

  const startResult = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: { Database: database },
      ResultConfiguration: { OutputLocation: outputLocation },
    })
  );

  const queryExecutionId = startResult.QueryExecutionId;
  if (!queryExecutionId) throw new Error('Failed to start query execution');

  const { state, executionTimeMs, dataScannedBytes } = await waitForQuery(client, queryExecutionId);

  const resultsResponse = await client.send(
    new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId })
  );

  const resultSet = resultsResponse.ResultSet;
  const columns = resultSet?.ResultSetMetadata?.ColumnInfo?.map((c) => c.Name || '') || [];
  const allRows = resultSet?.Rows || [];
  const rows = allRows.slice(1).map((row) => row.Data?.map((d) => d.VarCharValue || '') || []);

  return { columns, rows, queryExecutionId, state, dataScannedBytes, executionTimeMs };
}

export interface ExplainResult {
  dataScannedBytes: number;
  executionTimeMs: number;
  queryPlan: string;
}

/** Run EXPLAIN on a query to get real Athena cost stats */
export async function explainAthenaQuery(
  sql: string,
  creds: TempCredentials,
  database: string = 'default',
  outputLocation: string = 's3://athena-query-results-bucket/',
  region: string = 'us-east-1'
): Promise<ExplainResult> {
  const client = createAthenaClient(creds, region);

  // Try EXPLAIN ANALYZE first, fall back to EXPLAIN
  for (const prefix of ['EXPLAIN ANALYZE', 'EXPLAIN']) {
    try {
      const startResult = await client.send(
        new StartQueryExecutionCommand({
          QueryString: `${prefix} ${sql}`,
          QueryExecutionContext: { Database: database },
          ResultConfiguration: { OutputLocation: outputLocation },
        })
      );

      const queryExecutionId = startResult.QueryExecutionId;
      if (!queryExecutionId) continue;

      const { executionTimeMs, dataScannedBytes } = await waitForQuery(client, queryExecutionId);

      const resultsResponse = await client.send(
        new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId })
      );

      const allRows = resultsResponse.ResultSet?.Rows || [];
      const queryPlan = allRows.map(r => r.Data?.map(d => d.VarCharValue || '').join(' ') || '').join('\n');

      return { dataScannedBytes, executionTimeMs, queryPlan };
    } catch {
      if (prefix === 'EXPLAIN') throw new Error('EXPLAIN query failed');
      // Fall through to try plain EXPLAIN
    }
  }

  throw new Error('Failed to explain query');
}
