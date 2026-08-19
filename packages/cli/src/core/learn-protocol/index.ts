export type {
  ConceptStatus,
  Concept,
  Domain,
  StateV1,
  Detail,
  V0Concept,
  V0State,
  ParsedConcept,
  ParsedDomain,
  ParsedKnowledgeMap,
  StateV2,
  DomainV2,
  ConceptV2,
  DetailV2,
  RelationV2,
  RelationKind,
  EvidenceV2,
  EvidenceKind,
  EvidenceSource,
  ReviewRating,
  CalibrationV2,
  ReviewV2,
  ReviewState,
} from './types.js';

export { stateV1Schema, validateStateV1 } from './schema.js';
export type { StateV1Schema, ValidationResult } from './schema.js';
export { stateV2Schema, validateStateV2 } from './schema.js';
export type { StateV2Schema, ValidationResultV2 } from './schema.js';

export function deriveNumbering(state: import('./types.js').StateV2): Record<string, string> {
  const numbering: Record<string, string> = {};
  state.domains.forEach((domain, domainIndex) => {
    const domainNumber = String(domainIndex + 1);
    numbering[domain.id] = domainNumber;
    domain.concepts.forEach((concept, conceptIndex) => {
      const conceptNumber = `${domainNumber}.${conceptIndex + 1}`;
      numbering[concept.id] = conceptNumber;
      concept.details.forEach((detail, detailIndex) => {
        numbering[detail.id] = `${conceptNumber}.${detailIndex + 1}`;
      });
    });
  });
  return numbering;
}

export { generateSlug } from './slug.js';

export { parseKnowledgeMap } from './parser.js';

export { isV0State, migrateV0ToV1, migrateAll } from './migrate.js';
export type { MigrationResult, MigrationReport } from './migrate.js';
export { migrateV1ToV2, V1BackupMismatchError } from './migrate-v2.js';
export type { V2MigrationResult } from './migrate-v2.js';
export { learningSessionV1Schema, renderSessionMarkdown } from './session.js';
export type { LearningSessionV1, SessionLocale } from './session.js';
