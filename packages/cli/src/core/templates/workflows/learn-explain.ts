import {
  EVIDENCE_PAYLOAD,
  RESPONSE_PAYLOAD,
  SESSION_PAYLOAD,
  runtimeCommand,
  runtimeSkill,
  RUNTIME_HARD_RULES,
} from './_shared.js';

const instructions = `## Activation Contract

Handle \`/learn:explain <concept>\` as a Socratic explanation session. Respond in the user's language.

${RUNTIME_HARD_RULES}
## Execution Steps

1. Run \`learnctl snapshot <topic-dir>\`, resolve the concept ID from the returned state, and use its derived context.
2. Give positioning, a precise explanation, a minimal worked example, and self-explanation prompts. Do not claim mastery.
3. Create a temporary session payload with positioning, explanation, worked_example, and self_explanation blocks; prompts belong only in \`socratic_prompts\`. ${SESSION_PAYLOAD} Call \`learnctl record-session\`.
4. Call \`learnctl render-session <topic-dir> <session-id>\` and present the rendered view.
5. Only after a real user answer, persist it with \`update-socratic-response\`, re-render the session, then record observed retrieval or self-explanation evidence with the current topic revision and session ID. ${RESPONSE_PAYLOAD} ${EVIDENCE_PAYLOAD} Refresh after conflicts.

## Output Contract

Give the explanation and prompts, identify the rendered session, and offer practice or study next.

## References

None`;

export const getLearnExplainSkillTemplate = () =>
  runtimeSkill(
    'explain',
    'Run a persistent Socratic explanation session through learnctl.',
    instructions,
  );
export const getLearnExplainCommandTemplate = () =>
  runtimeCommand(
    'explain',
    'Explain a concept with a canonical Socratic session.',
    'Use the learn-anything-explain skill. Snapshot first, record the explanation session through learnctl, render it, and record evidence only for an observed answer.',
    ['learning', 'explain', 'socratic'],
  );
