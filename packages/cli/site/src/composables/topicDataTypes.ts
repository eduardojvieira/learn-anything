export type ConceptStatus = 'mastered' | 'in_progress' | 'needs_practice' | 'unexplored';

export interface Concept {
  name: string;
  slug: string;
  status: ConceptStatus;
  confidence: number;
  practice_count: number;
  explain_count: number;
  last_explained: string | null;
  last_practiced: string | null;
  details: string[];
}

export interface Domain {
  name: string;
  slug: string;
  concepts: Concept[];
}

export interface StateV1 {
  version: 1;
  topic: string;
  slug: string;
  created: string;
  domains: Domain[];
}

export interface EvidenceV2 {
  id: string;
  kind:
    | 'diagnostic'
    | 'retrieval'
    | 'self_explanation'
    | 'practice'
    | 'quiz'
    | 'transfer'
    | 'delayed_assessment';
  observed_at: string;
  score: number;
  source: 'learnctl' | 'dashboard' | 'agent' | 'migration';
  predicted_score: number | null;
  review_rating: 'again' | 'hard' | 'good' | 'easy' | null;
  session_id: string | null;
  feedback: string | null;
  corrected: boolean;
  delay_days: number | null;
}

export interface ConceptV2 {
  id: string;
  name: string;
  slug: string;
  details: { id: string; name: string; slug: string }[];
  prerequisites: string[];
  relations: { kind: 'related' | 'contrast' | 'analogy' | 'application'; target_id: string }[];
  evidence: EvidenceV2[];
  calibration: {
    predicted_score: number | null;
    observed_score: number | null;
    samples: number;
    updated_at: string | null;
  };
  review: {
    state: 'new' | 'learning' | 'review' | 'relearning';
    due_at: string | null;
    last_reviewed_at: string | null;
    stability: number;
    difficulty: number;
    scheduled_days: number;
    elapsed_days: number;
    reps: number;
    lapses: number;
    learning_steps: number;
  };
}

export interface StateV2 {
  version: 2;
  id: string;
  topic: string;
  slug: string;
  created_at: string;
  updated_at: string;
  domains: { id: string; name: string; slug: string; concepts: ConceptV2[] }[];
}

export interface MasteryV2 {
  status: ConceptStatus;
  score: number;
  reasons: string[];
}

export interface TopicV2Snapshot {
  state: StateV2;
  revision: string;
  numbering: Record<string, string>;
  mastery: Record<string, MasteryV2>;
}

export interface TopicSummary {
  slug: string;
  name: string;
  domainCount: number;
  totalConcepts: number;
  masteredCount: number;
  percentage: number;
}

export interface TopicFiles {
  sessions: string[];
  exercises: string[];
  quizzes: string[];
}

export interface SelectedFilePayload {
  path: string;
  type: 'markdown' | 'code';
  sourceTab?: 'topics' | 'exercises' | 'quizzes';
  /**
   * Filled in asynchronously after the file content loads.
   * The selection itself (path/type) is available synchronously.
   */
  content?: string;
}

export type OmitQuizSourceType = 'topics' | 'exercises';
