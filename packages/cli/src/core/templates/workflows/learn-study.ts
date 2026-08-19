import {
  ASSESSMENT_PAYLOAD,
  EVIDENCE_PAYLOAD,
  RESPONSE_PAYLOAD,
  SESSION_PAYLOAD,
  runtimeCommand,
  runtimeSkill,
  RUNTIME_HARD_RULES,
} from './_shared.js';

const instructions = `## Activation Contract

Handle \`/learn:study [topic]\` as the primary deterministic learning workflow. Respond in the user's language.

${RUNTIME_HARD_RULES}
## Decision Gates

| Plan step | Action |
| --- | --- |
| No steps | Report that no work is due and offer status. |
| A step exists | Follow the first runtime step; do not invent order or spacing. |

## Execution Steps

1. Run \`learnctl study <topic-dir> <ISO-now>\`, select the first deterministic step, and snapshot for its concept ID and revision.
2. Run the learning loop as applicable: diagnostic, retrieval, self_explanation, practice, feedback, correction, interleave, transfer, and delayed_assessment.
3. After observed work, create one \`study\` session with only valid blocks actually performed and prompts in \`socratic_prompts\`; persist the answer with \`update-socratic-response\`, then render. ${SESSION_PAYLOAD} ${RESPONSE_PAYLOAD}
4. After real user performance, use \`record-evidence\` for diagnostic, retrieval, self_explanation, transfer, or delayed_assessment; use \`record-assessment\` for practice with its allowed phase kind. Include the current revision, concept ID, session ID, and stable attempt key. ${EVIDENCE_PAYLOAD} ${ASSESSMENT_PAYLOAD}
5. Refresh snapshot after each explicit conflict and continue only from runtime output. End with the next \`learnctl study\` step and derived mastery.

## Output Contract

Show the selected plan step, user-facing coaching, recorded evidence or assessment, rendered session, and the next runtime action.

## References

None`;

export const getLearnStudySkillTemplate = () =>
  runtimeSkill('study', 'Run the primary deterministic study plan through learnctl.', instructions);
export const getLearnStudyCommandTemplate = () =>
  runtimeCommand(
    'study',
    'Run the primary deterministic V2 study workflow.',
    'Use the learn-anything-study skill. Start with learnctl study, follow its first deterministic step, persist the canonical session and observed evidence through learnctl, then render it.',
    ['learning', 'study', 'v2'],
  );
