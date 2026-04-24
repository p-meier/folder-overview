import { useMemo, useState } from "react";
import type { FolderNode } from "../types";
import { formatBytes, formatCount } from "../lib/format";

interface Props {
  tree: FolderNode;
}

type SortKey = "size" | "name" | "files";

export function ByFolderView({ tree }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("size");
  const [minSizeMB, setMinSizeMB] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([tree.relPath]));

  const sortedTree = useMemo(
    () => sortTree(tree, sortKey, minSizeMB * 1024 * 1024),
    [tree, sortKey, minSizeMB]
  );

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div>
      <h2>Folder sizes (cumulative)</h2>
      <div className="folder-controls">
        <label>
          Sort by&nbsp;
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="size">Size</option>
            <option value="name">Name</option>
            <option value="files">File count</option>
          </select>
        </label>
        <label>
          Hide folders smaller than&nbsp;
          <input
            type="number"
            min={0}
            step={50}
            value={minSizeMB}
            onChange={(e) => setMinSizeMB(Number(e.target.value) || 0)}
            style={{ width: 80 }}
          />
          &nbsp;MB
        </label>
        <button
          className="tab"
          onClick={() => setExpanded(new Set([tree.relPath]))}
          style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 4 }}
        >
          Collapse all
        </button>
      </div>
      <FolderRow
        node={sortedTree}
        depth={0}
        maxSize={sortedTree.recursiveSize}
        expanded={expanded}
        onToggle={toggle}
      />
    </div>
  );
}

function sortTree(node: FolderNode, key: SortKey, minSize: number): FolderNode {
  const filtered = node.children.filter((c) => c.recursiveSize >= minSize);
  const cmp = (a: FolderNode, b: FolderNode) => {
    if (key === "size") return b.recursiveSize - a.recursiveSize;
    if (key === "files") return b.recursiveFileCount - a.recursiveFileCount;
    return a.name.localeCompare(b.name);
  };
  const children = filtered
    .map((c) => sortTree(c, key, minSize))
    .sort(cmp);
  return { ...node, children };
}

function FolderRow({
  node,
  depth,
  maxSize,
  expanded,
  onToggle,
}: {
  node: FolderNode;
  depth: number;
  maxSize: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const isOpen = expanded.has(node.relPath);
  const hasChildren = node.children.length > 0;
  const barWidth = maxSize > 0 ? (node.recursiveSize / maxSize) * 100 : 0;

  return (
    <>
      <div className="folder-row">
        <div className="name" style={{ paddingLeft: depth * 16 }}>
          <span
            className={`chevron ${hasChildren ? "" : "invisible"}`}
            onClick={() => hasChildren && onToggle(node.relPath)}
          >
            {isOpen ? "▾" : "▸"}
          </span>
          <span
            style={{ cursor: hasChildren ? "pointer" : "default" }}
            onClick={() => hasChildren && onToggle(node.relPath)}
          >
            {node.name || "/"}
          </span>
        </div>
        <div className="bar-cell">
          <div className="bar-cell-fill" style={{ width: `${barWidth}%` }} />
          <div className="bar-cell-text">{formatBytes(node.recursiveSize)}</div>
        </div>
        <div className="num">{formatCount(node.recursiveFileCount)}</div>
        <div className="num">{formatCount(node.children.length)} subdirs</div>
      </div>
      {isOpen &&
        node.children.map((c) => (
          <FolderRow
            key={c.relPath}
            node={c}
            depth={depth + 1}
            maxSize={maxSize}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}
