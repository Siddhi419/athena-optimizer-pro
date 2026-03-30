import { useEffect, useState } from 'react';
import { AnalysisResult } from '@/lib/queryAnalyzer';
import { History, Clock, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StoredResult {
  id: string;
  query: string;
  result: AnalysisResult;
  timestamp: string;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<StoredResult[]>([]);

  useEffect(() => {
    const raw = sessionStorage.getItem('athena_results');
    if (raw) setEntries(JSON.parse(raw));
  }, []);

  const handleClear = () => {
    sessionStorage.removeItem('athena_results');
    setEntries([]);
  };

  const handleSelect = (entry: StoredResult) => {
    sessionStorage.setItem('athena_latest', JSON.stringify(entry));
    window.location.href = '/results';
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Query History</h1>
          <p className="mt-1 text-sm text-muted-foreground">Browse and revisit your previously analyzed queries.</p>
        </div>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Clear All
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <History className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">No history yet</p>
          <p className="mt-1 text-sm text-muted-foreground/60">Analyzed queries will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const savings = entry.result.originalEstimate.dataScannedGB > 0
              ? Math.round(((entry.result.originalEstimate.dataScannedGB - entry.result.optimizedEstimate.dataScannedGB) / entry.result.originalEstimate.dataScannedGB) * 100)
              : 0;

            return (
              <button
                key={entry.id}
                onClick={() => handleSelect(entry)}
                className="w-full rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/40 hover:glow-primary"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <pre className="truncate font-mono text-sm text-foreground">{entry.query}</pre>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                      {entry.result.issues.length > 0 && (
                        <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                          {entry.result.issues.length} issues
                        </span>
                      )}
                      {savings > 0 && (
                        <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
                          {savings}% savings
                        </span>
                      )}
                    </div>
                  </div>
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
