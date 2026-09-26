import type {
  BuildingTopology,
  FacadeElement,
  ModelAuthoring,
  FacadeDescription,
  RoofText,
} from './visual-types';
import type { facadeWalls } from './building-facades';
import { detailInstanceId, expandDetailInstances } from './model-instances';

export type ModelTreeTarget = {
  kind:
    | 'building'
    | 'footprint'
    | 'part'
    | 'roof'
    | 'roofText'
    | 'wall'
    | 'detail'
    | 'group'
    | 'pattern';
  partId?: string;
  wallId?: string;
  id?: string;
  wholeRow?: boolean;
};
export type ModelTreeNode = {
  key: string;
  label: string;
  target?: ModelTreeTarget;
  note?: string;
  locked?: boolean;
  hidden?: boolean;
  children?: ModelTreeNode[];
};

export function modelTree({
  name,
  topology,
  walls,
  facades,
  authoring,
  activeWall,
  elements,
  locked,
  hidden,
  roofTexts = {},
}: {
  roofTexts?: Record<string, RoofText[]>;
  name: string;
  topology: BuildingTopology;
  walls: ReturnType<typeof facadeWalls>;
  facades: Record<string, FacadeDescription>;
  authoring: ModelAuthoring;
  activeWall: string;
  elements: FacadeElement[];
  locked: string[];
  hidden: string[];
}): ModelTreeNode[] {
  return [
    {
      key: 'building',
      label: name,
      target: { kind: 'building' },
      note: 'Whole-building defaults',
      children: [
        { key: 'footprint', label: 'Footprint', target: { kind: 'footprint' } },
        ...topology.parts.map(
          (part, index): ModelTreeNode => ({
            key: `part:${part.id}`,
            label: authoring.names[part.id] || `Wing ${index + 1}`,
            target: { kind: 'part', partId: part.id },
            children: [
              {
                key: `roof:${part.id}`,
                label: 'Roof',
                target: { kind: 'roof', partId: part.id },
                children: (roofTexts[part.id] || []).map((text) => ({
                  key: `roof-text:${text.id}`,
                  label: `Text · ${text.text}`,
                  target: {
                    kind: 'roofText' as const,
                    partId: part.id,
                    id: text.id,
                  },
                })),
              },
              ...part.rings.map(
                (ring, ri): ModelTreeNode => ({
                  key: `ring:${ring.id}`,
                  label: ri ? `Courtyard ${ri} walls` : 'Exterior walls',
                  children: ring.wallIds.map((wallId): ModelTreeNode => {
                    const wall = walls.find((w) => w.wallId === wallId),
                      facade = facades[wallId];
                    const details =
                      wallId === activeWall ? elements : facade?.elements || [];
                    const detail = (
                      e: FacadeElement,
                      prefix = '',
                    ): ModelTreeNode => ({
                      key: `${prefix}detail:${wallId}:${e.id}`,
                      label:
                        authoring.names[e.id] ||
                        `${e.kind === 'text' ? `Text · ${e.text || ''}` : e.kind[0].toUpperCase() + e.kind.slice(1)}${e.count > 1 ? ` ×${e.count}` : ''}`,
                      target: {
                        kind: 'detail',
                        partId: part.id,
                        wallId,
                        id: e.id,
                        wholeRow: e.count > 1,
                      },
                      locked: locked.includes(e.id),
                      hidden: hidden.includes(e.id),
                      children:
                        e.count > 1
                          ? expandDetailInstances([e]).map((value, index) => ({
                              key: `${prefix}detail:${wallId}:${detailInstanceId(e.id, index)}`,
                              label:
                                authoring.names[value.id] ||
                                `${e.kind[0].toUpperCase() + e.kind.slice(1)} ${index + 1}`,
                              target: {
                                kind: 'detail' as const,
                                partId: part.id,
                                wallId,
                                id: value.id,
                              },
                              locked:
                                locked.includes(value.id) ||
                                locked.includes(e.id),
                              hidden:
                                hidden.includes(value.id) ||
                                hidden.includes(e.id),
                            }))
                          : undefined,
                    });
                    const collections = (
                      kind: 'group' | 'pattern',
                      items: ModelAuthoring['groups'],
                    ): ModelTreeNode[] =>
                      items
                        .filter((g) => g.wallId === wallId)
                        .map((g) => ({
                          key: `${kind}:${g.id}`,
                          label: g.name,
                          target: { kind, partId: part.id, wallId, id: g.id },
                          children: details
                            .filter((e) => g.members.includes(e.id))
                            .map((e) => detail(e, `${kind}:${g.id}:`)),
                        }));
                    return {
                      key: `wall:${wallId}`,
                      label: authoring.names[wallId] || wall?.label || 'Wall',
                      target: { kind: 'wall', partId: part.id, wallId },
                      note: facade
                        ? facade.reviewedAt && !facade.needsReview
                          ? 'Reviewed'
                          : 'Needs review'
                        : 'Generated',
                      children: [
                        {
                          key: `details:${wallId}`,
                          label: `Details (${details.length})`,
                          children: details.map((e) => detail(e)),
                        },
                        {
                          key: `groups:${wallId}`,
                          label: 'Groups',
                          children: collections('group', authoring.groups),
                        },
                        {
                          key: `patterns:${wallId}`,
                          label: 'Patterns',
                          children: collections('pattern', authoring.patterns),
                        },
                      ].filter(
                        (n) =>
                          n.children.length || n.key.startsWith('details:'),
                      ),
                    };
                  }),
                }),
              ),
            ],
          }),
        ),
      ],
    },
  ];
}

export function filterModelTree(
  nodes: ModelTreeNode[],
  query: string,
): ModelTreeNode[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return nodes;
  return nodes.flatMap((node) => {
    if (node.label.toLocaleLowerCase().includes(term)) return [node];
    const children = filterModelTree(node.children || [], term);
    return children.length ? [{ ...node, children }] : [];
  });
}

export function treeAncestors(
  nodes: ModelTreeNode[],
  selected: string[],
  path: string[] = [],
): string[] {
  return nodes.flatMap((n) => [
    ...(selected.includes(n.key) ? path : []),
    ...treeAncestors(n.children || [], selected, [...path, n.key]),
  ]);
}
