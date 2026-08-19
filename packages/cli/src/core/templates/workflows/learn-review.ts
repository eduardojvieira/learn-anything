import {
  ASSESSMENT_PAYLOAD,
  RESPONSE_PAYLOAD,
  SESSION_PAYLOAD,
  runtimeCommand,
  runtimeSkill,
  RUNTIME_HARD_RULES,
} from './_shared.js';

const instructions = `## Activation Contract

Handle \`/learn:review [topic]\` for due review. Respond in the user's language.

${RUNTIME_HARD_RULES}
## Execution Steps

1. Run \`learnctl study <topic-dir> <ISO-now>\` and choose due review steps from that plan only.
2. Ask a retrieval prompt without notes. After the real answer, create and render a canonical \`review\` session with retrieval, feedback, correction, and summary blocks; put the question in \`socratic_prompts\` and persist its answer with \`update-socratic-response\`. ${SESSION_PAYLOAD} ${RESPONSE_PAYLOAD}
3. For a real answer, use the current revision and \`record-assessment\` with kind \`retrieval\`, the session ID, observed score, feedback, and one runtime rating. ${ASSESSMENT_PAYLOAD}
4. Refresh the snapshot and report the scheduler's due result. Do not calculate spacing, confidence, or mastery.

## Output Contract

List what was due, the user-selected rating, and the runtime-provided next due state.

## References

None`;

export const getLearnReviewSkillTemplate = () =>
  runtimeSkill('review', 'Review due material using the runtime scheduler.', instructions);
export const getLearnReviewCommandTemplate = () =>
  runtimeCommand(
    'review',
    'Review due material with runtime spacing.',
    'Use the learn-anything-review skill. Get due work with learnctl study; assess observed answers with one runtime rating and report the returned schedule.',
    ['learning', 'review', 'spacing'],
  );
