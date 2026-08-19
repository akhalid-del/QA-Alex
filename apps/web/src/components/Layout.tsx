import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import {
  IconClipboardCheck,
  IconLayoutGrid,
  IconMenu2,
  IconPhone,
  IconUser,
  IconUsersGroup,
  IconX,
} from '@tabler/icons-react';
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = NAV.filter((i) => !i.permission || can(i.permission));

  // The sidebar body is shared between the persistent desktop rail and the
  // mobile slide-in drawer. `onNavigate` lets the drawer close itself when a
  // link is tapped.
  const SidebarBody = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full w-64 flex-col bg-gradient-to-b from-brand-700 to-brand-900 text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm font-bold text-white ring-1 ring-white/20">
          Q
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-white">QAssist</div>
          <div className="text-[11px] leading-tight text-white/55">Quality Monitoring</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === '/'}
            onClick={onNavigate}
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
    </div>
  );

  return (
    <div className="flex h-full bg-canvas">
      {/* Persistent sidebar — desktop only */}
      <aside className="hidden md:block">
        <SidebarBody />
      </aside>

      {/* Slide-in drawer — mobile only */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 animate-fade-up shadow-lift">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute -right-11 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-soft"
            >
              <IconX size={18} />
            </button>
            <SidebarBody onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — mobile only */}
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
          >
            <IconMenu2 size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
              Q
            </div>
            <span className="text-sm font-semibold text-slate-900">QAssist</span>
          </div>
        </header>

        <main className="app-canvas flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-9">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
