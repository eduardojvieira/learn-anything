import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export class StateConflictError extends Error {
  constructor(
    public readonly expectedRevision: string,
    public readonly actualRevision: string,
  ) {
    super(`State revision conflict: expected ${expectedRevision}, found ${actualRevision}`);
    this.name = 'StateConflictError';
  }
}

export class StateAlreadyExistsError extends Error {
  constructor(public readonly statePath: string) {
    super(`State already exists: ${statePath}`);
    this.name = 'StateAlreadyExistsError';
  }
}

export class StateLockTimeoutError extends Error {
  constructor(
    public readonly lockPath: string,
    public readonly timeoutMs: number,
  ) {
    super(`Timed out waiting for state lock ${lockPath} after ${timeoutMs}ms`);
    this.name = 'StateLockTimeoutError';
  }
}

export class StateCorruptionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StateCorruptionError';
  }
}

export class StateValidationError extends StateCorruptionError {
  constructor(cause: unknown) {
    super('State validation failed', cause);
    this.name = 'StateValidationError';
  }
}

export class StateRecoveryError extends StateCorruptionError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'StateRecoveryError';
  }
}

export interface StateSnapshot<T> {
  state: T;
  revision: string;
}

export interface StateStoreOptions<T> {
  validate?: (state: T) => void;
  lockTimeoutMs?: number;
  fileName?: 'state.json' | 'session.json' | 'config.json';
}

