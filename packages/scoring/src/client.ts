import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { computeVerdict, type CriterionInput, type CriterionVerdict } from '@qa/shared';
import { buildSystemPrompt, buildUserPrompt, evaluationToolSchema } from './prompt';
import type { ScoredCriterion, ScoringInput, ScoringResult } from './types';

const ParsedEvaluation = z.object({
  summary: z.string().default(''),
  criteria: z
    .array(
      z.object({
        code: z.string(),
        verdict: z.enum(['PASS', 'FAIL', 'NA']),
        evidenceQuote: z.string().optional().default(''),
        evidenceTimestampMs: z.number().optional(),
        rationale: z.string().optional().default(''),
      }),
    )
    .default([]),
});

export interface ScoringClientOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Grades a transcript against a scorecard using Claude with a forced tool call
 * (structured output). Missing/extra criteria are reconciled against the
 * scorecard, then the final verdict is computed deterministically in code
 * (never trusting the model to do the score math).
 */
export class ScoringClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(opts: ScoringClientOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'claude-opus-4-8';
    this.maxTokens = opts.maxTokens ?? 8000;
  }

  async score(input: ScoringInput): Promise<ScoringResult> {
    const codes = input.scorecard.criteria.map((c) => c.code);
    const tool = evaluationToolSchema(codes);

    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      // `temperature` is deprecated/unsupported on some newer models (e.g.
      // claude-opus-4-8) and the API 400s if it's present at all. The forced
      // tool_choice already keeps output structured/consistent without it.
      system: buildSystemPrompt(input),
      tools: [tool as Anthropic.Tool],
      tool_choice: { type: 'tool', name: 'submit_evaluation' },
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!toolUse) throw new Error('Scoring model did not return a tool call');

    const parsed = ParsedEvaluation.parse(toolUse.input);
    const byCode = new Map(parsed.criteria.map((c) => [c.code, c]));

    // Reconcile: one ScoredCriterion per scorecard criterion (default NA).
    const scored: ScoredCriterion[] = input.scorecard.criteria.map((crit) => {
      const r = byCode.get(crit.code);
      return {
        code: crit.code,
        verdict: (r?.verdict ?? 'NA') as CriterionVerdict,
        evidenceQuote: r?.evidenceQuote ?? '',
        evidenceTimestampMs: r?.evidenceTimestampMs,
        rationale: r?.rationale ?? 'No result returned for this criterion.',
      };
    });

    // Deterministic verdict from the model's per-criterion calls.
    const inputs: CriterionInput[] = input.scorecard.criteria.map((crit, i) => ({
      weight: crit.weight,
      deduction: crit.deduction,
      autoFail: crit.autoFail,
      verdict: scored[i]!.verdict,
    }));
    const { verdict, score, points, autoFailTriggered } = computeVerdict(inputs, {
      mode: input.scorecard.scoringMode,
      passThreshold: input.scorecard.passThreshold,
      startingScore: input.scorecard.startingScore,
    });

    return {
      summary: parsed.summary,
      model: this.model,
      verdict,
      score,
      points,
      autoFailTriggered,
      criteria: scored,
    };
  }
}
