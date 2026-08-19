import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Button, Card, PageHeader, Skeleton } from '../components/ui';
import { Field, Modal, SelectInput, TextInput } from '../components/form';

interface Agent {
  id: string;
  name: string;
  username: string;
  rcAgentId: string;
  active: boolean;
  teamId: string | null;
  team: { id: string; name: string } | null;
  _count: { interactions: number };
}
interface Team {
  id: string;
  name: string;
  leadId?: string | null;
  lead: { id: string; name: string } | null;
  _count: { agents: number };
}

export function Agents() {
  const { can } = useAuth();
  const writable = can('agent:write');
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.get<Agent[]>('/agents') });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api.get<Team[]>('/agents/teams') });

  const [teamModal, setTeamModal] = useState<{ team?: Team } | null>(null);
  const [agentModal, setAgentModal] = useState<{ agent?: Agent } | null>(null);

  return (
    <div>
      <PageHeader title="Agents & Teams" subtitle="Manage the roster manually or let RingCX sync it" />

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">Teams</h2>
        {writable && (
          <Button variant="outline" onClick={() => setTeamModal({})}>
            + Add team
          </Button>
        )}
      </div>
      {teams.isLoading ? (
        <Skeleton className="mb-8 h-20 w-full" />
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-3">
          {teams.data?.map((t) => (
            <Card key={t.id} className="p-4 transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="font-medium text-slate-800">{t.name}</div>
                {writable && (
                  <button onClick={() => setTeamModal({ team: t })} className="text-xs text-brand-600 hover:underline">
                    Edit
                  </button>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Lead: {t.lead?.name ?? '—'} · {t._count.agents} agents
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-600">Agents</h2>
        {writable && (
          <Button variant="outline" onClick={() => setAgentModal({})}>
            + Add agent
          </Button>
        )}
      </div>
      {agents.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="whitespace-nowrap px-4 py-3">Name</th>
                <th className="whitespace-nowrap px-4 py-3">Username</th>
                <th className="whitespace-nowrap px-4 py-3">RingCX ID</th>
                <th className="whitespace-nowrap px-4 py-3">Team</th>
                <th className="whitespace-nowrap px-4 py-3">Calls</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {agents.data?.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{a.name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.username}</td>
                  <td className="px-4 py-3 text-slate-400">{a.rcAgentId}</td>
                  <td className="px-4 py-3 text-slate-600">{a.team?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{a._count.interactions}</td>
                  <td className="px-4 py-3">
                    {a.active ? (
                      <span className="text-xs text-emerald-600">● Active</span>
                    ) : (
                      <span className="text-xs text-slate-400">● Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {writable && (
                      <button onClick={() => setAgentModal({ agent: a })} className="text-brand-600 hover:underline">
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {teamModal && (
        <TeamModal
          team={teamModal.team}
          onClose={() => setTeamModal(null)}
          onSaved={() => {
            setTeamModal(null);
            teams.refetch();
          }}
        />
      )}
      {agentModal && (
        <AgentModal
          agent={agentModal.agent}
          teams={teams.data ?? []}
          onClose={() => setAgentModal(null)}
          onSaved={() => {
            setAgentModal(null);
            agents.refetch();
          }}
        />
      )}
    </div>
  );
}

function TeamModal({ team, onClose, onSaved }: { team?: Team; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isEdit = !!team;
  const [name, setName] = useState(team?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => (isEdit ? api.patch(`/agents/teams/${team!.id}`, { name }) : api.post('/agents/teams', { name })),
    onSuccess: () => {
      toast('success', isEdit ? 'Team updated' : 'Team created');
      onSaved();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Save failed'),
  });
  return (
    <Modal
      open
      title={isEdit ? 'Edit team' : 'Add team'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!name || save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <Field label="Team name">
        <TextInput value={name} onChange={setName} placeholder="Team Charlie" />
      </Field>
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    </Modal>
  );
}

function AgentModal({
  agent,
  teams,
  onClose,
  onSaved,
}: {
  agent?: Agent;
  teams: Team[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = !!agent;
  const [rcAgentId, setRcAgentId] = useState(agent?.rcAgentId ?? '');
  const [username, setUsername] = useState(agent?.username ?? '');
  const [name, setName] = useState(agent?.name ?? '');
  const [teamId, setTeamId] = useState(agent?.teamId ?? '');
  const [active, setActive] = useState(agent?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? api.patch(`/agents/${agent!.id}`, { username, name, teamId: teamId || null, active })
        : api.post('/agents', { rcAgentId, username, name, teamId: teamId || null, active }),
    onSuccess: () => {
      toast('success', isEdit ? 'Agent updated' : 'Agent created');
      onSaved();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Save failed'),
  });

  return (
    <Modal
      open
      title={isEdit ? 'Edit agent' : 'Add agent'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !username || (!isEdit && !rcAgentId)}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      {!isEdit && (
        <Field label="RingCX agent ID" hint="The agent's identifier in RingCX">
          <TextInput value={rcAgentId} onChange={setRcAgentId} placeholder="rc-3001" />
        </Field>
      )}
      <Field label="Full name">
        <TextInput value={name} onChange={setName} placeholder="Taylor Reed" />
      </Field>
      <Field label="Username">
        <TextInput value={username} onChange={setUsername} placeholder="t.reed" />
      </Field>
      <Field label="Team (optional)">
        <SelectInput value={teamId} onChange={setTeamId} options={[{ value: '', label: 'No team' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]} />
      </Field>
      <Field label="Status">
        <SelectInput
          value={active ? 'active' : 'inactive'}
          onChange={(v) => setActive(v === 'active')}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </Field>
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    </Modal>
  );
}
