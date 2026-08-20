import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateQuizDeck } from '../scripts/utils.mjs';
import type { TopicSnapshot } from '../learnctl/index.js';

export interface CourseIssue {
  path: string;
  message: string;
}
export interface CourseConceptReport {
  id: string;
  slug: string;
  number: string;
  complete: boolean;
  issues: CourseIssue[];
}
export interface CourseValidationReport {
  revision: string;
  total: number;
  completed: number;
  complete: boolean;
  concepts: CourseConceptReport[];
  issues: CourseIssue[];
}

export async function validateCourseSnapshot(
  topicDir: string,
  snapshot: TopicSnapshot,
): Promise<CourseValidationReport> {
  const concepts = snapshot.state.domains.flatMap((domain) => domain.concepts);
  const rootIssues: CourseIssue[] = [];
  if (concepts.length === 0)
    rootIssues.push({ path: 'state.domains', message: 'course must contain at least one concept' });
  const rootsSafe =
    (await realDirectory(path.join(topicDir, 'exercises'))) &&
    (await realDirectory(path.join(topicDir, 'quizzes')));
  if (!rootsSafe)
    rootIssues.push({
      path: topicDir,
      message: 'course asset roots must be real non-symlink directories',
    });
  const order = new Map(concepts.map((concept, index) => [concept.id, index]));
  const duplicateSlugs = new Set(
    concepts
      .filter(
        (concept, index) => concepts.findIndex((entry) => entry.slug === concept.slug) !== index,
      )
      .map((concept) => concept.slug),
  );
  const reports = await Promise.all(
    concepts.map(async (concept) => {
      const issues: CourseIssue[] = [];
      const base = `concepts/${concept.slug}`;
      const slugSafe = safeSlug(concept.slug);
      if (!slugSafe)
        issues.push({ path: base, message: 'concept slug escapes course asset paths' });
      if (duplicateSlugs.has(concept.slug))
        issues.push({ path: base, message: 'duplicate concept slug' });
      for (const prerequisite of concept.prerequisites) {
        const prerequisiteOrder = order.get(prerequisite);
        if (prerequisiteOrder === undefined || prerequisiteOrder >= order.get(concept.id)!)
          issues.push({ path: base, message: 'prerequisite must reference a previous concept' });
      }
      if (rootsSafe && slugSafe)
        await validateAssets(
          topicDir,
          concept.slug,
          concept.name,
          snapshot.state.topic,
          snapshot.state.slug,
          snapshot.numbering[concept.id],
          issues,
        );
      return {
        id: concept.id,
        slug: concept.slug,
        number: snapshot.numbering[concept.id],
        complete: rootsSafe && issues.length === 0,
        issues,
      };
    }),
  );
  const issues = [...rootIssues, ...reports.flatMap((report) => report.issues)];
  return {
    revision: snapshot.revision,
    total: reports.length,
    completed: reports.filter((report) => report.complete).length,
    complete: issues.length === 0,
    concepts: reports,
    issues,
  };
}

function safeSlug(slug: string): boolean {
  return (
    slug !== '' && slug === path.basename(slug) && !slug.includes('..') && !/[\\/\0]/.test(slug)
  );
}

async function validateAssets(
  topicDir: string,
  slug: string,
  name: string,
  topic: string,
  topicSlug: string,
  number: string,
  issues: CourseIssue[],
): Promise<void> {
  const exercise = path.join(topicDir, 'exercises', slug);
  const quiz = path.join(topicDir, 'quizzes', slug, 'quiz.json');
  if (!(await realDirectory(exercise))) {
    issues.push({
      path: exercise,
      message: 'exercise concept directory must be a real non-symlink directory',
    });
    return;
  }
  if (!(await realDirectory(path.dirname(quiz)))) {
    issues.push({
      path: path.dirname(quiz),
      message: 'quiz concept directory must be a real non-symlink directory',
    });
    return;
  }
  const readme = path.join(exercise, 'README.md');
  if (await regular(readme)) {
    const content = await fs.readFile(readme, 'utf8');
    if (!content.trim()) issues.push({ path: readme, message: 'README must not be empty' });
    if (content.split(/\r?\n/)[0] !== `# ${number} — ${name}`)
      issues.push({
        path: readme,
        message: 'README H1 must match derived numbering and concept name',
      });
  } else issues.push({ path: readme, message: 'missing regular README' });
  const files = await list(exercise);
  const starters = files.filter((file) => /^starter\.[^.]+$/.test(file));
  const solutions = files.filter((file) => /^solution\.[^.]+$/.test(file));
  if (
    starters.length !== 1 ||
    solutions.length !== 1 ||
    starters[0]?.slice(7) !== solutions[0]?.slice(8) ||
    !(await regular(path.join(exercise, starters[0] ?? ''))) ||
    !(await regular(path.join(exercise, solutions[0] ?? '')))
  )
    issues.push({
      path: exercise,
      message: 'requires exactly one regular starter and matching solution extension',
    });
  if (!(await regular(quiz))) {
    issues.push({ path: quiz, message: 'missing regular quiz.json' });
    return;
  }
  let deck: unknown;
  const bytes = await fs.readFile(quiz, 'utf8');
  try {
    deck = JSON.parse(bytes);
  } catch {
    issues.push({ path: quiz, message: 'quiz.json must be valid JSON' });
    return;
  }
  for (const error of validateQuizDeck(deck))
    issues.push({ path: `${quiz}:${error.path}`, message: error.message });
  if (deck === null || typeof deck !== 'object' || Array.isArray(deck)) return;
  const record = deck as Record<string, unknown>;
  if (
    record.topic !== topic ||
    record.topic_slug !== topicSlug ||
    record.concept_slug !== slug ||
    record.concept_name !== name
  )
    issues.push({
      path: quiz,
      message: 'quiz metadata does not match canonical topic and concept',
    });
  const questions = Array.isArray(record.questions) ? record.questions : [];
  if (questions.length !== 5)
    issues.push({ path: quiz, message: 'quiz must contain exactly 5 questions' });
  const ids = questions.map((question) =>
    typeof question === 'object' && question !== null
      ? (question as Record<string, unknown>).id
      : undefined,
  );
  if (new Set(ids).size !== ids.length)
    issues.push({ path: quiz, message: 'quiz question IDs must be unique' });
}

async function list(directory: string): Promise<string[]> {
  try {
    return await fs.readdir(directory);
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}
async function regular(file: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

async function realDirectory(directory: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(directory);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch (error) {
    if (missing(error)) return false;
    throw error;
  }
}

function missing(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
