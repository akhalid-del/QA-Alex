import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../api/client';
import { Button, Card, EmptyState, PageHeader, ScorePill, Skeleton, fmtDate, fmtDuration } from '../components/ui';

interface Row {
  id: string;
  agent: { id: string; name: string } | null;
  queue: string | null;
  direction: string;
  startedAt: string;
  durationSec: number;
  sampled: boolean;
  status: string;
  evaluation: { id: string; finalVerdict: 'PASS' | 'FAIL'; finalScore: number | null; reviewed: boolean } | null;
}
interface ListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: Row[];
}
interface Agent {
  id: string;
  name: string;
}

export function Interactions() {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'all' | 'needsReview'>('needsReview');
  const [verdict, setVerdict] = useState('');
  const [agentId, setAgentId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const status = view === 'needsReview' ? 'SCORED' : '';

  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/agents') });

  const { data, isLoading } = useQuery({
    queryKey: ['interactions', page, status, verdict, agentId, from, to],
    queryFn: () =>
      api.get<ListResponse>(
        '/interactions' + qs({ page, pageSize: 25, status, verdict, agentId, from: dateParam(from), to: dateParam(to, true) }),
      ),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function reset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div>
      <PageHeader title="Calls" subtitle="Interactions ingested from RingCX" />

      {/* View toggle */}
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
        {(['needsReview', 'all'] as const).map((v) => (
          <button
            key={v}
            onClick={() => reset(setView)(v)}
            className={
              'rounded-md px-3 py-1.5 font-medium ' +
              (view === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50')
            }
          >
            {v === 'needsReview' ? 'Needs review' : 'All calls'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={agentId}
          onChange={(e) => reset(setAgentId)(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All agents</option>
          {agents.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={verdict}
          onChange={(e) => reset(setVerdict)(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">All verdicts</option>
          <option value="PASS">Pass</option>
          <option value="FAIL">Fail</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          From
          <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          To
          <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        {(agentId || verdict || from || to) && (
          <button
            onClick={() => {
              setAgentId('');
              setVerdict('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState title="No calls match these filters." hint="Try switching to All calls or clearing filters." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Queue</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{fmtDate(r.startedAt)}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.agent?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.queue ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDuration(r.durationSec)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.evaluation ? (
                      <div className="flex items-center gap-2">
                        <ScorePill score={r.evaluation.finalScore} verdict={r.evaluation.finalVerdict} />
                        {!r.evaluation.reviewed && <span className="text-xs text-amber-500">unreviewed</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">not scored</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.evaluation ? (
                      <Link to={`/interactions/${r.id}`} className="font-medium text-brand-600 hover:underline">
                        Review
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>{data?.total ?? 0} calls</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

/** date input (YYYY-MM-DD) → ISO; `end` pushes to end-of-day. */
function dateParam(d: string, end = false): string | undefined {
  if (!d) return undefined;
  return new Date(d + (end ? 'T23:59:59' : 'T00:00:00')).toISOString();
}
