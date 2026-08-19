import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { IconAlertTriangle, IconInbox } from '@tabler/icons-react';

export function Card({
  children,
  className,
  hover,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-200/70 bg-paper shadow-soft',
        hover && 'transition duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div>
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 sm:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function VerdictBadge({ verdict }: { verdict: 'PASS' | 'FAIL' | 'NA' | null | undefined }) {
  if (!verdict) return <span className="text-xs text-slate-400">—</span>;
  const styles: Record<string, string> = {
    PASS: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
    FAIL: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
    NA: 'bg-slate-100 text-slate-500 ring-1 ring-slate-500/10',
  };
  return (
    <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', styles[verdict])}>
      {verdict}
    </span>
  );
}

export function StatCard({
  label,
  value,
  accent,
  icon,
  tint = 'brand',
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  icon?: ReactNode;
  tint?: 'brand' | 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const tints: Record<string, string> = {
    brand: 'bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 ring-1 ring-inset ring-brand-300/80 shadow-[0_5px_14px_-3px_rgba(59,111,224,0.45)]',
    emerald: 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 ring-1 ring-inset ring-emerald-300/80 shadow-[0_5px_14px_-3px_rgba(16,185,129,0.42)]',
    amber: 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 ring-1 ring-inset ring-amber-300/80 shadow-[0_5px_14px_-3px_rgba(217,119,6,0.42)]',
    rose: 'bg-gradient-to-br from-rose-100 to-rose-200 text-rose-700 ring-1 ring-inset ring-rose-300/80 shadow-[0_5px_14px_-3px_rgba(225,29,72,0.42)]',
    slate: 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 ring-1 ring-inset ring-slate-300/90 shadow-[0_5px_14px_-3px_rgba(100,116,139,0.32)]',
  };
  return (
    <Card hover className="group animate-fade-up p-5">
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
        {icon && (
          <span
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-xl transition duration-200 group-hover:-translate-y-1 group-hover:scale-110 group-hover:brightness-105',
              tints[tint],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className={clsx('mt-3 text-[2rem] font-bold leading-none tracking-tight tabular-nums', accent ?? 'text-slate-900')}>
        {value}
      </div>
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
    primary: 'bg-brand-600 text-white shadow-soft hover:bg-brand-700 focus-visible:ring-brand-500/30',
    outline: 'border border-slate-300 bg-paper text-slate-700 shadow-soft hover:bg-slate-50 focus-visible:ring-slate-300/50',
    ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300/40',
    danger: 'bg-rose-600 text-white shadow-soft hover:bg-rose-700 focus-visible:ring-rose-500/30',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
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

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm font-medium text-slate-600">
      <span className={clsx('relative inline-flex h-5 w-9 items-center rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300')}>
        <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
      {label}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-slate-200/70', className)} />;
}

const iconCircle = (children: ReactNode, tone: string) => (
  <div className={clsx('mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl', tone)}>{children}</div>
);

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="animate-fade-up px-6 py-14 text-center">
      {iconCircle(icon ?? <IconInbox size={24} stroke={1.6} className="text-slate-400" />, 'bg-slate-100')}
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {hint && <div className="mx-auto mt-1 max-w-sm text-xs text-slate-400">{hint}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', hint, onRetry }: { title?: string; hint?: string; onRetry?: () => void }) {
  return (
    <div className="animate-fade-up px-6 py-14 text-center">
      {iconCircle(<IconAlertTriangle size={24} stroke={1.7} className="text-rose-500" />, 'bg-rose-50')}
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {hint && <div className="mx-auto mt-1 max-w-sm text-xs text-slate-400">{hint}</div>}
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/** Brief celebratory burst shown on a successful action. Auto-dismisses. */
export function SuccessBurst({ message, onDone }: { message?: string; onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setGone(true);
      onDone?.();
    }, 1300);
    return () => clearTimeout(t);
  }, [onDone]);
  if (gone) return null;
  const colors = ['#3b6fe0', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
      <div className="relative flex flex-col items-center">
        <div className="relative">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: '50%',
                top: '50%',
                background: colors[i % colors.length],
                transform: `translate(${(i - 6) * 12}px, 0)`,
                animationDelay: `${(i % 4) * 40}ms`,
              }}
            />
          ))}
          <div className="flex h-16 w-16 animate-pop-in items-center justify-center rounded-full bg-emerald-500 shadow-lift">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="h-8 w-8">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        {message && <div className="mt-3 animate-fade-up rounded-full bg-slate-900/90 px-3 py-1 text-xs font-medium text-white">{message}</div>}
      </div>
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
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1',
        verdict === 'PASS' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-rose-600/20',
      )}
    >
      {verdict}
      {score !== null && <span className="opacity-70">· {Math.round(score * 100)}</span>}
    </span>
  );
}

export function fmtDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
