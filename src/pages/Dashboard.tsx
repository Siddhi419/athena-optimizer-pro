import { Database, Search, BarChart3, History, TrendingDown, Zap, DollarSign, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const stats = [
  { label: 'Queries Analyzed', value: '0', icon: Search, color: 'text-primary' },
  { label: 'Total Savings', value: '$0.00', icon: DollarSign, color: 'text-success' },
  { label: 'Avg. Reduction', value: '0%', icon: TrendingDown, color: 'text-info' },
  { label: 'Avg. Time Saved', value: '0s', icon: Clock, color: 'text-warning' },
];

const quickActions = [
  { title: 'Analyze a Query', description: 'Paste SQL and get instant optimization suggestions', icon: Search, route: '/analyzer' },
  { title: 'View Results', description: 'See detailed analysis and performance comparisons', icon: BarChart3, route: '/results' },
  { title: 'Query History', description: 'Browse and revisit previously analyzed queries', icon: History, route: '/history' },
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8 p-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome to Athena Query Optimizer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Intelligent SQL optimization for Amazon Athena — reduce costs and improve performance.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${s.color}`} />
                <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground">{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.title}
                onClick={() => navigate(action.route)}
                className="group rounded-xl border border-border bg-card p-6 text-left transition-all hover:border-primary/40 hover:glow-primary"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground group-hover:text-primary transition-colors">{action.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tip */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="font-medium text-foreground">Pro Tip</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start by analyzing a query in the <span className="text-primary font-medium cursor-pointer" onClick={() => navigate('/analyzer')}>Query Analyzer</span>. 
              Use partition filters and avoid SELECT * to save up to 90% on Athena costs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
