import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLES, type Role } from '@qa/shared/types';
import { api, ApiError } from '../api/client';
import { useToast } from '../components/Toast';
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { Field, Modal, SelectInput, TextInput } from '../components/form';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  teamId: string | null;
  agentId: string | null;
}
interface Team {
  id: string;
  name: string;
}
interface Agent {
  id: string;
  name: string;
}

const roleLabel = (r: string) => r.replace('_', ' ');

export function Users() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api.get<Team[]>('/agents/teams') });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/agents') });

  const toggleActive = useMutation({
    mutationFn: (u: UserRow) => api.patch(`/users/${u.id}`, { active: !u.active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast('success', 'User updated');
    },
    onError: () => toast('error', 'Update failed'),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Application accounts and roles"
        actions={<Button onClick={() => setCreating(true)}>+ Add user</Button>}
      />
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <EmptyState title="No users yet." hint="Add your first user to get started." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="whitespace-nowrap px-4 py-3">Name</th>
                <th className="whitespace-nowrap px-4 py-3">Email</th>
                <th className="whitespace-nowrap px-4 py-3">Role</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">● Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">● Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEditing(u)} className="mr-3 text-brand-600 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => toggleActive.mutate(u)} className="text-slate-400 hover:text-rose-600">
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {creating && (
        <UserModal
          title="Add user"
          teams={teams.data ?? []}
          agents={agents.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['users'] });
            toast('success', 'User created');
          }}
        />
      )}
      {editing && (
        <UserModal
          title="Edit user"
          user={editing}
          teams={teams.data ?? []}
          agents={agents.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['users'] });
            toast('success', 'User updated');
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  title,
  user,
  teams,
  agents,
  onClose,
  onSaved,
}: {
  title: string;
  user?: UserRow;
  teams: Team[];
  agents: Agent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'QA_ANALYST');
  const [teamId, setTeamId] = useState(user?.teamId ?? '');
  const [agentId, setAgentId] = useState(user?.agentId ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        role,
        teamId: teamId || null,
        agentId: agentId || null,
        ...(password ? { password } : {}),
      };
      if (isEdit) return api.patch(`/users/${user!.id}`, body);
      return api.post('/users', { ...body, email, password });
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Save failed'),
  });

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name || (!isEdit && (!email || password.length < 8))}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      {!isEdit && (
        <Field label="Email">
          <TextInput type="email" value={email} onChange={setEmail} placeholder="name@sublogical.com" />
        </Field>
      )}
      <Field label="Full name">
        <TextInput value={name} onChange={setName} placeholder="Jane Doe" />
      </Field>
      <Field label={isEdit ? 'Reset password (optional)' : 'Password'} hint="Minimum 8 characters">
        <TextInput type="password" value={password} onChange={setPassword} placeholder={isEdit ? 'Leave blank to keep' : '••••••••'} />
      </Field>
      <Field label="Role">
        <SelectInput value={role} onChange={(v) => setRole(v as Role)} options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))} />
      </Field>
      <Field label="Team (optional)">
        <SelectInput value={teamId} onChange={setTeamId} options={[{ value: '', label: 'No team' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
      </Field>
      <Field label="Linked agent (optional)" hint="For AGENT-role users, link to their RingCX agent record">
        <SelectInput value={agentId} onChange={setAgentId} options={[{ value: '', label: 'None' }, ...agents.map((a) => ({ value: a.id, label: a.name }))]} />
      </Field>
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    </Modal>
  );
}
