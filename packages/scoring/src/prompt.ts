import type { ScoringInput } from './types';

/**
 * Builds the system + user prompts for grading a call transcript. Pure and
 * unit-tested. The model is told each criterion is a POTENTIAL MISTAKE:
 *   FAIL = the mistake WAS committed (agent did the bad thing)
 *   PASS = compliant (mistake NOT committed)
 *   NA   = the rule did not apply to this call
 * and must ground every FAIL in a verbatim transcript quote.
 */
export function buildSystemPrompt(input: ScoringInput): string {
  const { scorecard } = input;
  const lines: string[] = [];
  lines.push(
    'You are a meticulous call-center Quality Assurance analyst for an outbound IHG member-satisfaction survey that ends by transferring the member to Holiday Inn Club Vacations (HICV) to hear a special vacation offer worth 500 IHG One Rewards points.',
    'You grade a single call transcript against (A) the approved word-for-word script and (B) a rubric of mistakes.',
    '',
    'GRADING RULES:',
    '- Each rubric item is a POTENTIAL MISTAKE. Return verdict FAIL if the agent COMMITTED that mistake, PASS if the agent was compliant, or NA if the rule could not apply to this call.',
    '- Judge ONLY from the transcript. Do not invent facts. If evidence is absent, prefer PASS for non-fatal items unless the script clearly required something that is missing.',
    '- For every FAIL, quote the exact words from the transcript in `evidenceQuote` (verbatim substring). For PASS/NA, `evidenceQuote` may be empty.',
    '- Fatal items are marked [FATAL]; be conservative — only FAIL a fatal item when the transcript clearly supports it.',
    '- "moment" is allowed ONLY for the transfer wait, never for how/when points are added. Points are earned by LISTENING to the offer after transfer — never for taking the survey, staying on hold, or added by the agent.',
    '- The call must disclose it "may be monitored and recorded" and must verify the member state where required.',
    '',
    '=== APPROVED SCRIPT ===',
    scorecard.referenceScript || '(no script provided)',
  );

  if (scorecard.dispositionRules) {
    lines.push(
      '',
      '=== DISPOSITION RULES ===',
      scorecard.dispositionRules,
      input.agentDisposition
        ? `The agent recorded this disposition: "${input.agentDisposition}". Compare it against the correct disposition you derive from the transcript, and grade the "Wrong disposition" criteria accordingly.`
        : 'No agent-recorded disposition was provided, so the "Wrong disposition" criteria cannot be verified — mark them NA.',
    );
  }

  lines.push('', '=== RUBRIC (grade every item; return exactly one result per code) ===');
  for (const c of scorecard.criteria) {
    lines.push(`- ${c.code}${c.autoFail ? ' [FATAL]' : ''} — ${c.title} :: ${c.guidance}`);
  }
  lines.push(
    '',
    'Call the `submit_evaluation` tool with: a short `summary`, and a `criteria` array containing one entry per rubric code above.',
  );
  return lines.join('\n');
}

export function buildUserPrompt(input: ScoringInput): string {
  const meta = [
    `Direction: ${input.direction}`,
    input.agentName ? `Agent: ${input.agentName}` : null,
    input.queue ? `Queue: ${input.queue}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
  return `Call metadata: ${meta}\n\n=== TRANSCRIPT ===\n${input.transcriptText}`;
}

/** JSON schema for the forced tool call (Anthropic tool use). */
export function evaluationToolSchema(codes: string[]) {
  return {
    name: 'submit_evaluation',
    description: 'Submit the QA evaluation for this call.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string', description: 'One or two sentences summarizing the call quality.' },
        criteria: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', enum: codes },
              verdict: { type: 'string', enum: ['PASS', 'FAIL', 'NA'] },
              evidenceQuote: { type: 'string' },
              evidenceTimestampMs: { type: 'number' },
              rationale: { type: 'string' },
            },
            required: ['code', 'verdict', 'rationale'],
          },
        },
      },
      required: ['summary', 'criteria'],
    },
  };
}
