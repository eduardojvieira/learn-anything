import {
  ASSESSMENT_PAYLOAD,
  RESPONSE_PAYLOAD,
  SESSION_PAYLOAD,
  runtimeCommand,
  runtimeSkill,
  RUNTIME_HARD_RULES,
} from './_shared.js';

const instructions = `## Activation Contract

Handle \`/learn:practice <concept>\` as a deliberate practice session. Respond in the user's language.

${RUNTIME_HARD_RULES}
## Decision Gates

| Condition | Action |
| --- | --- |
| User submits work | Give feedback and correction, then record an assessment. |
| User only asks for an exercise | Present it and wait; do not create feedback, correction, session, or assessment yet. |

## Execution Steps

1. Snapshot the topic, resolve the concept ID, and check prerequisite context from the returned state.
2. Propose one bounded exercise and wait for actual work; do not create feedback or correction before it exists.
3. Review the answer, give specific feedback and correction, then create the \`practice\` session with allowed \`feedback\`, \`correction\`, and \`summary\` blocks. ${SESSION_PAYLOAD} Add the submitted answer with \`update-socratic-response\`, then render. ${RESPONSE_PAYLOAD}
4. With the latest topic revision, submit \`record-assessment\` using kind \`practice\`, the session ID, score, feedback, and stable attempt key. ${ASSESSMENT_PAYLOAD}
5. Generated exercise files may live outside canonical learning data and never determine mastery on their own.

## Output Contract

Show the exercise, feedback, assessment result, and the next runtime study step.

## References

None`;

export const getLearnPracticeSkillTemplate = () =>
  runtimeSkill(
    'practice',
    'Practice a concept and record observed assessment through learnctl.',
    instructions,
  );
export const getLearnPracticeCommandTemplate = () =>
  runtimeCommand(
    'practice',
    'Practice a concept with feedback and runtime assessment.',
    'Use the learn-anything-practice skill. Snapshot, create a practice session, assess only submitted work with record-assessment, then render the session.',
    ['learning', 'practice', 'assessment'],
  );
