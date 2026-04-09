import { supabase } from '@/integrations/supabase/client';

export interface CatalogDatabase {
  name: string;
  description?: string;
  locationUri?: string;
}

export interface CatalogTable {
  name: string;
  databaseName: string;
  columns: { name: string; type: string }[];
  partitionKeys: { name: string; type: string }[];
  location?: string;
  tableType?: string;
}

export interface AthenaWorkgroup {
  name: string;
  outputLocation?: string;
  state?: string;
}

interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

async function callMetadata(creds: AwsCreds, action: string, extra: Record<string, string> = {}) {
  const { data, error } = await supabase.functions.invoke('aws-metadata', {
    body: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      region: creds.region,
      action,
      ...extra,
    },
  });
  if (error) throw new Error(error.message || 'Edge function call failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchDatabases(creds: AwsCreds): Promise<CatalogDatabase[]> {
  const res = await callMetadata(creds, 'listDatabases');
  return res.databases || [];
}

export async function fetchTables(creds: AwsCreds, databaseName: string): Promise<CatalogTable[]> {
  const res = await callMetadata(creds, 'listTables', { databaseName });
  return res.tables || [];
}

export async function fetchWorkgroups(creds: AwsCreds): Promise<AthenaWorkgroup[]> {
  const res = await callMetadata(creds, 'listWorkgroups');
  return res.workgroups || [];
}