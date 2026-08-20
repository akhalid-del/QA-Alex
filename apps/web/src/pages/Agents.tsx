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
  const [importing, setImporting] = useState(false);

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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setImporting(true)}>
              ⬆ Import CSV
            </Button>
            <Button variant="outline" onClick={() => setAgentModal({})}>
              + Add agent
            </Button>
          </div>
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
      {importing && (
        <ImportAgentsModal
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            agents.refetch();
            teams.refetch();
          }}
        />
      )}
    </div>
  );
}

/** Minimal CSV parser: handles quoted fields, commas, and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row); }
  return rows;
}

interface ImportRow { name: string; team?: string; username?: string; rcAgentId?: string }

function ImportAgentsModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File | null) {
    setError(null);
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const grid = parseCsv(String(reader.result ?? ''));
        if (!grid.length) throw new Error('The file looks empty.');
        // Detect a header row and map columns by name; otherwise assume
        // column order: name, team, username, rcAgentId.
        const header = grid[0]!.map((h) => h.trim().toLowerCase());
        const hasHeader = header.includes('name');
        const idx = (k: string, fallback: number) => (hasHeader ? header.indexOf(k) : fallback);
        const iName = idx('name', 0);
        const iTeam = idx('team', 1);
        const iUser = idx('username', 2);
        const iRc = header.indexOf('rcagentid') >= 0 ? header.indexOf('rcagentid') : header.indexOf('ringcx id');
        const body = hasHeader ? grid.slice(1) : grid;
        const parsed: ImportRow[] = body
          .map((cols) => ({
            name: (cols[iName] ?? '').trim(),
            team: (cols[iTeam] ?? '').trim() || undefined,
            username: (cols[iUser] ?? '').trim() || undefined,
            rcAgentId: (iRc >= 0 ? (cols[iRc] ?? '').trim() : '') || undefined,
          }))
          .filter((r) => r.name);
        if (!parsed.length) throw new Error('No rows with a name were found.');
        setRows(parsed);
      } catch (e) {
        setRows([]);
        setError(e instanceof Error ? e.message : 'Could not read the file.');
      }
    };
    reader.readAsText(file);
  }

  const submit = useMutation({
    mutationFn: () => api.post<{ agentsCreated: number; teamsCreated: number; errors: { name: string; error: string }[] }>('/agents/import', { rows }),
    onSuccess: (r) => {
      const extra = r.errors.length ? `, ${r.errors.length} skipped` : '';
      toast('success', `Imported ${r.agentsCreated} agents · ${r.teamsCreated} new teams${extra}`);
      onDone();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Import failed'),
  });

  const teamCount = new Set(rows.map((r) => r.team).filter(Boolean)).size;

  return (
    <Modal
      open
      title="Import agents from CSV"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={!rows.length || submit.isPending}>
            {submit.isPending ? 'Importing…' : rows.length ? `Import ${rows.length} agents` : 'Import'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">
        Upload a CSV with a header row. Columns: <b className="text-slate-800">name</b> (required),{' '}
        <b className="text-slate-800">team</b>, <b className="text-slate-800">username</b>,{' '}
        <b className="text-slate-800">rcAgentId</b> (all optional). Teams are created automatically; blank IDs are generated.
      </p>
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
        name,team,username,rcAgentId<br />
        Taylor Reed,Team Alpha,,<br />
        Sam Cole,Team Alpha,,<br />
        Jordan Lee,Team Bravo,,
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        className="w-full rounded-xl border border-slate-300 bg-paper px-3.5 py-2.5 text-sm text-slate-700 shadow-soft file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
      />
      {rows.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
          Ready to import <b className="text-slate-800">{rows.length}</b> agents across{' '}
          <b className="text-slate-800">{teamCount || 'no'}</b> team(s) from <span className="text-slate-500">{fileName}</span>.
          <div className="mt-2 max-h-32 overflow-y-auto text-xs text-slate-400">
            {rows.slice(0, 8).map((r, i) => (
              <div key={i}>{r.name}{r.team ? ` · ${r.team}` : ''}</div>
            ))}
            {rows.length > 8 && <div>…and {rows.length - 8} more</div>}
          </div>
        </div>
      )}
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    </Modal>
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
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <Field label="Full name">
        <TextInput value={name} onChange={setName} placeholder="Taylor Reed" />
      </Field>
      {!isEdit && (
        <Field label="RingCX agent ID (optional)" hint="Leave blank during testing — we'll generate a placeholder you can replace once RingCX access is set up.">
          <TextInput value={rcAgentId} onChange={setRcAgentId} placeholder="Leave blank for now" />
        </Field>
      )}
      <Field label="Username (optional)" hint="Defaults to a slug of the name if left blank.">
        <TextInput value={username} onChange={setUsername} placeholder="Auto from name" />
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
