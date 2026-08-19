import { INIT_TOPIC_PAYLOAD, runtimeCommand, runtimeSkill, RUNTIME_HARD_RULES } from './_shared.js';

const instructions = `## Activation Contract

Handle \`/learn:topic <topic>\` to initialize or inspect one V2 learning topic. Respond in the user's language.

${RUNTIME_HARD_RULES}
## Decision Gates

| Condition | Action |
| --- | --- |
| Topic exists | Run \`learnctl snapshot <topic-dir>\`. |
| Topic is new | Confirm domains and concepts, then use \`learnctl init-topic <topic-dir> <temporary-payload.json>\`. |

## Execution Steps

1. Resolve the topic directory and snapshot it when present.
2. For a new topic, use this exact temporary JSON shape: ${INIT_TOPIC_PAYLOAD} Pass it only to \`learnctl init-topic\`.
3. Run \`learnctl render <topic-dir>\` for the derived map, then \`learnctl snapshot <topic-dir>\`.
4. Present runtime numbering, derived mastery, prerequisites, and the next deterministic \`learnctl study <topic-dir> <ISO-now>\` step.

## Output Contract

State whether the topic was created or loaded, show the runtime-derived map summary, and offer \`/learn:study\` as the default next action.

## References

None`;

export const getLearnTopicSkillTemplate = () =>
  runtimeSkill('topic', 'Create or inspect a V2 topic through learnctl.', instructions);
export const getLearnTopicCommandTemplate = () =>
  runtimeCommand(
    'topic',
    'Initialize or load a V2 learning topic.',
    'Use the learn-anything-topic skill. Resolve the topic through learnctl; create it only with init-topic and a temporary V2 payload, then render and snapshot it. Never edit canonical files.',
    ['learning', 'topic', 'v2'],
  );
