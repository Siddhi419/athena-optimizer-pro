import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { executeAthenaQuery, AthenaQueryResult } from '@/lib/athenaClient';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Play, Loader2, Database, Clock, HardDrive, AlertTriangle, CheckCircle2, Terminal,
} from 'lucide-react';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function estimateCost(bytes: number): string {
  const tb = bytes / (1024 ** 4);
  const cost = Math.max(tb * 5, 0);
  return cost < 0.01 ? '< $0.01' : `$${cost.toFixed(4)}`;
}

export default function LiveQuery() {
  const { credentials } = useAuth();
  const [sql, setSql] = useState('');
  const [database, setDatabase] = useState('default');
  const [outputLocation, setOutputLocation] = useState('s3://athena-query-results-bucket/');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AthenaQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = useCallback(async () => {
    if (!sql.trim() || !credentials) return;
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const creds = {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken || '',
      };
      const queryResult = await executeAthenaQuery(sql, creds, database, outputLocation, credentials.region);
      setResult(queryResult);
      toast.success('Query executed successfully');
    } catch (e: any) {
      const msg = e.message || 'Query execution failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsRunning(false);
    }
  }, [sql, database, outputLocation, credentials]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Terminal className="h-6 w-6 text-primary" />
          Live Query Execution
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Run SQL queries directly on Amazon Athena using your IAM credentials.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Database</label>
          <Input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="default" className="border-border bg-muted font-mono text-sm" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">S3 Output Location</label>
          <Input value={outputLocation} onChange={(e) => setOutputLocation(e.target.value)} placeholder="s3://your-bucket/athena-results/" className="border-border bg-muted font-mono text-sm" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">SQL Query</h2>
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">Live Execution</Badge>
        </div>
        <Textarea value={sql} onChange={(e) => setSql(e.target.value)} placeholder="SELECT * FROM your_table LIMIT 10;" className="min-h-[140px] resize-none rounded-lg border-border bg-muted font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary" />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Queries run with your IAM credentials directly.</p>
          <Button onClick={handleExecute} disabled={!sql.trim() || isRunning || !credentials} className="bg-primary text-primary-foreground glow-primary hover:opacity-90">
            {isRunning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
            {isRunning ? 'Running…' : 'Execute Query'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Query Failed</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { icon: CheckCircle2, label: 'Status', value: result.state, color: 'text-green-400' },
              { icon: Clock, label: 'Execution Time', value: formatMs(result.executionTimeMs), color: 'text-primary' },
              { icon: HardDrive, label: 'Data Scanned', value: formatBytes(result.dataScannedBytes), color: 'text-primary' },
              { icon: Database, label: 'Est. Cost', value: estimateCost(result.dataScannedBytes), color: 'text-amber-400' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  {label}
                </div>
                <p className="text-lg font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-secondary">
                  <tr>
                    {result.columns.map((col, i) => (
                      <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 ? (
                    <tr><td colSpan={result.columns.length} className="px-4 py-8 text-center text-muted-foreground">No results returned</td></tr>
                  ) : (
                    result.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-border hover:bg-muted/50 transition-colors">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-4 py-2 text-foreground whitespace-nowrap">{cell || <span className="text-muted-foreground italic">null</span>}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border bg-secondary/50 px-4 py-2 text-xs text-muted-foreground">
              {result.rows.length} row{result.rows.length !== 1 ? 's' : ''} • Query ID: {result.queryExecutionId}
            </div>
          </div>
        </div>
      )}

      {!result && !error && !isRunning && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Database className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">Ready to execute</p>
          <p className="mt-1 text-sm text-muted-foreground/60">Enter a SQL query and click Execute to run it on Athena</p>
        </div>
      )}
    </div>
  );
}
