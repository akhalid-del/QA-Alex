import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CriterionVerdict, Utterance } from '@qa/shared/types';
import { computeVerdict } from '@qa/shared/scorecard';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Button, Card, ErrorState, PageHeader, ScorePill, Skeleton, Spinner, SuccessBurst, Toggle, VerdictBadge, fmtDate, fmtDuration, pct } from '../components/ui';

interface CriterionResult {
  id: string;
  criterionId: string;
  aiVerdict: CriterionVerdict;
  verdict: CriterionVerdict;
  evidenceQuote: string;
  evidenceTimestampMs: number | null;
  aiRationale: string;
  humanOverride: boolean;
}
interface Criterion {
  id: string;
  code: string;
  title: string;
  guidance: string;
  category: string;
  weight: number;
  deduction: number;
  autoFail: boolean;
}
interface Dispute {
  id: string;
  reason: string;
  status: 'OPEN' | 'UPHELD' | 'OVERTURNED';
  resolution: string | null;
}
interface Evaluation {
  id: string;
  aiVerdict: 'PASS' | 'FAIL';
  finalVerdict: 'PASS' | 'FAIL';
  finalScore: number | null;
  autoFailTriggered: boolean;
  summary: string;
  reviewed: boolean;
  scorecard: {
    id: string;
    name: string;
    scoringMode: 'DEDUCTION' | 'WEIGHTED';
    startingScore: number;
    passThreshold: number;
    criteria: Criterion[];
  };
  criterionResults: CriterionResult[];
  disputes: Dispute[];
  reviews: { id: string; note: string | null; reviewer: { name: string }; createdAt: string }[];
}
interface Detail {
  id: string;
  agent: { name: string } | null;
  queue: string | null;
  direction: string;
  startedAt: string;
  durationSec: number;
  status: string;
  statusError: string | null;
  manual: boolean;
  recordingUrl: string | null;
  transcript: { utterances: Utterance[]; fullText: string; redactionApplied: boolean } | null;
  evaluation: Evaluation | null;
}

const IN_PROGRESS_STATUSES = ['INGESTED', 'TRANSCRIBING', 'TRANSCRIBED', 'SCORING'];

const VERDICTS: CriterionVerdict[] = ['PASS', 'FAIL', 'NA'];

