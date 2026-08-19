import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReactNode } from 'react';
import { api, qs } from '../api/client';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, healthColor, pct } from '../components/ui';

const ic = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    {path}
  </svg>
);
const ICON = {
  rate: ic(<><path d="M20 6L9 17l-5-5" /></>),
  calls: ic(<path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.09 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z" />),
  clock: ic(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  chat: ic(<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />),
  alert: ic(<><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
  minus: ic(<><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>),
  check: ic(<><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  ban: ic(<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>),
};

interface Summary {
  kpis: {
    totalScored: number;
    passed: number;
    failed: number;
    passRate: number;
    reviewed: number;
    pendingReview: number;
    autoFails: number;
    openDisputes: number;
    fatalFails: number;
    nonFatalFails: number;
  };
  trend: { date: string; passRate: number; total: number }[];
  agents: { agentId: string; name: string; passRate: number; total: number }[];
  failingCriteria: { code: string; title: string; fails: number; autoFail: boolean }[];
}
interface Agent {
  id: string;
  name: string;
}
interface Team {
  id: string;
  name: string;
}

export function Dashboard() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [teamId, setTeamId] = useState('');
  const [agentId, setAgentId] = useState('');

  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/agents') });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api.get<Team[]>('/agents/teams') });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', from, to, teamId, agentId],
    queryFn: () =>
      api.get<Summary>(
        '/dashboard/summary' +
          qs({ from: iso(from), to: iso(to, true), teamId, agentId }),
      ),
  });

  return (
    <div>
      <PageHeader title="Quality Dashboard" subtitle="Pass/fail performance across scored calls" />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">All teams</option>
          {teams.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">All agents</option>
          {agents.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        {(from || to || teamId || agentId) && (
          <button
            onClick={() => {
              setFrom('');
              setTo('');
              setTeamId('');
              setAgentId('');
            }}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : error || !data ? (
        <Card>
          <ErrorState title="Couldn’t load the dashboard" hint="The API may be waking up — give it a moment." onRetry={() => refetch()} />
        </Card>
      ) : (
        <DashboardBody data={data} />
      )}
    </div>
  );
}

function DashboardBody({ data }: { data: Summary }) {
  const { kpis, trend, agents, failingCriteria } = data;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Pass rate" value={pct(kpis.passRate)} accent={healthColor(kpis.passRate)} icon={ICON.rate} tint={kpis.passRate >= 0.9 ? 'emerald' : kpis.passRate >= 0.7 ? 'amber' : 'rose'} />
        <StatCard label="Calls scored" value={kpis.totalScored} icon={ICON.calls} tint="brand" />
        <StatCard label="Pending review" value={kpis.pendingReview} accent={kpis.pendingReview ? 'text-amber-600' : 'text-slate-900'} icon={ICON.clock} tint="amber" />
        <StatCard label="Open disputes" value={kpis.openDisputes} accent={kpis.openDisputes ? 'text-rose-600' : 'text-slate-900'} icon={ICON.chat} tint={kpis.openDisputes ? 'rose' : 'slate'} />
      </div>

      {/* Fatal vs non-fatal */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Fatal failures" value={kpis.fatalFails} accent="text-rose-600" icon={ICON.alert} tint="rose" />
        <StatCard label="Non-fatal failures" value={kpis.nonFatalFails} accent="text-amber-600" icon={ICON.minus} tint="amber" />
        <StatCard label="Reviewed" value={kpis.reviewed} accent="text-emerald-600" icon={ICON.check} tint="emerald" />
        <StatCard label="Auto-failed calls" value={kpis.autoFails} accent="text-rose-600" icon={ICON.ban} tint="rose" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Pass rate trend</h2>
          {trend.length === 0 ? (
            <EmptyState title="No scored calls in range yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend.map((t) => ({ ...t, passRatePct: Math.round(t.passRate * 100) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="passRatePct" stroke="#2f59c4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Pass rate by agent</h2>
          {agents.length === 0 ? (
            <EmptyState title="No scored calls in range yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={agents.map((a) => ({ ...a, passRatePct: Math.round(a.passRate * 100) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="passRatePct" fill="#3b6fe0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Top failing criteria</h2>
        {failingCriteria.length === 0 ? (
          <EmptyState title="No failing criteria in range." />
        ) : (
          <div className="space-y-2">
            {failingCriteria.map((c) => {
              const max = failingCriteria[0]!.fails || 1;
              return (
                <div key={c.code} className="flex items-center gap-3">
                  <div className="flex w-56 items-center gap-2 truncate text-sm text-slate-600" title={c.title}>
                    {c.autoFail && (
                      <span className="shrink-0 rounded bg-rose-50 px-1 py-0.5 text-[9px] font-semibold text-rose-600">FATAL</span>
                    )}
                    <span className="truncate">{c.title}</span>
                  </div>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                    <div className={'h-full ' + (c.autoFail ? 'bg-rose-500' : 'bg-amber-400')} style={{ width: `${(c.fails / max) * 100}%` }} />
                  </div>
                  <div className="w-8 text-right text-sm font-medium text-slate-700">{c.fails}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

function iso(d: string, end = false): string | undefined {
  if (!d) return undefined;
  return new Date(d + (end ? 'T23:59:59' : 'T00:00:00')).toISOString();
}
