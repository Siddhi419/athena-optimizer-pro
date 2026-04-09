import { supabase } from '@/integrations/supabase/client';

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

interface EdgeFunctionError {
  message?: string;
  context?: unknown;
}

function mapInvokeError(error: EdgeFunctionError) {
  const details = [error.message, typeof error.context === 'string' ? error.context : '']
    .filter(Boolean)
    .join(' ');

  if (/Failed to send a request to the Edge Function/i.test(details)) {
    return new Error('Athena service is unreachable. Republish the app and try again.');
  }

  return new Error(error.message || 'Athena request failed');
}

async function callAthenaAction<T>(
  action: string,
  creds: TempCredentials,
  payload: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('aws-metadata', {
    body: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      action,
      ...payload,
    },
  });

  if (error) throw mapInvokeError(error as EdgeFunctionError);
  if (data?.ok === false || data?.error) throw new Error(data.error || 'Athena request failed');

  return (data?.data ?? data) as T;
}

export async function executeAthenaQuery(
  sql: string,
  creds: TempCredentials,
  database: string = 'default',
  outputLocation?: string,
  region: string = 'us-east-1'
): Promise<AthenaQueryResult> {
  return callAthenaAction<AthenaQueryResult>('executeQuery', creds, {
    sql,
    database,
    region,
    outputLocation: outputLocation?.trim() || undefined,
  });
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
  outputLocation?: string,
  region: string = 'us-east-1'
): Promise<ExplainResult> {
  return callAthenaAction<ExplainResult>('explainQuery', creds, {
    sql,
    database,
    region,
    outputLocation: outputLocation?.trim() || undefined,
  });
}

/** Workgroup info with S3 output location */
export interface AthenaWorkgroup {
  name: string;
  outputLocation?: string;
  state?: string;
}

/** List all Athena workgroups to find configured S3 output locations */
export async function listWorkgroups(
  creds: TempCredentials,
  region: string
): Promise<AthenaWorkgroup[]> {
  return callAthenaAction<AthenaWorkgroup[]>('listWorkgroups', creds, { region });
}
