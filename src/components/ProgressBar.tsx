import { formatBytes, formatCount, formatDuration } from "../lib/format";
import type { ProgressSnapshot } from "../types";

interface Props {
  progress: ProgressSnapshot;
}

export function ProgressBar({ progress }: Props) {
  return (
    <div className="progress">
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: "100%" }} />
      </div>
      <div className="progress-stats">
        <div>
          Files <strong>{formatCount(progress.filesScanned)}</strong>
        </div>
        <div>
          Size <strong>{formatBytes(progress.bytesScanned)}</strong>
        </div>
        <div>
          Elapsed <strong>{formatDuration(progress.elapsedMs)}</strong>
        </div>
      </div>
      <div className="progress-current" title={progress.currentPath}>
        {progress.currentPath}
      </div>
    </div>
  );
}