export function CallReview() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['interaction', id],
    queryFn: () => api.get<Detail>(`/interactions/${id}`),
  });
  const evaluation = data?.evaluation ?? null;
  const editable = can('evaluation:review');

  const [overrides, setOverrides] = useState<Record<string, CriterionVerdict>>({});
  const [note, setNote] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [burst, setBurst] = useState(false);
  const [focused, setFocused] = useState(0);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const utteranceRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (evaluation) setOverrides(Object.fromEntries(evaluation.criterionResults.map((r) => [r.id, r.verdict])));
  }, [evaluation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const criteriaById = useMemo(
    () => new Map((evaluation?.scorecard.criteria ?? []).map((c) => [c.id, c])),
    [evaluation],
  );

  // Live provisional score from current overrides.
  const live = useMemo(() => {
    if (!evaluation) return null;
    const inputs = evaluation.criterionResults.map((r) => {
      const c = criteriaById.get(r.criterionId)!;
      return { weight: c.weight, deduction: c.deduction, autoFail: c.autoFail, verdict: overrides[r.id] ?? r.verdict };
    });
    return computeVerdict(inputs, {
      mode: evaluation.scorecard.scoringMode,
      passThreshold: evaluation.scorecard.passThreshold,
      startingScore: evaluation.scorecard.startingScore,
    });
  }, [evaluation, overrides, criteriaById]);

  // Group results by category; fatal categories pinned first.
  const groups = useMemo(() => {
    if (!evaluation) return [] as { category: string; fatal: boolean; results: CriterionResult[] }[];
    const map = new Map<string, CriterionResult[]>();
    for (const r of evaluation.criterionResults) {
      const c = criteriaById.get(r.criterionId);
      const cat = c?.category ?? 'Other';
      (map.get(cat) ?? map.set(cat, []).get(cat)!).push(r);
    }
    const arr = [...map.entries()].map(([category, results]) => ({
      category,
      fatal: results.some((r) => criteriaById.get(r.criterionId)?.autoFail),
      results,
    }));
    arr.sort((a, b) => (a.fatal === b.fatal ? a.category.localeCompare(b.category) : a.fatal ? -1 : 1));
    return arr;
  }, [evaluation, criteriaById]);

  // Flat list (respecting onlyIssues) for keyboard navigation.
  const flatResults = useMemo(() => {
    const all = groups.flatMap((g) => g.results);
    return onlyIssues ? all.filter((r) => (overrides[r.id] ?? r.verdict) === 'FAIL') : all;
  }, [groups, onlyIssues, overrides]);

  function highlightEvidence(r: CriterionResult) {
    if (!data?.transcript) return;
    const utt = data.transcript.utterances;
    let idx = r.evidenceQuote
      ? utt.findIndex((u) => u.text.includes(r.evidenceQuote.replace(/[“”"]/g, '').trim().slice(0, 30)))
      : -1;
    if (idx < 0 && r.evidenceTimestampMs != null) {
      idx = utt.findIndex((u) => r.evidenceTimestampMs! >= u.startMs && r.evidenceTimestampMs! <= u.endMs);
    }
    if (idx >= 0) {
      setHighlightIdx(idx);
      utteranceRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  const review = useMutation({
    mutationFn: () =>
      api.post(`/evaluations/${evaluation!.id}/review`, {
        note: note || undefined,
        criteria: evaluation!.criterionResults
          .filter((r) => overrides[r.id] !== r.verdict || r.verdict !== r.aiVerdict)
          .map((r) => ({ criterionResultId: r.id, verdict: overrides[r.id] ?? r.verdict })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interaction', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['interactions'] });
      setBurst(true);
      toast('success', 'Review saved');
    },
    onError: () => toast('error', 'Failed to save review'),
  });

  const [disputeReason, setDisputeReason] = useState('');
  const dispute = useMutation({
    mutationFn: () => api.post(`/evaluations/${evaluation!.id}/dispute`, { reason: disputeReason }),
    onSuccess: () => {
      setDisputeReason('');
      qc.invalidateQueries({ queryKey: ['interaction', id] });
      toast('success', 'Dispute submitted');
    },
    onError: () => toast('error', 'Failed to submit dispute'),
  });
  const resolveDispute = useMutation({
    mutationFn: (vars: { disputeId: string; status: 'UPHELD' | 'OVERTURNED' }) =>
      api.post(`/evaluations/disputes/${vars.disputeId}/resolve`, { status: vars.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interaction', id] });
      toast('success', 'Dispute resolved');
    },
  });

  // Drive a manually-added call through transcribe → score, one step per poll.
  const advance = useMutation({
    mutationFn: () => api.post<{ status: string; statusError?: string }>(`/interactions/${id}/advance`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interaction', id] }),
  });
  useEffect(() => {
    if (!data?.manual || !can('interaction:create')) return;
    if (!IN_PROGRESS_STATUSES.includes(data.status)) return;
    const t = setInterval(() => advance.mutate(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status, data?.manual, id]);

  const nextUnreviewed = useMutation({
    mutationFn: () => api.get<{ items: { id: string }[] }>(`/interactions?status=SCORED&pageSize=1`),
    onSuccess: (r) => {
      const next = r.items.find((x) => x.id !== id);
      if (next) navigate(`/interactions/${next.id}`);
      else toast('info', 'No more calls awaiting review');
    },
  });

  function setVerdict(r: CriterionResult, v: CriterionVerdict) {
    setOverrides((o) => ({ ...o, [r.id]: v }));
  }

  // Keyboard: J/K navigate, P/F/N grade focused, I toggles issues.
  useEffect(() => {
    if (!editable) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === 'j') setFocused((f) => Math.min(flatResults.length - 1, f + 1));
      else if (key === 'k') setFocused((f) => Math.max(0, f - 1));
      else if (key === 'i') setOnlyIssues((v) => !v);
      else if (['p', 'f', 'n'].includes(key)) {
        const r = flatResults[focused];
        if (r) setVerdict(r, key === 'p' ? 'PASS' : key === 'f' ? 'FAIL' : 'NA');
      } else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editable, flatResults, focused]);

  useEffect(() => {
    const r = flatResults[focused];
    if (r) highlightEvidence(r);
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Skeleton className="h-96 lg:col-span-3" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  if (error || !data)
    return (
      <Card>
        <ErrorState title="Couldn’t load this call" onRetry={() => qc.invalidateQueries({ queryKey: ['interaction', id] })} />
      </Card>
    );

  return (
    <div>
      {burst && <SuccessBurst message="Review saved" onDone={() => setBurst(false)} />}
      <PageHeader
        title={`Call — ${data.agent?.name ?? 'Unknown agent'}`}
        subtitle={`${fmtDate(data.startedAt)} · ${data.queue ?? 'No queue'} · ${data.direction} · ${fmtDuration(data.durationSec)}`}
        actions={
          <div className="flex items-center gap-3">
            {editable && evaluation && (
              <Button variant="outline" onClick={() => nextUnreviewed.mutate()}>
                Next unreviewed →
              </Button>
            )}
            <Link to="/interactions" className="text-sm text-brand-600 hover:underline">
              ← Calls
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Transcript */}
        <div className="lg:col-span-3">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Recording & transcript</h2>
              {data.transcript?.redactionApplied && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">PII redacted</span>
              )}
            </div>
            {data.recordingUrl ? (
              <audio controls src={data.recordingUrl} className="mb-4 w-full" />
            ) : (
              <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                No audio for this call (demo data or recording not yet ingested).
              </div>
            )}
            {data.transcript ? (
              <div className="max-h-[560px] space-y-3 overflow-y-auto pr-2">
                {data.transcript.utterances.map((u, i) => (
                  <div
                    key={i}
                    ref={(el) => (utteranceRefs.current[i] = el)}
                    className={
                      'flex gap-3 rounded-lg p-1 transition ' + (highlightIdx === i ? 'bg-amber-50 ring-1 ring-amber-200' : '')
                    }
                  >
                    <span
                      className={
                        'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ' +
                        (u.speaker === 'AGENT'
                          ? 'bg-brand-100 text-brand-700'
                          : u.speaker === 'CUSTOMER'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-500')
                      }
                    >
                      {u.speaker}
                    </span>
                    <p className="text-sm text-slate-700">{u.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">No transcript yet.</div>
            )}
          </Card>
        </div>

        {/* Evaluation */}
        <div className="lg:col-span-2 space-y-6">
          {!evaluation ? (
            <ProgressCard data={data} onCheckNow={() => advance.mutate()} checking={advance.isPending} />
          ) : (
            <>
              {/* Sticky score header */}
              <Card className="sticky top-4 z-10 p-5">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">AI evaluation</h2>
                  {live && <ScorePill score={live.score} verdict={live.verdict} />}
                </div>
                <p className="mb-3 text-sm text-slate-600">{evaluation.summary}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>
                    Live score: <b className="text-slate-700">{live?.points ?? pct(live?.score)}</b>
                    {live?.points != null && `/${evaluation.scorecard.startingScore}`}
                  </span>
                  <span>Pass ≥ {pct(evaluation.scorecard.passThreshold)}</span>
                  {live?.autoFailTriggered && <span className="font-semibold text-rose-600">Auto-fail</span>}
                  {evaluation.reviewed && <span className="text-emerald-600">Reviewed</span>}
                </div>
                {editable && (
                  <div className="mt-3 flex items-center justify-between">
                    <Toggle checked={onlyIssues} onChange={setOnlyIssues} label="Only issues" />
                    <span className="text-[11px] text-slate-400">J/K move · P/F/N grade · I issues</span>
                  </div>
                )}
              </Card>

              {/* Criteria grouped by category */}
              {groups.map((g) => {
                const visible = onlyIssues
                  ? g.results.filter((r) => (overrides[r.id] ?? r.verdict) === 'FAIL')
                  : g.results;
                if (visible.length === 0) return null;
                const groupFails = g.results.filter((r) => (overrides[r.id] ?? r.verdict) === 'FAIL').length;
                return (
                  <Card key={g.category} className={'p-4 ' + (g.fatal ? 'border-rose-200' : '')}>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className={'text-xs font-semibold uppercase tracking-wide ' + (g.fatal ? 'text-rose-600' : 'text-slate-500')}>
                        {g.category}
                      </h3>
                      {groupFails > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                          {groupFails} issue{groupFails > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {visible.map((r) => {
                        const crit = criteriaById.get(r.criterionId);
                        const current = overrides[r.id] ?? r.verdict;
                        const isFocused = flatResults[focused]?.id === r.id;
                        return (
                          <div
                            key={r.id}
                            onClick={() => highlightEvidence(r)}
                            className={
                              'cursor-pointer rounded-lg border p-2 transition ' +
                              (isFocused ? 'border-brand-300 bg-brand-50/40' : 'border-transparent hover:bg-slate-50')
                            }
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-medium text-slate-800">
                                {crit?.title}
                                {crit?.autoFail && (
                                  <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                                    FATAL
                                  </span>
                                )}
                                {!crit?.autoFail && (
                                  <span className="ml-2 text-[10px] text-slate-400">−{crit?.deduction}</span>
                                )}
                              </div>
                              <VerdictBadge verdict={r.aiVerdict} />
                            </div>
                            {r.evidenceQuote && (
                              <blockquote className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500">
                                “{r.evidenceQuote}”
                              </blockquote>
                            )}
                            {r.aiRationale && <p className="mt-0.5 text-xs text-slate-500">{r.aiRationale}</p>}
                            {editable && (
                              <div className="mt-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {VERDICTS.map((v) => (
                                  <button
                                    key={v}
                                    onClick={() => setVerdict(r, v)}
                                    className={
                                      'rounded px-2 py-0.5 text-xs font-medium ' +
                                      (current === v
                                        ? v === 'PASS'
                                          ? 'bg-emerald-600 text-white'
                                          : v === 'FAIL'
                                            ? 'bg-rose-600 text-white'
                                            : 'bg-slate-500 text-white'
                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200')
                                    }
                                  >
                                    {v}
                                  </button>
                                ))}
                                {current !== r.aiVerdict && <span className="ml-1 text-[10px] text-amber-500">overridden</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}

              {editable && (
                <Card className="p-4">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Review note (optional)…"
                    className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    rows={2}
                  />
                  <Button onClick={() => review.mutate()} disabled={review.isPending} className="w-full">
                    {review.isPending ? 'Saving…' : evaluation.reviewed ? 'Update review' : 'Confirm & finalize'}
                  </Button>
                </Card>
              )}

              {/* Disputes */}
              <Card className="p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Disputes</h3>
                {evaluation.disputes.length === 0 && <p className="mb-2 text-xs text-slate-400">No disputes raised.</p>}
                {evaluation.disputes.map((d) => (
                  <div key={d.id} className="mb-2 rounded-lg bg-slate-50 p-3">
                    <span className="text-xs font-semibold text-slate-600">{d.status}</span>
                    <p className="mt-1 text-sm text-slate-700">{d.reason}</p>
                    {d.status === 'OPEN' && can('evaluation:resolve_dispute') && (
                      <div className="mt-2 flex gap-2">
                        <Button variant="outline" onClick={() => resolveDispute.mutate({ disputeId: d.id, status: 'OVERTURNED' })}>
                          Overturn
                        </Button>
                        <Button variant="outline" onClick={() => resolveDispute.mutate({ disputeId: d.id, status: 'UPHELD' })}>
                          Uphold
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {can('evaluation:dispute') && (
                  <div className="mt-2">
                    <textarea
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Explain why you disagree…"
                      className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      rows={2}
                    />
                    <Button variant="outline" disabled={!disputeReason || dispute.isPending} onClick={() => dispute.mutate()}>
                      Raise dispute
                    </Button>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressCard({ data, onCheckNow, checking }: { data: Detail; onCheckNow: () => void; checking: boolean }) {
  if (!data.manual) {
    return <Card className="p-6 text-center text-sm text-slate-400">This call has not been scored yet.</Card>;
  }

  const steps = [
    { key: 'INGESTED', label: 'Submitting for transcription' },
    { key: 'TRANSCRIBING', label: 'Transcribing the recording' },
    { key: 'TRANSCRIBED', label: 'Scoring against the rubric' },
  ];
  const order = ['INGESTED', 'TRANSCRIBING', 'TRANSCRIBED', 'SCORED'];
  const currentIdx = data.status === 'FAILED' ? -1 : Math.max(0, order.indexOf(data.status));

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">Processing this call</h2>
      <div className="space-y-3">
        {steps.map((s, i) => {
          const active = data.status !== 'FAILED' && currentIdx === i;
          return (
            <div key={s.key} className="flex items-center gap-3 text-sm">
              <span
                className={
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ' +
                  (i < currentIdx ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500')
                }
              >
                {i < currentIdx ? '✓' : i + 1}
              </span>
              <span className={i < currentIdx ? 'text-slate-400 line-through' : active ? 'font-medium text-slate-800' : 'text-slate-400'}>
                {s.label}
              </span>
              {active && !data.statusError && <Spinner />}
            </div>
          );
        })}
      </div>

      {data.statusError && (
        <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <b>{data.status === 'FAILED' ? 'Failed: ' : 'Waiting on config: '}</b>
          {data.statusError}
        </div>
      )}

      <Button variant="outline" className="mt-4 w-full" onClick={onCheckNow} disabled={checking}>
        {checking ? 'Checking…' : 'Check now'}
      </Button>
    </Card>
  );
}
