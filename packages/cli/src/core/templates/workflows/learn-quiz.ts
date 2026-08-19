import {
  ASSESSMENT_PAYLOAD,
  RESPONSE_PAYLOAD,
  SESSION_PAYLOAD,
  runtimeCommand,
  runtimeSkill,
  RUNTIME_HARD_RULES,
} from './_shared.js';

const instructions = `## Activation Contract

Handle \`/learn:quiz <concept>\` as a retrieval quiz with correction. Respond in the user's language.

${RUNTIME_HARD_RULES}
## Execution Steps

1. Snapshot the topic and resolve the requested concept ID.
2. Ask the quiz before showing answers. Review the real response, then create a \`quiz\` session with retrieval, feedback, correction, and summary blocks. Prompts belong in \`socratic_prompts\`; persist the answer with \`update-socratic-response\`. ${SESSION_PAYLOAD} ${RESPONSE_PAYLOAD} Render it with \`learnctl render-session\`.
3. Submit \`record-assessment\` with kind \`quiz\`, the session ID, observed score, feedback, rating, and a stable per-attempt key. ${ASSESSMENT_PAYLOAD} Refresh on conflict.
4. Do not create or maintain a canonical deck; optional temporary quiz material is not learning state.

## Output Contract

Show questions, correction, rendered session, and the runtime-derived result.

## References

None`;

export const getLearnQuizSkillTemplate = () =>
  runtimeSkill('quiz', 'Run a persistent retrieval quiz through learnctl.', instructions);
export const getLearnQuizCommandTemplate = () =>
  runtimeCommand(
    'quiz',
    'Quiz a concept and record observed assessment.',
    'Use the learn-anything-quiz skill. Create and render a quiz session, then record only the observed quiz assessment through learnctl.',
    ['learning', 'quiz', 'retrieval'],
  );
