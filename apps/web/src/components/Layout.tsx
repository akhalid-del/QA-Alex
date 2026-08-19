import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { IconClipboardCheck, IconLayoutGrid, IconPhone, IconUser, IconUsersGroup } from '@tabler/icons-react';
import type { Permission } from '@qa/shared/rbac';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission?: Permission;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <IconLayoutGrid size={19} stroke={1.75} /> },
  { to: '/interactions', label: 'Calls', icon: <IconPhone size={19} stroke={1.75} /> },
  { to: '/scorecards', label: 'Scorecards', icon: <IconClipboardCheck size={19} stroke={1.75} />, permission: 'scorecard:read' },
  { to: '/agents', label: 'Agents & Teams', icon: <IconUsersGroup size={19} stroke={1.75} />, permission: 'agent:read' },
  { to: '/users', label: 'Users', icon: <IconUser size={19} stroke={1.75} />, permission: 'user:manage' },
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
