import type { CommandTemplate, SkillTemplate } from '../types.js';

export function runtimeSkill(id: string, description: string, instructions: string): SkillTemplate {
  return {
    name: `learn-anything-${id}`,
    description: `Trigger: /learn:${id}, ${id} learning workflow. ${description}`,
    instructions,
    license: 'MIT',
    compatibility: 'Requires learnctl.',
    metadata: { author: 'learn-anything', version: '2.0' },
  };
}

export function runtimeCommand(
  id: string,
  description: string,
  content: string,
  tags: string[],
): CommandTemplate {
  return {
    name: `Learn: ${id[0].toUpperCase()}${id.slice(1)}`,
    description,
    category: 'Learning',
    tags,
    content,
  };
}

export const RUNTIME_HARD_RULES = `## Hard Rules

- Treat \`learnctl\` JSON as the only canonical interface. Never directly create, edit, or repair \`.learn\` canonical files, including state, sessions, maps, mastery, confidence, or review fields.
- Read IDs, revisions, due review, and derived mastery from \`learnctl snapshot\`; use \`snapshot.config\` for locale, timezone, and numbering when it is present. Never read config directly or infer those values.
- Put request JSON in a temporary path outside \`.learn\`. Use a stable idempotency key for the same user attempt. On an explicit revision conflict, refresh with \`learnctl snapshot\` and ask or retry from the new state; never patch around it.
- Create sessions with \`learnctl record-session\` and views only with \`learnctl render-session\`. Record only observed user performance with \`record-evidence\` or \`record-assessment\`.
`;

export const INIT_TOPIC_PAYLOAD = `\`init-topic\` payload: \`{"topic":"string","created_at":"ISO-8601 with offset","domains":[{"name":"string","concepts":[{"name":"string","details":["string"],"prerequisites":["concept-slug"],"relations":[{"kind":"related|contrast|analogy|application","target":"concept-slug"}]}]}]}\`. Optional slugs: \`slug\` on topic, domain, or concept. Prerequisite and relation targets use the final topic-wide unique concept slug (explicit or generated).`;

export const SESSION_PAYLOAD = `\`record-session\` payload: \`{"expected_topic_revision":"snapshot.revision","idempotency_key":"stable string","concept_id":"snapshot concept UUID","kind":"study|explain|practice|review|quiz","locale":"en|es|zh-CN","created_at":"ISO-8601 with offset","blocks":[{"kind":"positioning|diagnostic|retrieval|explanation|worked_example|self_explanation|feedback|correction|interleaving|transfer|delayed_assessment|summary","text":"string"}],"socratic_prompts":["string"]}\`.`;

export const RESPONSE_PAYLOAD = `\`update-socratic-response\` payload: \`{"expected_revision":"session-snapshot.revision","idempotency_key":"stable string","question_id":"session prompt UUID","response":"string","submitted_at":"ISO-8601 with offset"}\`. This uses the session revision; evidence and assessment use the topic snapshot revision.`;

export const EVIDENCE_PAYLOAD = `\`record-evidence\` payload: \`{"expected_revision":"snapshot.revision","idempotency_key":"stable string","concept_id":"snapshot concept UUID","kind":"diagnostic|retrieval|self_explanation|practice|quiz|transfer|delayed_assessment","observed_at":"ISO-8601 with offset","score":0,"session_id":"session UUID","feedback":"required when score < 0.8 or corrected","corrected":false,"predicted_score":0}\`; \`session_id\`, \`feedback\`, \`corrected\`, and \`predicted_score\` are optional otherwise.`;

export const ASSESSMENT_PAYLOAD = `\`record-assessment\` uses the evidence payload plus required \`"rating":"again|hard|good|easy"\`. Its \`kind\` is the observed allowed phase, never \`review\`.`;
