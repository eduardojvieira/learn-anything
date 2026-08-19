import { runtimeCommand, runtimeSkill, RUNTIME_HARD_RULES } from './_shared.js';

const instructions = `## Activation Contract

Handle \`/learn:status [topic]\` as a read-only learning ledger. Respond in the user's language.

${RUNTIME_HARD_RULES}
## Execution Steps

1. Run \`learnctl snapshot <topic-dir>\`.
2. Present the returned numbering, derived \`mastery\`, prerequisites, and review due fields without recomputing them.
3. Optionally run \`learnctl study <topic-dir> <ISO-now>\` to show the next deterministic work; do not write anything.

## Output Contract

Return a concise status ledger and recommend \`/learn:study\` or one specialized workflow.

## References

None`;

export const getLearnStatusSkillTemplate = () =>
  runtimeSkill('status', 'Show runtime-derived mastery and due review state.', instructions);
export const getLearnStatusCommandTemplate = () =>
  runtimeCommand(
    'status',
    'Show the read-only V2 learning ledger.',
    'Use the learn-anything-status skill. Read only learnctl snapshot and optionally study; show numbering, derived mastery, and due review state.',
    ['learning', 'status', 'ledger'],
  );
