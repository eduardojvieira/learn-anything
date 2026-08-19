import { describe, expect, it } from 'vitest';
import {
  getLearnExplainSkillTemplate,
  getLearnPracticeSkillTemplate,
  getLearnQuizSkillTemplate,
  getLearnReviewSkillTemplate,
  getLearnStatusSkillTemplate,
  getLearnStudySkillTemplate,
  getLearnTopicSkillTemplate,
} from '../src/core/templates/skill-templates.js';
import {
  getCommandContents,
  getCommandTemplates,
  generateSkillContent,
  getSkillTemplates,
} from '../src/core/shared/skill-generation.js';
import { CommandAdapterRegistry } from '../src/core/command-generation/registry.js';
import { generateCommands } from '../src/core/command-generation/generator.js';

const workflows = {
  study: getLearnStudySkillTemplate,
  topic: getLearnTopicSkillTemplate,
  explain: getLearnExplainSkillTemplate,
  practice: getLearnPracticeSkillTemplate,
  review: getLearnReviewSkillTemplate,
  status: getLearnStatusSkillTemplate,
  quiz: getLearnQuizSkillTemplate,
};

describe('V2 workflow templates', () => {
  const ids = ['study', 'topic', 'explain', 'practice', 'review', 'status', 'quiz'];

  it('registers exactly seven workflows with study first', () => {
    expect(getSkillTemplates().map((entry) => entry.workflowId)).toEqual(ids);
    expect(getCommandTemplates().map((entry) => entry.id)).toEqual(ids);
    expect(getCommandContents().map((entry) => entry.id)).toEqual(ids);
  });

  it.each(ids)('%s is a concise runtime-only LLM contract', (id) => {
    const template = workflows[id as keyof typeof workflows]();
    const body = template.instructions;
    expect(template.description).toMatch(/^Trigger:/);
    expect(body).toMatch(/^## Activation Contract/m);
    expect(body).toContain('## Hard Rules');
    expect(body).toContain('## Execution Steps');
    expect(body).toContain('## Output Contract');
    expect(body).toContain('## References');
    const activation = body.indexOf('## Activation Contract');
    const hardRules = body.indexOf('## Hard Rules');
    const decisionGates = body.indexOf('## Decision Gates');
    const execution = body.indexOf('## Execution Steps');
    const output = body.indexOf('## Output Contract');
    const references = body.indexOf('## References');
    expect(activation).toBeLessThan(hardRules);
    if (decisionGates >= 0) expect(hardRules).toBeLessThan(decisionGates);
    expect(decisionGates >= 0 ? decisionGates : hardRules).toBeLessThan(execution);
    expect(execution).toBeLessThan(output);
    expect(output).toBeLessThan(references);
    expect(body).toContain('learnctl');
    expect(body.length).toBeLessThan(6_500);
    expect(body).not.toMatch(
      /render\.mjs|status\.mjs|utils\.mjs|init-sessions\.mjs|validate-quiz\.mjs/,
    );
    expect(body).not.toMatch(
      /(?:use|run)\s+(?:Write|Edit)\b[^\n]*(?:state|session|knowledge-map)/i,
    );
    expect(body).not.toMatch(/state\.json|knowledge-map\.md/);
  });

  it('uses valid YAML frontmatter for a Trigger description', () => {
    const content = generateSkillContent(getLearnStudySkillTemplate(), '2.0.0');
    expect(content).toContain('description: "Trigger: /learn:study');
    expect(content).toContain('generatedBy: "2.0.0"');
  });

  it('gives the primary workflow every learning-engine phase', () => {
    const body = getLearnStudySkillTemplate().instructions;
    for (const phase of [
      'diagnostic',
      'retrieval',
      'self_explanation',
      'practice',
      'feedback',
      'correction',
      'interleave',
      'transfer',
      'delayed_assessment',
    ])
      expect(body).toContain(phase);
  });

  it('keeps each specialized workflow on its runtime responsibility', () => {
    expect(getLearnTopicSkillTemplate().instructions).toContain('init-topic');
    expect(getLearnExplainSkillTemplate().instructions).toContain('record-session');
    expect(getLearnPracticeSkillTemplate().instructions).toContain('record-assessment');
    expect(getLearnReviewSkillTemplate().instructions).toContain('again');
    expect(getLearnStatusSkillTemplate().instructions).toContain('read-only');
    expect(getLearnQuizSkillTemplate().instructions).toContain('kind `quiz`');
    expect(getLearnPracticeSkillTemplate().instructions).not.toContain(
      'exercise, feedback, correction, and prompt blocks',
    );
    expect(getLearnReviewSkillTemplate().instructions).toContain('kind `retrieval`');
    for (const getter of [
      getLearnStudySkillTemplate,
      getLearnExplainSkillTemplate,
      getLearnPracticeSkillTemplate,
      getLearnReviewSkillTemplate,
      getLearnQuizSkillTemplate,
    ]) {
      const body = getter().instructions;
      expect(body).toContain('"expected_revision":"session-snapshot.revision"');
      expect(body).toContain('"question_id":"session prompt UUID"');
      expect(body).toContain('"submitted_at":"ISO-8601 with offset"');
    }
    expect(getLearnExplainSkillTemplate().instructions).toContain(
      'persist it with `update-socratic-response`',
    );
    expect(getLearnPracticeSkillTemplate().instructions).toContain('Present it and wait');
    expect(getLearnPracticeSkillTemplate().instructions).not.toContain(
      'Create the session; do not record a score yet.',
    );
    expect(getLearnQuizSkillTemplate().instructions).toMatch(/\n1\..*\n2\..*\n3\..*\n4\./s);
  });

  it.each(['claude', 'cursor', 'codex', 'gemini'])(
    'generates all seven commands for %s',
    (toolId) => {
      const adapter = CommandAdapterRegistry.get(toolId)!;
      const commands = generateCommands(getCommandContents(), adapter);
      expect(commands).toHaveLength(7);
      const study = commands.find((command) => command.path.includes('study'))!;
      const quiz = commands.find((command) => command.path.includes('quiz'))!;
      expect(study.fileContent).toContain('learn-anything-study');
      expect(quiz.fileContent).toContain('learn-anything-quiz');
      if (toolId === 'claude')
        expect(study.path.replace(/\\/g, '/')).toContain('.claude/commands/learn/study.md');
      if (toolId === 'cursor')
        expect(study.path.replace(/\\/g, '/')).toContain(
          '.cursor/commands/learn-anything-study.md',
        );
      if (toolId === 'codex')
        expect(study.path.replace(/\\/g, '/')).toContain('.codex/prompts/learn-anything-study.md');
      if (toolId === 'gemini') {
        expect(study.path.replace(/\\/g, '/')).toContain('.gemini/commands/learn/study.toml');
        expect(study.fileContent).toContain('prompt = """');
      } else expect(study.fileContent).toContain('---');
    },
  );
});
