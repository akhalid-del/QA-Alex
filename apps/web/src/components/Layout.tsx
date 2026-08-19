import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { Permission } from '@qa/shared/rbac';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission?: Permission;
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    {path}
  </svg>
);

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: icon(<><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></>) },
  { to: '/interactions', label: 'Calls', icon: icon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />) },
  { to: '/scorecards', label: 'Scorecards', icon: icon(<><path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1z" /><rect x="4" y="4" width="16" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></>), permission: 'scorecard:read' },
  { to: '/agents', label: 'Agents & Teams', icon: icon(<><circle cx="9" cy="7" r="3" /><path d="M2 21v-1a6 6 0 0 1 12 0v1" /><path d="M17 11a3 3 0 1 0-2-5.24" /><path d="M22 21v-1a5 5 0 0 0-4-4.9" /></>), permission: 'agent:read' },
  { to: '/users', label: 'Users', icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" /></>), permission: 'user:manage' },
];

function initials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function Layout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((i) => !i.permission || can(i.permission));

  return (
    <div className="flex h-full bg-canvas">
      <aside className="flex w-64 flex-col bg-gradient-to-b from-brand-700 to-brand-900 text-white">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm font-bold text-white ring-1 ring-white/20">
            QA
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">RingCX QA</div>
            <div className="text-[11px] leading-tight text-white/55">Quality Monitoring</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-white text-brand-800 shadow-soft' : 'text-white/75 hover:bg-white/10 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx(isActive ? 'text-brand-600' : 'text-white/60 group-hover:text-white')}>{i.icon}</span>
                  {i.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white ring-1 ring-white/20">
              {initials(user?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user?.name}</div>
              <div className="text-[11px] text-white/55">{user?.role.replace('_', ' ')}</div>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="mt-1 w-full rounded-xl px-2 py-1.5 text-left text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-canvas flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-9">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