interface Journal {
  version: 1;
  fromRevision: string;
  toRevision: string;
  tempFile: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class StateStore<T> {
  private readonly statePath: string;
  private readonly tempPath: string;
  private readonly journalPath: string;
  private readonly journalTempPath: string;
  private readonly lockPath: string;
  private readonly lockTimeoutMs: number;
  private readonly tempFile: string;

  constructor(
    private readonly topicDir: string,
    private readonly options: StateStoreOptions<T> = {},
  ) {
    const fileName = options.fileName ?? 'state.json';
    this.tempFile = `.${fileName}.tmp`;
    this.statePath = path.join(topicDir, fileName);
    this.tempPath = path.join(topicDir, this.tempFile);
    this.journalPath = path.join(topicDir, `.${fileName}.journal`);
    this.journalTempPath = path.join(topicDir, `.${fileName}.journal.tmp`);
    this.lockPath = path.join(topicDir, `.${fileName}.lock`);
    this.lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
  }

  async read(): Promise<StateSnapshot<T>> {
    return this.withLock(async () => {
      await this.recover();
      return this.readUnlocked();
    });
  }

  async initialize(initial: T): Promise<StateSnapshot<T>> {
    await fs.mkdir(this.topicDir, { recursive: true });
    return this.withLock(async () => {
      if (await exists(this.journalPath)) {
        if (!(await exists(this.statePath))) {
          throw new StateRecoveryError(
            `State journal exists without ${this.tempFile.slice(1, -4)}; recovery refused`,
          );
        }
        await this.recover();
      }
      if (await exists(this.statePath)) {
        await fs.rm(this.tempPath, { force: true });
        throw new StateAlreadyExistsError(this.statePath);
      }
      await fs.rm(this.tempPath, { force: true });
      this.validate(initial);
      const bytes = canonicalBytes(initial);
      try {
        await this.durableWrite(this.tempPath, bytes);
      } catch (error) {
        await this.clearRecoveryArtifacts();
        throw error;
      }
      try {
        await fs.link(this.tempPath, this.statePath);
      } catch (error) {
        await fs.rm(this.tempPath, { force: true });
        if (isAlreadyExists(error)) throw new StateAlreadyExistsError(this.statePath);
        throw error;
      }
      await this.syncDirectory();
      await fs.rm(this.tempPath, { force: true });
      await this.syncDirectory();
      return { state: initial, revision: revisionOf(bytes) };
    });
  }

  async transact(
    expectedRevision: string,
    mutator: (state: T) => T | Promise<T>,
  ): Promise<StateSnapshot<T>> {
    return this.withLock(async () => {
      await this.recover();
      const current = await this.readUnlocked();
      if (current.revision !== expectedRevision) {
        throw new StateConflictError(expectedRevision, current.revision);
      }

      const next = await mutator(current.state);
      this.validate(next);
      const bytes = canonicalBytes(next);
      const nextRevision = revisionOf(bytes);
      const journal: Journal = {
        version: 1,
        fromRevision: current.revision,
        toRevision: nextRevision,
        tempFile: this.tempFile,
      };

      await this.atomicDurableWrite(
        this.journalPath,
        this.journalTempPath,
        canonicalBytes(journal),
      );
      try {
        await this.durableWrite(this.tempPath, bytes);
      } catch (error) {
        await this.clearRecoveryArtifacts();
        throw error;
      }
      await fs.rename(this.tempPath, this.statePath);
      await this.syncDirectory();
      await fs.rm(this.journalPath, { force: true });
      await this.syncDirectory();
      return { state: next, revision: nextRevision };
    });
  }

  private async readUnlocked(): Promise<StateSnapshot<T>> {
    const bytes = await this.readStateBytes(this.statePath);
    const state = this.parseState(bytes, this.statePath);
    return { state, revision: revisionOf(canonicalBytes(state)) };
  }

  private async recover(): Promise<void> {
    if (!(await exists(this.journalPath))) {
      await Promise.all([
        fs.rm(this.tempPath, { force: true }),
        fs.rm(this.journalTempPath, { force: true }),
      ]);
      return;
    }

    const journal = this.parseJournal(await this.readStateBytes(this.journalPath));
    const currentBytes = await this.readStateBytes(this.statePath);
    const currentState = this.parseState(currentBytes, this.statePath);
    const currentRevision = revisionOf(canonicalBytes(currentState));

    if (currentRevision === journal.toRevision) {
      await this.clearRecoveryArtifacts();
      return;
    }
    if (currentRevision !== journal.fromRevision) {
      throw new StateRecoveryError('State differs from both journal revisions; recovery refused');
    }
    if (!(await exists(this.tempPath))) {
      await fs.rm(this.journalPath, { force: true });
      await this.syncDirectory();
      return;
    }

    const replacementBytes = await this.readStateBytes(this.tempPath);
    let replacementState: T;
    try {
      replacementState = this.parseState(replacementBytes, this.tempPath);
      if (revisionOf(canonicalBytes(replacementState)) !== journal.toRevision)
        throw new Error('revision mismatch');
    } catch {
      await this.clearRecoveryArtifacts();
      return;
    }
    await fs.rename(this.tempPath, this.statePath);
    await this.syncDirectory();
    await this.clearRecoveryArtifacts();
  }

  private async clearRecoveryArtifacts(): Promise<void> {
    await Promise.all([
      fs.rm(this.tempPath, { force: true }),
      fs.rm(this.journalPath, { force: true }),
      fs.rm(this.journalTempPath, { force: true }),
    ]);
    await this.syncDirectory();
  }

  private parseState(bytes: Buffer, source: string): T {
    let state: T;
    try {
      state = JSON.parse(bytes.toString('utf8')) as T;
    } catch (error) {
      throw new StateCorruptionError(`Invalid JSON in ${source}`, error);
    }
    this.validate(state);
    return state;
  }

  private validate(state: T): void {
    try {
      this.options.validate?.(state);
    } catch (error) {
      throw error instanceof StateCorruptionError ? error : new StateValidationError(error);
    }
  }

  private parseJournal(bytes: Buffer): Journal {
    try {
      const value = JSON.parse(bytes.toString('utf8')) as Partial<Journal>;
      if (
        value.version !== 1 ||
        typeof value.fromRevision !== 'string' ||
        typeof value.toRevision !== 'string' ||
        value.tempFile !== this.tempFile
      ) {
        throw new Error('unexpected journal shape');
      }
      return value as Journal;
    } catch (error) {
      throw new StateRecoveryError('Invalid state journal; recovery refused', error);
    }
  }

  private async withLock<R>(operation: () => Promise<R>): Promise<R> {
    const startedAt = Date.now();
    const token = randomUUID();
    while (true) {
      try {
        await this.acquireLock(token);
        break;
      } catch (error) {
        if (!isLockOccupied(error)) throw error;
        await this.reclaimDeadLock();
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          throw new StateLockTimeoutError(this.lockPath, this.lockTimeoutMs);
        }
        await sleep(10);
      }
    }
    try {
      return await operation();
    } finally {
      await this.releaseLock(token);
    }
  }

  private async acquireLock(token: string): Promise<void> {
    const pending = `${this.lockPath}.tmp-${token}`;
    let published = false;
    await fs.mkdir(pending, { mode: 0o700 });
    try {
      await this.durableWrite(
        path.join(pending, 'owner.json'),
        canonicalBytes({
          version: 2,
          pid: process.pid,
          token,
          instance: await processIdentity(process.pid),
        }),
      );
      await syncDirectoryPath(pending);
      await fs.rename(pending, this.lockPath);
      published = true;
      await this.syncDirectory();
    } catch (error) {
      await fs.rm(pending, { recursive: true, force: true });
      if (published) await this.releaseLock(token);
      throw error;
    }
  }

