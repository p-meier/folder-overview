import type { DrilldownResult, ScanResult, ScanStatus } from "./types";

export async function startScan(path: string): Promise<{ scanId: string; rootPath: string }> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Failed to start scan");
  }
  return res.json();
}

export function subscribeScan(
  scanId: string,
  onStatus: (s: ScanStatus) => void
): () => void {
  const es = new EventSource(`/api/scan/${scanId}/events`);
  const handler = (e: MessageEvent) => {
    try {
      const status = JSON.parse(e.data) as ScanStatus;
      onStatus(status);
    } catch {
      // ignore
    }
  };
  es.addEventListener("status", handler);
  es.onerror = () => {
    // server closes on done/error; don't reconnect in that case
    es.close();
  };
  return () => es.close();
}

export async function fetchResult(scanId: string): Promise<ScanResult> {
  const res = await fetch(`/api/scan/${scanId}/result`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchDrilldown(
  scanId: string,
  kind: "type" | "folder" | "year",
  key: string
): Promise<DrilldownResult> {
  const res = await fetch(
    `/api/scan/${scanId}/drilldown/${kind}/${encodeURIComponent(key)}`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
