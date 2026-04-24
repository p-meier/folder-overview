import { Fragment, useState } from "react";
import type { ByAgeRow } from "../types";
import { formatBytes, formatCount, formatDate } from "../lib/format";

interface Props {
  rows: ByAgeRow[];
}

export function ByAgeView({ rows }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const max = rows.reduce((m, r) => Math.max(m, r.totalSize), 0);

  const sorted = [...rows].sort((a, b) => b.totalSize - a.totalSize);

  return (
    <div>
      <h2>Size by year (last-modified)</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Year</th>
            <th className="num">Total size</th>
            <th className="num">Files</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const barWidth = max > 0 ? (r.totalSize / max) * 100 : 0;
            const isOpen = expanded === r.year;
            return (
              <Fragment key={r.year}>
                <tr
                  className="clickable"
                  onClick={() => setExpanded(isOpen ? null : r.year)}
                >
                  <td>{r.year}</td>
                  <td className="num">{formatBytes(r.totalSize)}</td>
                  <td className="num">{formatCount(r.count)}</td>
                  <td className="bar-cell">
                    <div className="bar-cell-fill" style={{ width: `${barWidth}%` }} />
                    <div className="bar-cell-text">{isOpen ? "▼" : "▶"}</div>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={4}>
                      <div className="drilldown">
                        Top {r.topFiles.length} files modified in {r.year}
                        <ol>
                          {r.topFiles.map((f) => (
                            <li key={f.relPath}>
                              <span className="file-size">{formatBytes(f.size)}</span>
                              <span style={{ color: "var(--muted)", marginRight: 8 }}>
                                {formatDate(f.mtimeMs)}
                              </span>
                              {f.relPath}
                            </li>
                          ))}
                        </ol>
                      </div>
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
