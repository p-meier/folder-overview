import { basename, sep } from "node:path";
import type {
  ByAgeRow,
  ByTypeRow,
  FileEntry,
  FolderNode,
  ScanResult,
} from "./types.ts";

const TOP_FILES_PER_AGE = 10;
const OTHER_THRESHOLD_RATIO = 0.001;

export function aggregate(
  files: FileEntry[],
  rootPath: string,
  scanDurationMs: number
): ScanResult {
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const totalFiles = files.length;
  return {
    rootPath,
    totalFiles,
    totalBytes,
    scanDurationMs,
    byType: byType(files, totalBytes),
    byAge: byAge(files),
    folderTree: byFolder(files, rootPath),
  };
}

function byType(files: FileEntry[], totalBytes: number): ByTypeRow[] {
  const map = new Map<string, ByTypeRow>();
  for (const f of files) {
    const key = f.ext || "(none)";
    let row = map.get(key);
    if (!row) {
      row = { ext: key, totalSize: 0, count: 0 };
      map.set(key, row);
    }
    row.totalSize += f.size;
    row.count += 1;
  }
  const rows = [...map.values()].sort((a, b) => b.totalSize - a.totalSize);

  if (totalBytes === 0) return rows;
  const threshold = totalBytes * OTHER_THRESHOLD_RATIO;
  const kept: ByTypeRow[] = [];
  const other: ByTypeRow = { ext: "(other)", totalSize: 0, count: 0 };
  for (const r of rows) {
    if (r.totalSize >= threshold) kept.push(r);
    else {
      other.totalSize += r.totalSize;
      other.count += r.count;
    }
  }
  if (other.count > 0) kept.push(other);
  return kept;
}

function byAge(files: FileEntry[]): ByAgeRow[] {
  const buckets = new Map<number, FileEntry[]>();
  const rows = new Map<number, ByAgeRow>();
  for (const f of files) {
    const year = new Date(f.mtimeMs).getFullYear();
    let row = rows.get(year);
    if (!row) {
      row = { year, totalSize: 0, count: 0, topFiles: [] };
      rows.set(year, row);
      buckets.set(year, []);
    }
    row.totalSize += f.size;
    row.count += 1;
    buckets.get(year)!.push(f);
  }
  for (const [year, row] of rows) {
    row.topFiles = buckets
      .get(year)!
      .sort((a, b) => b.size - a.size)
      .slice(0, TOP_FILES_PER_AGE)
      .map((f) => ({ relPath: f.relPath, size: f.size, mtimeMs: f.mtimeMs }));
  }
  return [...rows.values()].sort((a, b) => a.year - b.year);
}

interface MutableNode {
  name: string;
  relPath: string;
  ownSize: number;
  ownFileCount: number;
  children: Map<string, MutableNode>;
}

function makeNode(name: string, relPath: string): MutableNode {
  return {
    name,
    relPath,
    ownSize: 0,
    ownFileCount: 0,
    children: new Map(),
  };
}

function byFolder(files: FileEntry[], rootPath: string): FolderNode {
  const root = makeNode(basename(rootPath) || rootPath, "");

  for (const f of files) {
    const parts = f.relPath.split(sep);
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i];
      let child = node.children.get(name);
      if (!child) {
        const rel = parts.slice(0, i + 1).join(sep);
        child = makeNode(name, rel);
        node.children.set(name, child);
      }
      node = child;
    }
    node.ownSize += f.size;
    node.ownFileCount += 1;
  }

  const freeze = (n: MutableNode): FolderNode => {
    const children = [...n.children.values()]
      .map(freeze)
      .sort((a, b) => b.recursiveSize - a.recursiveSize);
    const recursiveSize =
      n.ownSize + children.reduce((s, c) => s + c.recursiveSize, 0);
    const recursiveFileCount =
      n.ownFileCount + children.reduce((s, c) => s + c.recursiveFileCount, 0);
    return {
      name: n.name,
      relPath: n.relPath,
      ownSize: n.ownSize,
      ownFileCount: n.ownFileCount,
      recursiveSize,
      recursiveFileCount,
      children,
    };
  };

  return freeze(root);
}
