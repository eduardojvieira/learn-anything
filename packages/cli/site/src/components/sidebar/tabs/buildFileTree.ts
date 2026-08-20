export interface FileLeaf {
  type: 'file';
  name: string;
  path: string;
}

export interface DirNode {
  type: 'dir';
  name: string;
  label?: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileLeaf | DirNode;

export interface FileTreeOptions {
  rootOrder?: string[];
  directoryLabels?: Record<string, string>;
}

function assetRank(name: string): number {
  if (name === 'README.md') return 0;
  if (/^starter\./i.test(name)) return 1;
  if (/^solution\./i.test(name)) return 2;
  return 3;
}

function sortTree(nodes: TreeNode[], rootOrder: Map<string, number>, depth: number): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    if (depth === 0 && a.type === 'dir' && b.type === 'dir') {
      const aOrder = rootOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = rootOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
    if (rootOrder.size > 0 && a.type === 'file' && b.type === 'file') {
      const aRank = assetRank(a.name);
      const bRank = assetRank(b.name);
      if (aRank !== bRank) return aRank - bRank;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.type === 'dir') sortTree(node.children, rootOrder, depth + 1);
  }
}

export function buildFileTree(paths: string[], options: FileTreeOptions = {}): TreeNode[] {
  const root: DirNode = { type: 'dir', name: '', path: '', children: [] };
  const dirs = new Map<string, DirNode>();
  dirs.set('', root);

  for (const fullPath of paths) {
    const segments = fullPath.split('/');
    segments.shift();
    const filename = segments.pop()!;
    let prefix = '';
    for (const segment of segments) {
      const childPath = prefix ? `${prefix}/${segment}` : segment;
      if (!dirs.has(childPath)) {
        const label = prefix ? undefined : options.directoryLabels?.[segment];
        const dir: DirNode = {
          type: 'dir',
          name: segment,
          ...(label ? { label } : {}),
          path: childPath,
          children: [],
        };
        dirs.set(childPath, dir);
        dirs.get(prefix)!.children.push(dir);
      }
      prefix = childPath;
    }
    dirs.get(prefix)!.children.push({
      type: 'file',
      name: filename,
      path: fullPath,
    });
  }

  sortTree(
    root.children,
    new Map((options.rootOrder ?? []).map((slug, index) => [slug, index])),
    0,
  );
  return root.children;
}

export function ancestorDirPaths(fullRelPath: string): string[] {
  const parts = fullRelPath.split('/');
  if (parts.length < 2) return [];
  parts.shift();
  parts.pop();
  const result: string[] = [];
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    result.push(acc);
  }
  return result;
}

export function collectFiles(nodes: TreeNode[]): FileLeaf[] {
  const result: FileLeaf[] = [];
  for (const node of nodes) {
    if (node.type === 'file') result.push(node);
    else result.push(...collectFiles(node.children));
  }
  return result;
}
