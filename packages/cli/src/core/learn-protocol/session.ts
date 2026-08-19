import { z } from 'zod';

const iso = () => z.iso.datetime({ offset: true });
const uuid = () => z.uuid();
const blockKinds = [
  'positioning',
  'diagnostic',
  'retrieval',
  'explanation',
  'worked_example',
  'self_explanation',
  'feedback',
  'correction',
  'interleaving',
  'transfer',
  'delayed_assessment',
  'summary',
] as const;

const responseSchema = z.object({ id: uuid(), response: z.string(), submitted_at: iso() }).strict();
const promptSchema = z
  .object({ id: uuid(), prompt: z.string().min(1), responses: z.array(responseSchema) })
  .strict();
const blockSchema = z
  .object({ id: uuid(), kind: z.enum(blockKinds), text: z.string().min(1) })
  .strict();

export const learningSessionV1Schema = z
  .object({
    version: z.literal(1),
    id: uuid(),
    topic_id: uuid(),
    topic_revision: z.string().regex(/^[a-f0-9]{64}$/),
    topic_name: z.string().min(1),
    concept_id: uuid(),
    concept_name: z.string().min(1),
    kind: z.enum(['study', 'explain', 'practice', 'review', 'quiz']),
    locale: z.enum(['en', 'es', 'zh-CN']),
    created_at: iso(),
    updated_at: iso(),
    blocks: z.array(blockSchema).min(1),
    socratic_prompts: z.array(promptSchema).min(1),
  })
  .strict()
  .superRefine((session, ctx) => {
    const ids = new Set<string>();
    const add = (id: string, path: (string | number)[]) => {
      if (ids.has(id)) ctx.addIssue({ code: 'custom', path, message: 'Duplicate session ID' });
      ids.add(id);
    };
    add(session.id, ['id']);
    add(session.topic_id, ['topic_id']);
    add(session.concept_id, ['concept_id']);
    const created = Date.parse(session.created_at);
    const updated = Date.parse(session.updated_at);
    let watermark = created;
    session.blocks.forEach((block, i) => add(block.id, ['blocks', i, 'id']));
    session.socratic_prompts.forEach((prompt, pi) => {
      add(prompt.id, ['socratic_prompts', pi, 'id']);
      let previous = created;
      prompt.responses.forEach((response, ri) => {
        add(response.id, ['socratic_prompts', pi, 'responses', ri, 'id']);
        const submitted = Date.parse(response.submitted_at);
        if (submitted < created || submitted > updated || submitted < previous)
          ctx.addIssue({
            code: 'custom',
            path: ['socratic_prompts', pi, 'responses', ri, 'submitted_at'],
            message: 'Response timestamp is out of session order',
          });
        previous = submitted;
        watermark = Math.max(watermark, submitted);
      });
    });
    if (updated !== watermark)
      ctx.addIssue({
        code: 'custom',
        path: ['updated_at'],
        message: 'updated_at must equal the latest session timestamp',
      });
  });

export type LearningSessionV1 = z.infer<typeof learningSessionV1Schema>;
export type SessionLocale = LearningSessionV1['locale'];

const labels = {
  en: {
    session: 'Learning session',
    topic: 'Topic',
    concept: 'Concept',
    prompts: 'Socratic prompts',
    unanswered: 'Unanswered',
    blocks: Object.fromEntries(blockKinds.map((kind) => [kind, kind.replaceAll('_', ' ')])),
  },
  'zh-CN': {
    session: '学习会话',
    topic: '主题',
    concept: '概念',
    prompts: '苏格拉底问题',
    unanswered: '未回答',
    blocks: {
      positioning: '定位',
      diagnostic: '诊断',
      retrieval: '提取练习',
      explanation: '讲解',
      worked_example: '示例',
      self_explanation: '自我解释',
      feedback: '反馈',
      correction: '纠正',
      interleaving: '交错练习',
      transfer: '迁移',
      delayed_assessment: '延迟评估',
      summary: '总结',
    },
  },
  es: {
    session: 'Sesión de aprendizaje',
    topic: 'Tema',
    concept: 'Concepto',
    prompts: 'Preguntas socráticas',
    unanswered: 'Sin responder',
    blocks: {
      positioning: 'Posicionamiento',
      diagnostic: 'Diagnóstico',
      retrieval: 'Recuperación',
      explanation: 'Explicación',
      worked_example: 'Ejemplo resuelto',
      self_explanation: 'Autoexplicación',
      feedback: 'Devolución',
      correction: 'Corrección',
      interleaving: 'Intercalado',
      transfer: 'Transferencia',
      delayed_assessment: 'Evaluación diferida',
      summary: 'Resumen',
    },
  },
} as const;

export function renderSessionMarkdown(session: LearningSessionV1, locale: SessionLocale): string {
  const text = labels[locale];
  const lines = [
    `# ${text.session}`,
    '',
    `**${text.topic}:** ${escapeMetadata(session.topic_name)}`,
    `**${text.concept}:** ${escapeMetadata(session.concept_name)}`,
    '',
  ];
  for (const block of session.blocks)
    lines.push(`## ${text.blocks[block.kind]}`, '', block.text, '');
  lines.push(`## ${text.prompts}`, '');
  for (const prompt of session.socratic_prompts) {
    const response = prompt.responses.at(-1)?.response;
    lines.push(
      `### ${escapeMetadata(prompt.prompt)}`,
      '',
      response ? response : `_${text.unanswered}_`,
      '',
    );
  }
  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

function escapeMetadata(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E]/g, '\\$&');
}
