import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.02]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-slate-200/70 pb-4">
      <div>
        <h1 className="text-[1.6rem] font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function VerdictBadge({ verdict }: { verdict: 'PASS' | 'FAIL' | 'NA' | null | undefined }) {
  if (!verdict) return <span className="text-xs text-slate-400">—</span>;
  const styles: Record<string, string> = {
    PASS: 'bg-emerald-100 text-emerald-700',
    FAIL: 'bg-rose-100 text-rose-700',
    NA: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', styles[verdict])}>
      {verdict}
    </span>
  );
}

export function StatCard({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <Card className="group relative overflow-hidden p-5 transition hover:shadow-md">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={clsx('mt-2 text-3xl font-bold tracking-tight tabular-nums', accent ?? 'text-slate-900')}>{value}</div>
    </Card>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  disabled?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/30',
    outline: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300/50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500/30',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${Math.round(n * 100)}%`;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm text-slate-600"
    >
      <span
        className={clsx(
          'relative inline-flex h-5 w-9 items-center rounded-full transition',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          className={clsx(
            'inline-block h-4 w-4 transform rounded-full bg-white transition',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
      {label}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-slate-200', className)} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

/** Pass-rate health color: red < 70, amber < 90, green ≥ 90. */
export function healthColor(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return 'text-slate-900';
  if (rate >= 0.9) return 'text-emerald-600';
  if (rate >= 0.7) return 'text-amber-600';
  return 'text-rose-600';
}

export function ScorePill({ score, verdict }: { score: number | null; verdict: 'PASS' | 'FAIL' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        verdict === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
      )}
    >
      {verdict}
      {score !== null && <span className="opacity-70">· {Math.round(score * 100)}</span>}
    </span>
  );
}

export function fmtDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
