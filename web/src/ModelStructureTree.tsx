/* ARIA tree parents own nested groups; fieldsets are form controls, not tree groups. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Building2,
  ChevronRight,
  EyeOff,
  Folder,
  Grid2X2,
  House,
  Layers,
  LockKeyhole,
  Pentagon,
  Search,
  Type,
} from 'lucide-react';
import {
  filterModelTree,
  treeAncestors,
  type ModelTreeNode,
  type ModelTreeTarget,
} from './model-tree';

export function ModelStructureTree({
  nodes,
  selected,
  onSelect,
}: {
  nodes: ModelTreeNode[];
  selected: string[];
  onSelect: (target: ModelTreeTarget, toggle: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(
    () =>
      new Set([
        'building',
        ...(nodes[0]?.children || [])
          .filter((n) => n.target?.kind === 'part')
          .map((n) => n.key),
        ...treeAncestors(nodes, selected),
      ]),
  );
  const [focus, setFocus] = useState(selected[0] || 'building');
  const root = useRef<HTMLDivElement>(null),
    typeahead = useRef({ value: '', at: 0 });
  const selectionKey = selected.join('|');
  const current = useRef({ nodes, selected });
  current.current = { nodes, selected };
  useEffect(() => {
    setExpanded(
      (old) =>
        new Set([
          ...old,
          ...treeAncestors(current.current.nodes, current.current.selected),
        ]),
    );
    if (current.current.selected[0]) setFocus(current.current.selected[0]);
  }, [selectionKey]);
  useEffect(() => {
    root.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectionKey]);
  const rows: {
    node: ModelTreeNode;
    level: number;
    parent?: string;
    position: number;
    size: number;
  }[] = [];
  const visit = (items: ModelTreeNode[], level = 1, parent?: string) =>
    items.forEach((node, i) => {
      rows.push({ node, level, parent, position: i + 1, size: items.length });
      if (query.trim() || expanded.has(node.key))
        visit(node.children || [], level + 1, node.key);
    });
  visit(filterModelTree(nodes, query));
  const focusKey = rows.some((r) => r.node.key === focus)
    ? focus
    : rows[0]?.node.key;
  const move = (key: string) => {
    setFocus(key);
    root.current
      ?.querySelectorAll<HTMLElement>('[role="treeitem"]')
      .forEach((item) => {
        if (item.dataset.treeKey === key) item.focus();
      });
  };
  const disclose = (key: string, open: boolean) =>
    setExpanded((old) => {
      const next = new Set(old);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  return (
    <>
      <label className="model-tree-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label="Find model parts"
          placeholder="Find parts or details…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div
        ref={root}
        role="tree"
        aria-label="Model structure"
        aria-multiselectable="true"
        className="model-tree"
      >
        {rows
          .filter((row) => !row.parent)
          .map(function renderRow({ node, level, parent, position, size }) {
            const index = rows.findIndex((row) => row.node.key === node.key);
            const hasChildren = !!node.children?.length,
              open = !!query.trim() || expanded.has(node.key);
            const Icon =
              node.target?.kind === 'building'
                ? Building2
                : node.target?.kind === 'part'
                  ? Box
                  : node.target?.kind === 'roof'
                    ? House
                    : node.target?.kind === 'footprint'
                      ? Pentagon
                      : node.target?.kind === 'roofText'
                        ? Type
                        : node.target?.kind === 'detail'
                          ? Grid2X2
                          : node.target?.kind === 'wall'
                            ? Layers
                            : Folder;
            return (
              <div
                key={node.key}
                role="treeitem"
                className={
                  node.key.startsWith('detail:')
                    ? 'model-detail-item'
                    : undefined
                }
                tabIndex={node.key === focusKey ? 0 : -1}
                aria-level={level}
                aria-posinset={position}
                aria-setsize={size}
                aria-expanded={hasChildren ? open : undefined}
                aria-selected={
                  node.target
                    ? selected.includes(node.key) ||
                      (node.target?.kind === 'detail' &&
                        selected.includes(
                          `detail:${node.target.wallId}:${node.target.id}`,
                        ))
                    : undefined
                }
                aria-label={node.label}
                data-tree-key={node.key}
                data-model-wall={
                  node.target?.kind === 'wall' ? node.target.wallId : undefined
                }
                data-detail-id={
                  node.target?.kind === 'detail' ? node.target.id : undefined
                }
                onFocus={(event) => {
                  if (event.target === event.currentTarget) setFocus(node.key);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  move(node.key);
                  if (node.target)
                    onSelect(
                      node.target,
                      event.shiftKey || event.ctrlKey || event.metaKey,
                    );
                  else disclose(node.key, !open);
                }}
                onKeyDown={(e) => {
                  let next: string | undefined;
                  if (e.key === 'ArrowDown')
                    next = rows[Math.min(index + 1, rows.length - 1)]?.node.key;
                  else if (e.key === 'ArrowUp')
                    next = rows[Math.max(0, index - 1)]?.node.key;
                  else if (e.key === 'Home') next = rows[0]?.node.key;
                  else if (e.key === 'End') next = rows.at(-1)?.node.key;
                  else if (e.key === 'ArrowRight') {
                    if (hasChildren && !open) disclose(node.key, true);
                    else if (hasChildren) next = rows[index + 1]?.node.key;
                  } else if (e.key === 'ArrowLeft') {
                    if (hasChildren && open) disclose(node.key, false);
                    else next = parent;
                  } else if (e.key === 'Enter' || e.key === ' ') {
                    if (node.target) onSelect(node.target, e.key === ' ');
                    else disclose(node.key, !open);
                  } else if (
                    e.key.length === 1 &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey
                  ) {
                    const now = Date.now();
                    typeahead.current = {
                      value:
                        (now - typeahead.current.at < 600
                          ? typeahead.current.value
                          : '') + e.key.toLowerCase(),
                      at: now,
                    };
                    next = [
                      ...rows.slice(index + 1),
                      ...rows.slice(0, index + 1),
                    ].find((r) =>
                      r.node.label
                        .toLowerCase()
                        .startsWith(typeahead.current.value),
                    )?.node.key;
                  } else return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (next) move(next);
                }}
              >
                <div
                  className="model-tree-row"
                  style={{ paddingInlineStart: 4 + (level - 1) * 12 }}
                >
                  {hasChildren ? (
                    <button
                      tabIndex={-1}
                      className="model-tree-disclosure"
                      aria-label={`${open ? 'Collapse' : 'Expand'} ${node.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        disclose(node.key, !open);
                        move(node.key);
                      }}
                    >
                      <ChevronRight
                        size={14}
                        style={{
                          transform: open ? 'rotate(90deg)' : undefined,
                        }}
                      />
                    </button>
                  ) : (
                    <span className="model-tree-spacer" />
                  )}
                  <Icon size={16} aria-hidden="true" />
                  <span className="model-tree-label" title={node.label}>
                    {node.label}
                    {node.note && <small>{node.note}</small>}
                  </span>
                  {node.locked && <LockKeyhole size={13} aria-label="Locked" />}
                  {node.hidden && <EyeOff size={13} aria-label="Hidden" />}
                </div>
                {hasChildren && open && (
                  <div role="group">
                    {rows
                      .filter((row) => row.parent === node.key)
                      .map(renderRow)}
                  </div>
                )}
              </div>
            );
          })}
      </div>
      {!rows.length && (
        <p className="small-note">No matching parts or details.</p>
      )}
    </>
  );
}
