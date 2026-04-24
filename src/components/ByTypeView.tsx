import { Fragment, useState } from "react";
import type { ByTypeRow, DrilldownResult } from "../types";
import { formatBytes, formatCount } from "../lib/format";
import { fetchDrilldown } from "../api";

interface Props {
  scanId: string;
  rows: ByTypeRow[];
  totalBytes: number;
}

export function ByTypeView({ scanId, rows, totalBytes }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownResult | null>(null);
  const [loading, setLoading] = useState(false);
  const max = rows.length > 0 ? rows[0].totalSize : 0;

  const toggle = async (ext: string) => {
    if (expanded === ext) {
      setExpanded(null);
      setDrilldown(null);
      return;
    }
    setExpanded(ext);
    setDrilldown(null);
    if (ext === "(other)") return;
    setLoading(true);
    try {
      const d = await fetchDrilldown(scanId, "type", ext);
      setDrilldown(d);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Largest file types</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Extension</th>
            <th className="num">Total size</th>
            <th className="num">Files</th>
            <th className="num">%</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = totalBytes > 0 ? (r.totalSize / totalBytes) * 100 : 0;
            const barWidth = max > 0 ? (r.totalSize / max) * 100 : 0;
            return (
              <Fragment key={r.ext}>
                <tr className="clickable" onClick={() => toggle(r.ext)}>
                  <td>{r.ext}</td>
                  <td className="num">{formatBytes(r.totalSize)}</td>
                  <td className="num">{formatCount(r.count)}</td>
                  <td className="num">{pct.toFixed(1)}%</td>
                  <td className="bar-cell">
                    <div className="bar-cell-fill" style={{ width: `${barWidth}%` }} />
                    <div className="bar-cell-text">
                      {expanded === r.ext ? "▼" : "▶"}
                    </div>
                  </td>
                </tr>
                {expanded === r.ext && (
                  <tr>
                    <td colSpan={5}>
                      <Drilldown loading={loading} data={drilldown} emptyHint={r.ext === "(other)" ? "Aggregated bucket — no drilldown." : undefined} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Drilldown({
  loading,
  data,
  emptyHint,
}: {
  loading: boolean;
  data: DrilldownResult | null;
  emptyHint?: string;
}) {
  if (emptyHint) return <div className="drilldown">{emptyHint}</div>;
  if (loading) return <div className="drilldown">Loading…</div>;
  if (!data) return null;
  return (
    <div className="drilldown">
      <div>
        Top {data.topFiles.length} of {formatCount(data.count)} files ·{" "}
        {formatBytes(data.totalSize)} total
      </div>
      <ol>
        {data.topFiles.map((f) => (
          <li key={f.relPath}>
            <span className="file-size">{formatBytes(f.size)}</span>
            {f.relPath}
          </li>
        ))}
      </ol>
    </div>
  );
}
