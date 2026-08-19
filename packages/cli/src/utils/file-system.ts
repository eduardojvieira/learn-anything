import { promises as fs } from 'fs';
import path from 'path';

export interface GeneratedFile {
  path: string;
  content: string;
}

export class GeneratedFileConflictError extends Error {
  constructor(
    readonly filePath: string,
    readonly forceAllowed: boolean,
  ) {
    super(`Generated file conflict: "${filePath}"`);
    this.name = 'GeneratedFileConflictError';
  }
}

export class UnsafePathError extends Error {
  constructor(public readonly path: string) {
    super(`Unsafe path: "${path}" must be a real directory`);
    this.name = 'UnsafePathError';
  }
}

export class FileSystemUtils {
  static async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  static async ensureSafeDirectories(root: string, ...segments: string[]): Promise<string> {
    let current = root;
    for (const segment of segments) {
      current = path.join(current, segment);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new UnsafePathError(current);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
        await fs.mkdir(current);
      }
    }
    return current;
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    await FileSystemUtils.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
  }

  static async writeGeneratedFiles(
    files: GeneratedFile[],
    force: boolean,
    projectRoot: string,
  ): Promise<void> {
    const uniqueFiles = new Map<string, GeneratedFile>();
    for (const file of files) {
      const existing = uniqueFiles.get(file.path);
      if (existing && existing.content !== file.content) {
        throw new Error(`Generated file target collision: "${file.path}"`);
      }
      uniqueFiles.set(file.path, file);
    }

    const changed: GeneratedFile[] = [];
    for (const file of uniqueFiles.values()) {
      await FileSystemUtils.validateGeneratedTarget(file.path, projectRoot);
      const status = await FileSystemUtils.generatedFileStatus(file);
      if (status === 'changed') {
        if (!force) throw new GeneratedFileConflictError(file.path, true);
        changed.push(file);
      } else if (status === 'missing') {
        changed.push(file);
      }
    }

    for (const file of changed)
      await FileSystemUtils.replaceGeneratedFile(file, force, projectRoot);
  }

  private static async validateGeneratedTarget(
    filePath: string,
    projectRoot: string,
  ): Promise<void> {
    const target = path.resolve(filePath);
    const relative = path.relative(projectRoot, target);
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new GeneratedFileConflictError(target, false);
    }

    let current = projectRoot;
    for (const segment of relative.split(path.sep).slice(0, -1)) {
      current = path.join(current, segment);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new GeneratedFileConflictError(target, false);
        }
      } catch (error: any) {
        if (error?.code === 'ENOENT') return;
        throw error;
      }
    }
  }

  private static async generatedFileStatus(
    file: GeneratedFile,
  ): Promise<'missing' | 'same' | 'changed'> {
    try {
      const stat = await fs.lstat(file.path);
      if (!stat.isFile()) throw new GeneratedFileConflictError(file.path, false);
      return (await fs.readFile(file.path)).equals(Buffer.from(file.content, 'utf8'))
        ? 'same'
        : 'changed';
    } catch (error: any) {
      if (error?.code === 'ENOENT') return 'missing';
      throw error;
    }
  }

  private static async replaceGeneratedFile(
    file: GeneratedFile,
    force: boolean,
    projectRoot: string,
  ): Promise<void> {
    await FileSystemUtils.validateGeneratedTarget(file.path, projectRoot);
    await FileSystemUtils.ensureGeneratedParent(file.path, projectRoot);
    const base = path.basename(file.path);
    const tempPath = path.join(
      path.dirname(file.path),
      `.${base}.learn-anything-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
    );
    try {
      await fs.writeFile(tempPath, file.content, { encoding: 'utf8', flag: 'wx' });
      const current = await FileSystemUtils.generatedFileStatus(file);
      if (current === 'same') return;
      if (current === 'changed' && !force) throw new GeneratedFileConflictError(file.path, true);
      await fs.rename(tempPath, file.path);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  private static async ensureGeneratedParent(filePath: string, projectRoot: string): Promise<void> {
    const relative = path.relative(projectRoot, path.resolve(filePath));
    let current = projectRoot;
    for (const segment of relative.split(path.sep).slice(0, -1)) {
      current = path.join(current, segment);
      try {
        await fs.mkdir(current);
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
      }
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new GeneratedFileConflictError(path.resolve(filePath), false);
      }
    }
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  static async removeDir(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }
}
