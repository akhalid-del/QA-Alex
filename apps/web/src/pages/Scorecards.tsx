import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Card, PageHeader, Spinner, pct } from '../components/ui';

interface ScorecardRow {
  id: string;
  name: string;
  version: number;
  active: boolean;
  passThreshold: number;
  description: string;
  _count: { criteria: number; evaluations: number };
}

export function Scorecards() {
  const { data, isLoading } = useQuery({
    queryKey: ['scorecards'],
    queryFn: () => api.get<ScorecardRow[]>('/scorecards'),
  });

  return (
    <div>
      <PageHeader
        title="Scorecards"
        subtitle="Quality guidelines used to score calls. Create a new version to update the rubric."
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data?.map((s) => (
            <Link key={s.id} to={`/scorecards/${s.id}`}>
              <Card className="p-5 transition hover:border-brand-300">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">{s.name}</h2>
                  {s.active ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">v{s.version}</span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{s.description || 'No description'}</p>
                <div className="mt-3 flex gap-4 text-xs text-slate-500">
                  <span>{s._count.criteria} criteria</span>
                  <span>Pass ≥ {pct(s.passThreshold)}</span>
                  <span>{s._count.evaluations} evaluations</span>
                  <span>v{s.version}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
