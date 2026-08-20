import { loadTopic, loadTopicFiles } from './useTopicData';

export interface TopicCurriculum {
  rootOrder: string[];
  directoryLabels: Record<string, string>;
  conceptNames: Record<string, string>;
}

export function conceptReadmePath(topicSlug: string, conceptSlug: string): string | null {
  const path = `exercises/${conceptSlug}/README.md`;
  return loadTopicFiles(topicSlug)?.exercises.includes(path)
    ? `/topics/${topicSlug}/${path}`
    : null;
}

export function topicCurriculum(topicSlug: string): TopicCurriculum {
  const rootOrder: string[] = [];
  const directoryLabels: Record<string, string> = {};
  const conceptNames: Record<string, string> = {};
  for (const [domainIndex, domain] of (loadTopic(topicSlug)?.domains ?? []).entries()) {
    for (const [conceptIndex, concept] of domain.concepts.entries()) {
      rootOrder.push(concept.slug);
      directoryLabels[concept.slug] = `${domainIndex + 1}.${conceptIndex + 1} ${concept.name}`;
      conceptNames[concept.slug] = concept.name;
    }
  }
  return { rootOrder, directoryLabels, conceptNames };
}
