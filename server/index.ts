import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { aggregate } from "./aggregate.ts";
import { startScan, type Scanner } from "./scanner.ts";
import type { FileEntry, ScanResult, ScanStatus } from "./types.ts";

const PORT = Number(process.env.SERVER_PORT ?? 5174);
const DIST_DIR = resolve(import.meta.dir, "..", "dist");
const TOP_FILES_DRILLDOWN = 50;

interface ScanState {
  id: string;
  rootPath: string;
  scanner: Scanner;
  status: ScanStatus;
  files?: FileEntry[];
  result?: ScanResult;
  subscribers: Set<(s: ScanStatus) => void>;
}

const scans = new Map<string, ScanState>();

function expandPath(raw: string): string {
  let p = raw.trim();
  if (!p) throw new Error("Path must not be empty");
  if (p === "~") p = homedir();
  else if (p.startsWith("~/")) p = join(homedir(), p.slice(2));
  return resolve(p);
}

function beginScan(rawPath: string): ScanState {
  const rootPath = expandPath(rawPath);
  if (!existsSync(rootPath)) {
    throw new Error(`Path does not exist: ${rootPath}`);
  }
  if (!statSync(rootPath).isDirectory()) {
    throw new Error(`Path is not a directory: ${rootPath}`);
  }

  const scanner = startScan(rootPath);
  const state: ScanState = {
    id: randomUUID(),
    rootPath,
    scanner,
    status: {
      phase: "running",
      progress: { filesScanned: 0, bytesScanned: 0, currentPath: rootPath, elapsedMs: 0 },
    },
    subscribers: new Set(),
  };

  scanner.on("progress", (progress) => {
    state.status = { phase: "running", progress };
    for (const s of state.subscribers) s(state.status);
  });
  scanner.on("done", ({ files, rootPath: rp, elapsedMs }) => {
    state.files = files;
    const result = aggregate(files, rp, elapsedMs);
    state.result = result;
    state.status = { phase: "done", result };
    for (const s of state.subscribers) s(state.status);
  });
  scanner.on("error", ({ message }) => {
    state.status = { phase: "error", message };
    for (const s of state.subscribers) s(state.status);
  });

  scans.set(state.id, state);
  return state;
}

function sseResponse(state: ScanState): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // stream already closed
        }
      };

      send("status", state.status);
      if (state.status.phase === "done" || state.status.phase === "error") {
        controller.close();
        return;
      }

      const listener = (status: ScanStatus) => {
        send("status", status);
        if (status.phase === "done" || status.phase === "error") {
          try { controller.close(); } catch { /* noop */ }
        }
      };
      state.subscribers.add(listener);
      unsubscribe = () => state.subscribers.delete(listener);

      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": keepalive\n\n")); }
        catch { /* noop */ }
      }, 15_000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveStatic(pathname: string): Promise<Response> {
  if (!existsSync(DIST_DIR)) {
    return new Response(
      "UI bundle not found. Run `bun run build` first, or start `bun run dev` for the dev UI on :5173.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
  const requested = pathname === "/" ? "/index.html" : pathname;
  const fsPath = join(DIST_DIR, requested);
  if (!fsPath.startsWith(DIST_DIR)) return new Response("Forbidden", { status: 403 });
  if (existsSync(fsPath) && statSync(fsPath).isFile()) {
    const ext = extname(fsPath).toLowerCase();
    const data = await readFile(fsPath);
    return new Response(data, {
      headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
    });
  }
  const indexPath = join(DIST_DIR, "index.html");
  if (existsSync(indexPath)) {
    const data = await readFile(indexPath);
    return new Response(data, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return new Response("Not found", { status: 404 });
}

function handleDrilldown(state: ScanState, kind: string, key: string): Response {
  if (!state.files || !state.result) {
    return errorResponse("Scan not finished yet", 409);
  }
  const files = state.files;
  let matching: FileEntry[] = [];
  if (kind === "type") {
    const ext = key === "(none)" ? "" : key.toLowerCase();
    matching = files.filter((f) => (f.ext || "") === ext);
  } else if (kind === "folder") {
    const prefix = key === "" ? "" : `${key}/`;
    matching = files.filter((f) => key === "" || f.relPath === key || f.relPath.startsWith(prefix));
  } else if (kind === "year") {
    const year = Number(key);
    matching = files.filter((f) => new Date(f.mtimeMs).getFullYear() === year);
  } else {
    return errorResponse(`Unknown drilldown kind: ${kind}`, 400);
  }

  const top = [...matching]
    .sort((a, b) => b.size - a.size)
    .slice(0, TOP_FILES_DRILLDOWN)
    .map((f) => ({ relPath: f.relPath, size: f.size, mtimeMs: f.mtimeMs, ext: f.ext }));

  return jsonResponse({
    count: matching.length,
    totalSize: matching.reduce((s, f) => s + f.size, 0),
    topFiles: top,
  });
}

const SCAN_EVENTS_RE = /^\/api\/scan\/([^/]+)\/events$/;
const SCAN_RESULT_RE = /^\/api\/scan\/([^/]+)\/result$/;
const SCAN_DRILL_RE = /^\/api\/scan\/([^/]+)\/drilldown\/([^/]+)\/(.+)$/;

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === "/api/health") {
      return jsonResponse({ ok: true });
    }

    if (pathname === "/api/scan" && req.method === "POST") {
      let body: { path?: string };
      try { body = await req.json(); }
      catch { return errorResponse("Invalid JSON body"); }
      if (!body.path) return errorResponse("Missing `path`");
      try {
        const state = beginScan(body.path);
        return jsonResponse({ scanId: state.id, rootPath: state.rootPath });
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : String(err));
      }
    }

    const eventsMatch = pathname.match(SCAN_EVENTS_RE);
    if (eventsMatch) {
      const state = scans.get(eventsMatch[1]);
      if (!state) return errorResponse("Unknown scan id", 404);
      return sseResponse(state);
    }

    const resultMatch = pathname.match(SCAN_RESULT_RE);
    if (resultMatch) {
      const state = scans.get(resultMatch[1]);
      if (!state) return errorResponse("Unknown scan id", 404);
      if (!state.result) return errorResponse("Scan not finished yet", 409);
      return jsonResponse(state.result);
    }

    const drillMatch = pathname.match(SCAN_DRILL_RE);
    if (drillMatch) {
      const state = scans.get(drillMatch[1]);
      if (!state) return errorResponse("Unknown scan id", 404);
      const kind = drillMatch[2];
      const key = decodeURIComponent(drillMatch[3]);
      return handleDrilldown(state, kind, key);
    }

    if (pathname.startsWith("/api/")) {
      return errorResponse("Not found", 404);
    }

    return serveStatic(pathname);
  },
});

console.log(`folder-overview listening on http://127.0.0.1:${PORT}`);
