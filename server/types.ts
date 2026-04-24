export interface FileEntry {
  relPath: string;
  size: number;
  mtimeMs: number;
  ext: string;
}

export interface ProgressSnapshot {
  filesScanned: number;
  bytesScanned: number;
  currentPath: string;
  elapsedMs: number;
}

export interface ByTypeRow {
  ext: string;
  totalSize: number;
  count: number;
}

export interface ByAgeRow {
  year: number;
  totalSize: number;
  count: number;
  topFiles: Array<{ relPath: string; size: number; mtimeMs: number }>;
}

export interface FolderNode {
  name: string;
  relPath: string;
  ownSize: number;
  recursiveSize: number;
  ownFileCount: number;
  recursiveFileCount: number;
  children: FolderNode[];
}

export interface ScanResult {
  rootPath: string;
  totalFiles: number;
  totalBytes: number;
  scanDurationMs: number;
  byType: ByTypeRow[];
  byAge: ByAgeRow[];
  folderTree: FolderNode;
}

export type ScanStatus =
  | { phase: "running"; progress: ProgressSnapshot }
  | { phase: "done"; result: ScanResult }
  | { phase: "error"; message: string };
