import { useEffect, useState } from 'react';
import { AnalysisResult } from '@/lib/queryAnalyzer';
import ComparisonDashboard from '@/components/ComparisonDashboard';
import SuggestionsPanel from '@/components/SuggestionsPanel';
import { BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface StoredResult {
  id: string;
  query: string;
  result: AnalysisResult;
  timestamp: string;
}

export default function Results() {
  const [latest, setLatest] = useState<StoredResult | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const raw = sessionStorage.getItem('athena_latest');
    if (raw) setLatest(JSON.parse(raw));
  }, []);

  if (!latest) {
    return (
      <div className="flex flex-col items-center justify-center p-6 py-32 text-center">
        <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="text-lg font-medium text-muted-foreground">No results yet</p>
        <p className="mt-1 text-sm text-muted-foreground/60">Analyze a query first to see results here.</p>
        <Button className="mt-6" onClick={() => navigate('/analyzer')}>Go to Analyzer</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analysis Results</h1>
        <p className="mt-1 text-sm text-muted-foreground">Detailed breakdown of your latest query analysis.</p>
      </div>

      {/* Query Preview */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Analyzed Query</h2>
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm text-foreground">{latest.query}</pre>
        <p className="mt-2 text-xs text-muted-foreground">Analyzed at {new Date(latest.timestamp).toLocaleString()}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <SuggestionsPanel issues={latest.result.issues} />
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <ComparisonDashboard
            originalEstimate={latest.result.originalEstimate}
            optimizedEstimate={latest.result.optimizedEstimate}
            optimizedQuery={latest.result.optimizedQuery}
          />
        </div>
      </div>
    </div>
  );
}
