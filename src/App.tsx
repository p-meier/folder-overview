import { useEffect, useRef, useState } from "react";
import { PathInput } from "./components/PathInput";
import { ProgressBar } from "./components/ProgressBar";
import { ByTypeView } from "./components/ByTypeView";
import { ByAgeView } from "./components/ByAgeView";
import { ByFolderView } from "./components/ByFolderView";
import { fetchResult, startScan, subscribeScan } from "./api";
import type { ScanResult, ScanStatus } from "./types";
import { formatBytes, formatCount, formatDuration } from "./lib/format";

type Tab = "type" | "age" | "folder";

const DEFAULT_PATH = (import.meta.env.VITE_DEFAULT_PATH as string | undefined) ?? "";

export default function App() {
  const [scanId, setScanId] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>({ phase: "idle" });
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("type");
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const handleScan = async (path: string) => {
    setError(null);
    setResult(null);
    setStatus({
      phase: "running",
      progress: { filesScanned: 0, bytesScanned: 0, currentPath: path, elapsedMs: 0 },
    });
    try {
      const { scanId: id } = await startScan(path);
      setScanId(id);
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = subscribeScan(id, async (s) => {
        setStatus(s);
        if (s.phase === "done") {
          try {
            const r = await fetchResult(id);
            setResult(r);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        } else if (s.phase === "error") {
          setError(s.message);
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus({ phase: "idle" });
    }
  };

  const running = status.phase === "running";

  return (
    <div className="app">
      <h1>Folder Overview</h1>
      <p className="subtitle">
        Scan a local folder and see where the space went — by file type, by age,
        by sub-folder. Read-only. Clean up in Finder yourself.
      </p>

      <div className="panel">
        <PathInput
          initialValue={DEFAULT_PATH}
          disabled={running}
          onSubmit={handleScan}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      {running && status.phase === "running" && (
        <div className="panel">
          <ProgressBar progress={status.progress} />
        </div>
      )}

      {result && (
        <>
          <div className="summary-row">
            <SummaryCard label="Root" value={result.rootPath} mono />
            <SummaryCard label="Total size" value={formatBytes(result.totalBytes)} />
            <SummaryCard label="Files" value={formatCount(result.totalFiles)} />
            <SummaryCard label="Scan time" value={formatDuration(result.scanDurationMs)} />
          </div>

          <div className="tabs">
            <button className={`tab ${tab === "type" ? "active" : ""}`} onClick={() => setTab("type")}>
              By Type
            </button>
            <button className={`tab ${tab === "age" ? "active" : ""}`} onClick={() => setTab("age")}>
              By Age
            </button>
            <button className={`tab ${tab === "folder" ? "active" : ""}`} onClick={() => setTab("folder")}>
              By Folder
            </button>
          </div>

          <div className="panel">
            {tab === "type" && scanId && (
              <ByTypeView scanId={scanId} rows={result.byType} totalBytes={result.totalBytes} />
            )}
            {tab === "age" && <ByAgeView rows={result.byAge} />}
            {tab === "folder" && <ByFolderView tree={result.folderTree} />}
          </div>
        </>
      )}

      <div className="footer-note">
        Runs locally. No data leaves this machine.
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="summary-card">
      <div className="label">{label}</div>
      <div
        className="value"
        style={{
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          fontSize: mono ? 13 : undefined,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}