  private async reclaimDeadLock(): Promise<void> {
    let owner: { version: number; pid: number; token: string; instance?: string };
    try {
      const entries = await fs.readdir(this.lockPath);
      const ownerPath = path.join(this.lockPath, 'owner.json');
      if (!entries.includes('owner.json')) {
        if (entries.every((name) => /^\.(stale|release)-.+\.json$/.test(name))) {
          await Promise.all(
            entries.map((name) => fs.rm(path.join(this.lockPath, name), { force: true })),
          );
          await fs.rmdir(this.lockPath).catch(() => undefined);
        }
        return;
      }
      owner = JSON.parse(await fs.readFile(ownerPath, 'utf8')) as typeof owner;
      if (
        (owner.version !== 1 && owner.version !== 2) ||
        !Number.isSafeInteger(owner.pid) ||
        owner.pid <= 0 ||
        !isUuid(owner.token)
      )
        return;
      try {
        process.kill(owner.pid, 0);
        if (owner.version !== 2 || !isProcessIdentity(owner.instance)) return;
        const current = await processIdentity(owner.pid);
        if (!current || current === owner.instance) return;
      } catch (error) {
        if (!isNoSuchProcess(error)) return;
      }
      const marker = path.join(this.lockPath, `.stale-${owner.token}.json`);
      await fs.rename(ownerPath, marker);
      await fs.rm(marker, { force: true });
      await fs.rmdir(this.lockPath).catch(() => undefined);
    } catch (error) {
      if (isNotFound(error) || isAlreadyExists(error) || isNotDirectory(error)) return;
      throw error;
    }
  }

  private async releaseLock(token: string): Promise<void> {
    const owner = path.join(this.lockPath, 'owner.json');
    const marker = path.join(this.lockPath, `.release-${token}.json`);
    try {
      const value = JSON.parse(await fs.readFile(owner, 'utf8')) as { token?: string };
      if (value.token !== token) return;
      await fs.rename(owner, marker);
      await fs.rm(marker, { force: true });
      await fs.rmdir(this.lockPath).catch(() => undefined);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  private async readStateBytes(filePath: string): Promise<Buffer> {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      throw new StateCorruptionError(`Unable to read ${filePath}`, error);
    }
  }

  private async durableWrite(filePath: string, bytes: Buffer): Promise<void> {
    const handle = await fs.open(filePath, 'w', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async atomicDurableWrite(target: string, temp: string, bytes: Buffer): Promise<void> {
    await this.durableWrite(temp, bytes);
    await fs.rename(temp, target);
    await this.syncDirectory();
  }

  private async syncDirectory(): Promise<void> {
    try {
      const directory = await fs.open(this.topicDir, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch (error) {
      if (!isUnsupportedDirectorySync(error)) throw error;
    }
  }
}

function canonicalBytes(value: unknown): Buffer {
  try {
    const json = JSON.stringify(value, null, 2);
    if (json === undefined) throw new Error('state is not JSON serializable');
    const parsed = JSON.parse(json);
    if (!isDeepStrictEqual(value, parsed))
      throw new Error('state is not losslessly JSON serializable');
    return Buffer.from(`${json}\n`);
  } catch (error) {
    throw new StateValidationError(error);
  }
}

async function syncDirectoryPath(directoryPath: string): Promise<void> {
  try {
    const directory = await fs.open(directoryPath, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) throw error;
  }
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ESRCH'
  );
}

function isNotDirectory(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOTDIR'
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

async function processIdentity(pid: number): Promise<string | null> {
  if (process.platform !== 'linux') return null;
  try {
    const [bootId, stat] = await Promise.all([
      fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
      fs.readFile(`/proc/${pid}/stat`, 'utf8'),
    ]);
    const close = stat.lastIndexOf(')');
    const startTime = stat
      .slice(close + 2)
      .trim()
      .split(/\s+/)[19];
    const identity = `${bootId.trim()}:${startTime ?? ''}`;
    return isProcessIdentity(identity) ? identity : null;
  } catch {
    return null;
  }
}

function isProcessIdentity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d+$/i.test(value)
  );
}

function revisionOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  );
}

function isLockOccupied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ['EEXIST', 'ENOTEMPTY', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
  );
}

function isUnsupportedDirectorySync(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ['EINVAL', 'EPERM', 'ENOTSUP', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
  );
}
