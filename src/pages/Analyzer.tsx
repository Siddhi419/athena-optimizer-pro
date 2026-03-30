import { useState } from 'react';
import { analyzeQuery, AnalysisResult } from '@/lib/queryAnalyzer';
import SqlEditor from '@/components/SqlEditor';
import SuggestionsPanel from '@/components/SuggestionsPanel';
import ComparisonDashboard from '@/components/ComparisonDashboard';
import { Database } from 'lucide-react';

export default function Analyzer() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = () => {
    if (!query.trim()) return;
    const analysis = analyzeQuery(query);
    setResult(analysis);

    // Store in sessionStorage for Results page
    const stored = JSON.parse(sessionStorage.getItem('athena_results') || '[]');
    const entry = { id: crypto.randomUUID(), query: query.trim(), result: analysis, timestamp: new Date().toISOString() };
    sessionStorage.setItem('athena_results', JSON.stringify([entry, ...stored].slice(0, 50)));
    sessionStorage.setItem('athena_latest', JSON.stringify(entry));
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Query Analyzer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Paste your SQL query and get instant optimization suggestions.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <SqlEditor value={query} onChange={setQuery} onAnalyze={handleAnalyze} />
      </div>

      {result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <SuggestionsPanel issues={result.issues} />
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <ComparisonDashboard
              originalEstimate={result.originalEstimate}
              optimizedEstimate={result.optimizedEstimate}
              optimizedQuery={result.optimizedQuery}
            />
          </div>
        </div>
      )}

      {!result && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <Database className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">Enter a SQL query to get started</p>
          <p className="mt-1 text-sm text-muted-foreground/60">Try a sample query above or write your own</p>
        </div>
      )}
    </div>
  );
}
