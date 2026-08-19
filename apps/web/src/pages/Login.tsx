import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';
import { ApiError } from '../api/client';

const DEMO_ACCOUNTS = [
  ['admin@sublogical.com', 'Admin'],
  ['manager@sublogical.com', 'QA Manager'],
  ['analyst@sublogical.com', 'QA Analyst'],
  ['lead@sublogical.com', 'Team Lead'],
  ['agent@sublogical.com', 'Agent'],
];

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@sublogical.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-canvas flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-up rounded-3xl border border-slate-200/70 bg-paper p-8 shadow-lift">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-soft">
            Q
          </div>
          <div className="text-lg font-bold tracking-tight text-slate-900">QAssist</div>
          <div className="text-sm text-slate-400">Call Center Quality Monitoring</div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              required
            />
          </div>
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Demo accounts (password: password123)
          </div>
          <div className="space-y-1">
            {DEMO_ACCOUNTS.map(([e, role]) => (
              <button
                key={e}
                onClick={() => setEmail(e!)}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                <span>{e}</span>
                <span className="text-slate-400">{role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
