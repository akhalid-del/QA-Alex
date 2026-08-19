import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthUser } from '@qa/shared/types';
import type { Permission } from '@qa/shared/rbac';
import { api, setToken } from '../api/client';

interface AuthState {
  user: AuthUser | null;
  permissions: Permission[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (p: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

interface MeResponse {
  user: AuthUser;
  permissions: Permission[];
}
interface LoginResponse extends MeResponse {
  token: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session on load.
    api
      .get<MeResponse>('/auth/me')
      .then((r) => {
        setUser(r.user);
        setPermissions(r.permissions);
      })
      .catch(() => {
        setUser(null);
        setPermissions([]);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const r = await api.post<LoginResponse>('/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
    setPermissions(r.permissions);
  }

  function logout() {
    setToken(null);
    setUser(null);
    setPermissions([]);
  }

  const can = (p: Permission) => permissions.includes(p);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
