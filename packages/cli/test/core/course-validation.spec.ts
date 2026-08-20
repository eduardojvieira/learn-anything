import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTopic, main, snapshot, validateCourse } from '../../src/learnctl/index.js';

let root: string;
let topicDir: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'course-'));
  topicDir = path.join(root, 'topic');
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const payload = () => ({
  topic: 'Course',
  created_at: '2026-01-01T00:00:00.000Z',
  domains: [{ name: 'Basics', concepts: [{ name: 'Types', details: ['Values'] }] }],
});

async function assets(): Promise<void> {
  const current = await snapshot(topicDir);
  const concept = current.state.domains[0].concepts[0];
  const number = current.numbering[concept.id];
  const exercise = path.join(topicDir, 'exercises', concept.slug);
  const quiz = path.join(topicDir, 'quizzes', concept.slug);
  await fs.mkdir(exercise, { recursive: true });
  await fs.mkdir(quiz, { recursive: true });
  await fs.writeFile(path.join(exercise, 'README.md'), `# ${number} — ${concept.name}\n`);
  await fs.writeFile(path.join(exercise, 'starter.mjs'), 'throw new Error("TODO");\n');
  await fs.writeFile(path.join(exercise, 'solution.mjs'), 'export {};\n');
  const questions = Array.from({ length: 5 }, (_, index) => ({
    id: `q${index}`,
    type: 'true_false',
    gradeable: 'exact',
    prompt: `Q${index}`,
    answer: true,
    explanation: 'Because.',
  }));
  await fs.writeFile(
    path.join(quiz, 'quiz.json'),
    JSON.stringify({
      version: 1,
      topic: current.state.topic,
      topic_slug: current.state.slug,
      concept_slug: concept.slug,
      concept_name: concept.name,
      created: '2026-01-01 00:00:00',
      questions,
    }),
  );
}

describe('validateCourse', () => {
  it('rejects an empty course without writing canonical state', async () => {
    await createTopic(topicDir, { ...payload(), domains: [] });
    await Promise.all([
      fs.mkdir(path.join(topicDir, 'exercises')),
      fs.mkdir(path.join(topicDir, 'quizzes')),
    ]);
    const statePath = path.join(topicDir, 'state.json');
    const before = await fs.readFile(statePath);
    await expect(validateCourse(topicDir)).resolves.toMatchObject({
      total: 0,
      completed: 0,
      complete: false,
      issues: [{ path: 'state.domains', message: 'course must contain at least one concept' }],
    });
    const output: string[] = [];
    expect(
      await main(['validate-course', topicDir], {
        stdout: { write: (line: string) => output.push(line) },
        stderr: { write: (line: string) => output.push(line) },
      }),
    ).toBe(4);
    expect(JSON.parse(output[0]).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'state.domains' })]),
    );
    expect(await fs.readFile(statePath)).toEqual(before);
  });

  it('reports a complete canonical course without writing state', async () => {
    await createTopic(topicDir, payload());
    await assets();
    const before = await fs.readFile(path.join(topicDir, 'state.json'));
    await expect(validateCourse(topicDir)).resolves.toMatchObject({
      complete: true,
      total: 1,
      completed: 1,
      concepts: [{ complete: true }],
    });
    const output: string[] = [];
    expect(
      await main(['validate-course', topicDir], {
        stdout: { write: (line: string) => output.push(line) },
        stderr: { write: (line: string) => output.push(line) },
      }),
    ).toBe(0);
    expect(await fs.readFile(path.join(topicDir, 'state.json')).then(String)).toBe(String(before));
  });

  it('reports compound asset, quiz, slug, and prerequisite failures', async () => {
    await createTopic(topicDir, {
      ...payload(),
      domains: [
        {
          name: 'Basics',
          concepts: [
            { name: 'Types', details: [] },
            { name: 'Functions', details: [] },
          ],
        },
      ],
    });
    await assets();
    const statePath = path.join(topicDir, 'state.json');
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    state.domains[0].concepts[0].slug = state.domains[0].concepts[1].slug;
    state.domains[0].concepts[0].prerequisites = [state.domains[0].concepts[1].id];
    await fs.writeFile(statePath, `${JSON.stringify(state)}\n`);
    const report = await validateCourse(topicDir);
    expect(report.complete).toBe(false);
    expect(report.issues.map((issue) => issue.message).join('\n')).toMatch(
      /duplicate|previous|README|quiz/i,
    );
    const output: string[] = [];
    const beforeCli = await fs.readFile(statePath);
    expect(
      await main(['validate-course', topicDir], {
        stdout: { write: (line: string) => output.push(line) },
        stderr: { write: (line: string) => output.push(line) },
      }),
    ).toBe(4);
    expect(JSON.parse(output[0]).issues).toEqual(expect.any(Array));
    expect(await fs.readFile(statePath)).toEqual(beforeCli);
  });

  it('rejects unsafe slugs without reading assets outside the course root', async () => {
    await createTopic(topicDir, payload());
    await assets();
    const statePath = path.join(topicDir, 'state.json');
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    state.domains[0].concepts[0].slug = '../outside';
    await fs.writeFile(statePath, `${JSON.stringify(state)}\n`);
    const report = await validateCourse(topicDir);
    expect(report).toMatchObject({ complete: false, completed: 0 });
    expect(report.issues).toEqual([
      {
        path: 'concepts/../outside',
        message: 'concept slug escapes course asset paths',
      },
    ]);
  });

  it('rejects symlinked roots and schema-invalid JSON without throwing', async () => {
    await createTopic(topicDir, payload());
    await assets();
    const quiz = path.join(
      topicDir,
      'quizzes',
      (await snapshot(topicDir)).state.domains[0].concepts[0].slug,
      'quiz.json',
    );
    await fs.writeFile(quiz, 'null');
    await expect(validateCourse(topicDir)).resolves.toMatchObject({ complete: false });
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside);
    await fs.rename(path.join(topicDir, 'exercises'), outside + '/exercises');
    await fs.symlink(outside + '/exercises', path.join(topicDir, 'exercises'));
    await expect(validateCourse(topicDir)).resolves.toMatchObject({
      complete: false,
      completed: 0,
    });
  });
});
