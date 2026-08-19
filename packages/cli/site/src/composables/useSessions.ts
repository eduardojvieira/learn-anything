import { ref } from 'vue';

export interface SessionSummary {
  id: string;
  concept_id: string;
  concept_name: string;
  kind: 'study' | 'explain' | 'practice' | 'review' | 'quiz';
  locale: 'en' | 'es' | 'zh-CN';
  created_at: string;
  updated_at: string;
  revision: string;
}

export interface LearningSession {
  version: 1;
  id: string;
  topic_id: string;
  topic_revision: string;
  topic_name: string;
  concept_id: string;
  concept_name: string;
  kind: SessionSummary['kind'];
  locale: SessionSummary['locale'];
  created_at: string;
  updated_at: string;
  blocks: { id: string; kind: string; text: string }[];
  socratic_prompts: {
    id: string;
    prompt: string;
    responses: { id: string; response: string; submitted_at: string }[];
  }[];
}

interface PendingWrite {
  questionId: string;
  response: string;
  submittedAt: string;
  idempotencyKey: string;
}

export function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function responseRevision(response: Response, body: { revision?: string }): string | null {
  return body.revision ?? response.headers.get('ETag')?.replace(/^"|"$/g, '') ?? null;
}

function nextSubmittedAt(current: string, now: string): string {
  return Date.parse(now) > Date.parse(current)
    ? now
    : new Date(Date.parse(current) + 1).toISOString();
}

export function createSessionStore(
  slug: string,
  makeKey: () => string = createIdempotencyKey,
  now = () => new Date().toISOString(),
) {
  const sessions = ref<SessionSummary[]>([]);
  const session = ref<LearningSession | null>(null);
  const revision = ref<string | null>(null);
  const selectedId = ref<string | null>(null);
  const drafts = ref<Record<string, string>>({});
  const pending = new Map<string, PendingWrite>();
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const saving = ref<string | null>(null);
  const listError = ref(false);
  const detailError = ref(false);
  const writeError = ref<string | null>(null);
  const conflict = ref<string | null>(null);
  const saved = ref<string | null>(null);
  let selectionGeneration = 0;

  function isDirty(questionId: string): boolean {
    const prompt = session.value?.socratic_prompts.find((entry) => entry.id === questionId);
    if (!prompt) return false;
    return drafts.value[questionId] !== (prompt.responses.at(-1)?.response ?? '');
  }

  function hydrateDrafts(next: LearningSession) {
    const values = { ...drafts.value };
    for (const prompt of next.socratic_prompts) {
      if (values[prompt.id] === undefined)
        values[prompt.id] = prompt.responses.at(-1)?.response ?? '';
    }
    drafts.value = values;
  }

  async function loadList() {
    if (listLoading.value || saving.value !== null) return;
    listLoading.value = true;
    listError.value = false;
    try {
      const response = await fetch(`/api/topics/${encodeURIComponent(slug)}/sessions`);
      if (!response.ok) throw new Error('list failed');
      const body = (await response.json()) as { sessions: SessionSummary[] };
      sessions.value = [...body.sessions].sort(
        (left, right) =>
          right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
      );
    } catch {
      listError.value = true;
    } finally {
      listLoading.value = false;
    }
  }

  async function select(id: string): Promise<boolean> {
    if (saving.value !== null) return false;
    const requestGeneration = ++selectionGeneration;
    const switching = selectedId.value !== id;
    selectedId.value = id;
    if (switching) {
      pending.clear();
      writeError.value = null;
      conflict.value = null;
      saved.value = null;
    }
    detailLoading.value = true;
    detailError.value = false;
    try {
      const response = await fetch(
        `/api/topics/${encodeURIComponent(slug)}/sessions/${encodeURIComponent(id)}`,
      );
      if (!response.ok) throw new Error('detail failed');
      const body = (await response.json()) as { session: LearningSession; revision: string };
      if (requestGeneration !== selectionGeneration) return false;
      session.value = body.session;
      revision.value = responseRevision(response, body);
      hydrateDrafts(body.session);
      conflict.value = null;
      return true;
    } catch {
      if (requestGeneration === selectionGeneration) detailError.value = true;
      return false;
    } finally {
      if (requestGeneration === selectionGeneration) detailLoading.value = false;
    }
  }

  function setDraft(questionId: string, response: string) {
    const retry = pending.get(questionId);
    if (retry && retry.response !== response) {
      pending.delete(questionId);
      if (writeError.value === questionId) writeError.value = null;
    }
    drafts.value = { ...drafts.value, [questionId]: response };
    saved.value = saved.value === questionId ? null : saved.value;
  }

  async function send(write: PendingWrite) {
    if (!session.value || !revision.value) return;
    const sessionId = session.value.id;
    saving.value = write.questionId;
    if (writeError.value === write.questionId) writeError.value = null;
    try {
      const response = await fetch(
        `/api/topics/${encodeURIComponent(slug)}/sessions/${encodeURIComponent(session.value.id)}/socratic/${encodeURIComponent(write.questionId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `"${revision.value}"`,
            'Idempotency-Key': write.idempotencyKey,
          },
          body: JSON.stringify({ response: write.response, submitted_at: write.submittedAt }),
        },
      );
      if (response.ok) {
        const body = (await response.json()) as { session: LearningSession; revision: string };
        if (session.value?.id !== sessionId || selectedId.value !== sessionId) return;
        session.value = body.session;
        revision.value = responseRevision(response, body);
        pending.delete(write.questionId);
        saved.value = write.questionId;
        conflict.value = null;
        return;
      }
      if (response.status === 409 || response.status === 412) {
        conflict.value = write.questionId;
        return;
      }
      throw new Error('write failed');
    } catch {
      writeError.value = write.questionId;
    } finally {
      saving.value = null;
    }
  }

  async function save(questionId: string, response = drafts.value[questionId] ?? '') {
    if (!session.value || saving.value !== null) return;
    if (drafts.value[questionId] !== response) setDraft(questionId, response);
    if (!isDirty(questionId)) return;
    const previous = pending.get(questionId);
    const write =
      previous?.response === response
        ? previous
        : {
            questionId,
            response,
            submittedAt: nextSubmittedAt(session.value.updated_at, now()),
            idempotencyKey: makeKey(),
          };
    pending.set(questionId, write);
    await writeResponse(write);
  }

  async function writeResponse(pendingWrite: PendingWrite) {
    await send(pendingWrite);
  }

  async function retry(questionId: string) {
    if (saving.value !== null) return;
    const write = pending.get(questionId);
    if (write) await writeResponse(write);
  }

  async function reload() {
    if (!selectedId.value || saving.value !== null) return;
    const id = selectedId.value;
    const conflictedQuestion = conflict.value;
    if ((await select(id)) && conflictedQuestion) {
      pending.delete(conflictedQuestion);
      conflict.value = null;
    }
  }

  return {
    sessions,
    session,
    revision,
    selectedId,
    drafts,
    listLoading,
    detailLoading,
    saving,
    listError,
    detailError,
    writeError,
    conflict,
    saved,
    isDirty,
    loadList,
    select,
    setDraft,
    save,
    retry,
    reload,
  };
}
export function formatSessionDate(value: string, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}
