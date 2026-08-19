import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Button, Card, PageHeader, Spinner } from '../components/ui';

interface Criterion {
  id?: string;
  code: string;
  title: string;
  guidance: string;
  category: string;
  weight: number;
  deduction: number;
  autoFail: boolean;
  order: number;
}
interface Scorecard {
  id: string;
  name: string;
  description: string;
  version: number;
  scoringMode: 'DEDUCTION' | 'WEIGHTED';
  startingScore: number;
  passThreshold: number;
  referenceScript: string;
  criteria: Criterion[];
}

export function ScorecardDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const toast = useToast();
  const editable = can('scorecard:write');

  const { data, isLoading } = useQuery({
    queryKey: ['scorecard', id],
    queryFn: () => api.get<Scorecard>(`/scorecards/${id}`),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [threshold, setThreshold] = useState(0.9);
  const [scoringMode, setScoringMode] = useState<'DEDUCTION' | 'WEIGHTED'>('DEDUCTION');
  const [startingScore, setStartingScore] = useState(100);
  const [referenceScript, setReferenceScript] = useState('');
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setDescription(data.description);
      setThreshold(data.passThreshold);
      setScoringMode(data.scoringMode);
      setStartingScore(data.startingScore);
      setReferenceScript(data.referenceScript ?? '');
      setCriteria(data.criteria.map((c) => ({ ...c })));
    }
  }, [data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () =>
      api.post<Scorecard>('/scorecards', {
        name,
        description,
        scoringMode,
        startingScore,
        passThreshold: threshold,
        referenceScript,
        criteria: criteria.map((c, i) => ({
          code: c.code,
          title: c.title,
          guidance: c.guidance,
          category: c.category,
          weight: c.weight,
          deduction: c.deduction,
          autoFail: c.autoFail,
          order: i,
        })),
      }),
    onSuccess: (created) => {
      setSavedMsg(`Saved as v${created.version}.`);
      qc.invalidateQueries({ queryKey: ['scorecards'] });
      toast('success', `Scorecard saved as v${created.version}`);
    },
    onError: () => toast('error', 'Failed to save scorecard'),
  });

  function update(i: number, patch: Partial<Criterion>) {
    setCriteria((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addCriterion() {
    setCriteria((cs) => [
      ...cs,
      { code: `C${cs.length + 1}`, title: '', guidance: '', category: 'General', weight: 1, deduction: 5, autoFail: false, order: cs.length },
    ]);
  }
  function remove(i: number) {
    setCriteria((cs) => cs.filter((_, idx) => idx !== i));
  }

  if (isLoading || !data) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={`Version ${data.version}${editable ? ' · editing creates a new active version' : ' · read-only'}`}
      />

      <Card className="mb-6 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
            <input
              value={name}
              disabled={!editable}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Pass threshold ({Math.round(threshold * 100)}%)
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(threshold * 100)}
              disabled={!editable}
              onChange={(e) => setThreshold(Number(e.target.value) / 100)}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Scoring mode</label>
            <select
              value={scoringMode}
              disabled={!editable}
              onChange={(e) => setScoringMode(e.target.value as 'DEDUCTION' | 'WEIGHTED')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            >
              <option value="DEDUCTION">Deduction (start at N, subtract mistakes)</option>
              <option value="WEIGHTED">Weighted pass-ratio</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Starting score</label>
            <input
              type="number"
              min={1}
              value={startingScore}
              disabled={!editable || scoringMode !== 'DEDUCTION'}
              onChange={(e) => setStartingScore(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
            <textarea
              value={description}
              disabled={!editable}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              rows={2}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Approved script (the AI grades adherence against this)
            </label>
            <textarea
              value={referenceScript}
              disabled={!editable}
              onChange={(e) => setReferenceScript(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs disabled:bg-slate-50"
              rows={10}
              placeholder="Paste the word-for-word script (intro, questions, closing, no-statement)…"
            />
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {criteria.map((c, i) => (
          <Card key={i} className="p-4">
            <div className="grid grid-cols-12 gap-3">
              <input
                value={c.code}
                disabled={!editable}
                onChange={(e) => update(i, { code: e.target.value })}
                className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                placeholder="CODE"
              />
              <input
                value={c.title}
                disabled={!editable}
                onChange={(e) => update(i, { title: e.target.value })}
                className="col-span-6 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                placeholder="Criterion title"
              />
              <input
                value={c.category}
                disabled={!editable}
                onChange={(e) => update(i, { category: e.target.value })}
                className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                placeholder="Category"
              />
              {scoringMode === 'DEDUCTION' ? (
                <input
                  type="number"
                  min={0}
                  value={c.deduction}
                  disabled={!editable || c.autoFail}
                  onChange={(e) => update(i, { deduction: Number(e.target.value) })}
                  className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                  placeholder="− pts"
                  title="Points deducted if this mistake is committed"
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  value={c.weight}
                  disabled={!editable}
                  onChange={(e) => update(i, { weight: Number(e.target.value) })}
                  className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                  placeholder="Weight"
                />
              )}
            </div>
            <textarea
              value={c.guidance}
              disabled={!editable}
              onChange={(e) => update(i, { guidance: e.target.value })}
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs disabled:bg-slate-50"
              rows={2}
              placeholder="Guidance for the AI scorer…"
            />
            <div className="mt-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={c.autoFail}
                  disabled={!editable}
                  onChange={(e) => update(i, { autoFail: e.target.checked })}
                />
                Auto-fail (failing this fails the whole call)
              </label>
              {editable && (
                <button onClick={() => remove(i)} className="text-xs text-rose-500 hover:underline">
                  Remove
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {editable && (
        <div className="mt-4 flex items-center gap-3">
          <Button variant="outline" onClick={addCriterion}>
            + Add criterion
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || criteria.length === 0}>
            {save.isPending ? 'Saving…' : 'Save as new version'}
          </Button>
          {savedMsg && <span className="text-sm text-emerald-600">{savedMsg}</span>}
          {save.isError && <span className="text-sm text-rose-600">Save failed.</span>}
        </div>
      )}
    </div>
  );
}
