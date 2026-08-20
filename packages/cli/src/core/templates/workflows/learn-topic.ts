import { INIT_TOPIC_PAYLOAD, runtimeCommand, runtimeSkill, RUNTIME_HARD_RULES } from './_shared.js';

const instructions = `## Activation Contract

Handle \`/learn:topic <topic>\` and natural requests to create, author, or generate a complete course. Respond in the user's language.

${RUNTIME_HARD_RULES}
## Decision Gates

| Condition | Action |
| --- | --- |
| Topic exists | Run \`learnctl snapshot <topic-dir>\`. |
| Topic is new | Confirm domains and concepts, then use \`learnctl init-topic <topic-dir> <temporary-payload.json>\`. |
| Graph only | Create or inspect through runtime, render, snapshot, and stop. |
| Full course | Complete every concept asset gate below before calling it complete. |

## Execution Steps

1. Resolve the topic directory and snapshot it when present.
2. For a new topic, use this exact temporary JSON shape: ${INIT_TOPIC_PAYLOAD} Pass it only to \`learnctl init-topic\`.
3. Run \`learnctl render <topic-dir>\` for the derived map, then \`learnctl snapshot <topic-dir>\`.
4. Present runtime numbering, derived mastery, prerequisites, and the next deterministic \`learnctl study <topic-dir> <ISO-now>\` step.
5. For a full course, use canonical concept order, \`concept.slug\`, derived numbering, topic-wide unique slugs, and prerequisites only to earlier concepts. Work in bounded homogeneous units, then review consistency and run a fresh precision/contract review against each concept's details and primary sources; correct material findings and revalidate.
6. Direct writes are allowed only for non-canonical assets: \`exercises/<slug>/README.md\`, exactly one \`starter.<ext>\` and \`solution.<same-ext>\`, and \`quizzes/<slug>/quiz.json\`. Never directly write state, sessions, maps, evidence, or mastery.
7. README uses \`snapshot.config\` language and numbering: H1 \`# <number> — <concept>\`; intuition through edges; a substantial section per detail; 4–5 verifiable examples; mistakes/compatibility; lab contract, 3 hints, and definition of done; 5 retrieval prompts, 2 transfer tasks, and a new 48-hour assessment. In en/es target 1800–2600 useful words without filler. Connect V2 study without fabricating evidence or mastery.
8. Make starter syntactically valid and observably RED; solution deterministic GREEN with edge cases, no new dependencies. Create exactly five quiz questions with unique IDs, plausible distractors, explanations, and canonical metadata. Quiz JSON shape: \`{"version":1,"topic":"snapshot.state.topic","topic_slug":"snapshot.state.slug","concept_slug":"concept.slug","concept_name":"concept.name","created":"YYYY-MM-DD HH:mm:ss","questions":[...]}\`. Every question requires \`id,type,gradeable,prompt,explanation,answer\`; \`options\` is required for \`multiple_choice\`/\`multi_select\`, and \`accepted_answers\` for \`fill_in_blank\`. Map \`multiple_choice|multi_select|true_false → exact\`, \`fill_in_blank → accepted\`, \`error_correction → ai_only\`. Prefer primary sources; use feature detection and conditional claims for current or niche behavior.
9. Run the lab's real runtime checks, \`learnctl validate-course <topic-dir>\`, then \`learnctl render\` and \`learnctl snapshot\`. Report gaps instead of completion when any gate fails.

## Output Contract

State whether the topic was created or loaded; for a course report ordered coverage, real commands/results, gaps, and next study. Never declare mastery.

## References

None`;

export const getLearnTopicSkillTemplate = () =>
  runtimeSkill(
    'topic',
    'Create, inspect, or author a complete V2 course through learnctl.',
    instructions,
  );
export const getLearnTopicCommandTemplate = () =>
  runtimeCommand(
    'topic',
    'Initialize, inspect, or author a complete V2 course.',
    'Use the learn-anything-topic skill. For a full course, create assets only outside canonical state, validate each complete asset set with learnctl validate-course, then render and snapshot. Never edit canonical files.',
    ['learning', 'topic', 'v2'],
  );
