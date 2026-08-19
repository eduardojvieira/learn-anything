import { describe, expect, it } from 'vitest';
import {
  learningSessionV1Schema,
  renderSessionMarkdown,
} from '../../../src/core/learn-protocol/session.js';

const ids = {
  session: '00000000-0000-4000-8000-000000000001',
  topic: '00000000-0000-4000-8000-000000000002',
  concept: '00000000-0000-4000-8000-000000000003',
  block: '00000000-0000-4000-8000-000000000004',
  prompt: '00000000-0000-4000-8000-000000000005',
  response: '00000000-0000-4000-8000-000000000006',
};
const session = () => ({
  version: 1,
  id: ids.session,
  topic_id: ids.topic,
  topic_revision: 'a'.repeat(64),
  topic_name: 'TypeScript',
  concept_id: ids.concept,
  concept_name: 'Types',
  kind: 'study',
  locale: 'en',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  blocks: [{ id: ids.block, kind: 'retrieval', text: 'Recall unions.' }],
  socratic_prompts: [
    {
      id: ids.prompt,
      prompt: 'Why?',
      responses: [
        { id: ids.response, response: 'Because.', submitted_at: '2026-01-02T00:00:00.000Z' },
      ],
    },
  ],
});

describe('LearningSessionV1', () => {
  it('is strict and enforces IDs and response timestamps', () => {
    expect(learningSessionV1Schema.safeParse(session()).success).toBe(true);
    const invalid = session();
    invalid.blocks[0].id = ids.prompt;
    invalid.socratic_prompts[0].responses[0].submitted_at = '2025-12-31T00:00:00.000Z';
    expect(learningSessionV1Schema.safeParse(invalid).success).toBe(false);
    const crossFieldDuplicate = session();
    crossFieldDuplicate.concept_id = crossFieldDuplicate.topic_id;
    expect(learningSessionV1Schema.safeParse(crossFieldDuplicate).success).toBe(false);
    expect(learningSessionV1Schema.safeParse({ ...session(), extra: true }).success).toBe(false);
  });

  it('requires updated_at to be the latest creation or response timestamp', () => {
    const invalid = session();
    invalid.updated_at = '2026-01-03T00:00:00.000Z';
    expect(learningSessionV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('renders exact localized markdown, escaping only metadata', () => {
    const value = {
      ...session(),
      topic_name: 'TypeScript: strict!\nnew line',
      concept_name: 'Types (safe).',
      blocks: [{ ...session().blocks[0], text: 'Literal *block*?\nline.' }],
      socratic_prompts: [{ ...session().socratic_prompts[0], prompt: 'Why?', responses: [] }],
    };
    const before = structuredClone(value);
    expect(renderSessionMarkdown(value, 'en')).toBe(
      `# Learning session\n\n**Topic:** TypeScript\\: strict\\! new line\n**Concept:** Types \\(safe\\)\\.\n\n## retrieval\n\nLiteral *block*?\nline.\n\n## Socratic prompts\n\n### Why\\?\n\n_Unanswered_\n`,
    );
    expect(renderSessionMarkdown(value, 'zh-CN')).toBe(
      `# 学习会话\n\n**主题:** TypeScript\\: strict\\! new line\n**概念:** Types \\(safe\\)\\.\n\n## 提取练习\n\nLiteral *block*?\nline.\n\n## 苏格拉底问题\n\n### Why\\?\n\n_未回答_\n`,
    );
    expect(learningSessionV1Schema.safeParse({ ...session(), locale: 'es' }).success).toBe(true);
    expect(renderSessionMarkdown(value, 'es')).toBe(
      `# Sesión de aprendizaje\n\n**Tema:** TypeScript\\: strict\\! new line\n**Concepto:** Types \\(safe\\)\\.\n\n## Recuperación\n\nLiteral *block*?\nline.\n\n## Preguntas socráticas\n\n### Why\\?\n\n_Sin responder_\n`,
    );
    expect(renderSessionMarkdown(value, 'en')).toBe(renderSessionMarkdown(value, 'en'));
    expect(value).toEqual(before);
  });
});
