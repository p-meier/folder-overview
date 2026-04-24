import { readdir, lstat, stat } from "node:fs/promises";
import { join, relative, extname, sep } from "node:path";
import { EventEmitter } from "node:events";
import type { FileEntry, ProgressSnapshot } from "./types.ts";

const PROGRESS_INTERVAL_MS = 250;
const STAT_CONCURRENCY = 16;

export interface Scanner extends EventEmitter {
  on(event: "progress", listener: (p: ProgressSnapshot) => void): this;
  on(event: "done", listener: (r: { files: FileEntry[]; rootPath: string; elapsedMs: number }) => void): this;
  on(event: "error", listener: (err: { message: string }) => void): this;
  emit(event: "progress", p: ProgressSnapshot): boolean;
  emit(event: "done", r: { files: FileEntry[]; rootPath: string; elapsedMs: number }): boolean;
  emit(event: "error", err: { message: string }): boolean;
}

export function startScan(rootPath: string): Scanner {
  const emitter = new EventEmitter() as Scanner;
  const startedAt = Date.now();
  const files: FileEntry[] = [];
  let filesScanned = 0;
  let bytesScanned = 0;
  let currentPath = rootPath;
  let lastProgressAt = 0;

  const maybeEmitProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
    lastProgressAt = now;
    emitter.emit("progress", {
      filesScanned,
      bytesScanned,
      currentPath,
      elapsedMs: now - startedAt,
    });
  };

  const walk = async () => {
    const stack: string[] = [rootPath];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      currentPath = dir;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      const fileEntries: string[] = [];
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile()) {
          fileEntries.push(full);
        }
      }

      for (let i = 0; i < fileEntries.length; i += STAT_CONCURRENCY) {
        const chunk = fileEntries.slice(i, i + STAT_CONCURRENCY);
        const stats = await Promise.all(
          chunk.map(async (p) => {
            try {
              const s = await lstat(p);
              return { p, s };
            } catch {
              return null;
            }
          })
        );
        for (const r of stats) {
          if (!r || !r.s.isFile()) continue;
          const rel = relative(rootPath, r.p) || r.p.split(sep).pop()!;
          files.push({
            relPath: rel,
            size: r.s.size,
            mtimeMs: r.s.mtimeMs,
            ext: extname(r.p).toLowerCase(),
          });
          filesScanned += 1;
          bytesScanned += r.s.size;
        }
        maybeEmitProgress();
      }
      maybeEmitProgress();
    }
  };

  (async () => {
    try {
      const rootStat = await stat(rootPath);
      if (!rootStat.isDirectory()) {
        emitter.emit("error", { message: `Not a directory: ${rootPath}` });
        return;
      }
      await walk();
      maybeEmitProgress(true);
      emitter.emit("done", {
        files,
        rootPath,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (err) {
      emitter.emit("error", { message: err instanceof Error ? err.message : String(err) });
    }
  })();

  return emitter;
}
