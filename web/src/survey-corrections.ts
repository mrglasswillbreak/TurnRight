import { distance } from './geo';
import type { MapEdit, Position } from './types';
import { type SurveyMarker, type SurveySession } from './survey-types.js';
import { geometryFingerprint } from './survey-geometry.js';
export function surveyCorrections(
  session: SurveySession,
  currentTarget?: MapEdit,
  previousEdits: MapEdit[] = [],
): MapEdit[] {
  if (session.pendingMarker)
    throw new Error('Confirm or cancel the entrance position before applying.');
  if (
    (!session.review.length && !session.markers.length) ||
    session.review.some((l) => !l.reviewed || l.vertices.length < 2)
  )
    throw new Error('Review every section before applying.');
  const connectionSettings = (id: string) => {
    const previous = previousEdits.find(
      (e) => e.kind === 'path' && e.id === id && !e.deleted,
    )?.properties;
    return Object.fromEntries(
      ['autoConnectCrossings', 'crossingLevel']
        .filter((key) => previous?.[key] !== undefined)
        .map((key) => [key, previous![key]]),
    );
  };
  let paths: MapEdit[] = session.review.map((l) => ({
    id: `survey:${session.id}:${l.id}`,
    kind: 'path',
    geometry: {
      type: 'LineString',
      coordinates: l.vertices.map((v) => v.coordinates),
    },
    properties: {
      name: l.name || '',
      evidence: l.name
        ? {
            name: [
              {
                sourceId: 'campus-survey',
                recordId: `survey-feature:${l.id}`,
                checkedAt: session.updatedAt,
                observedAt: session.createdAt,
              },
            ],
          }
        : undefined,
      access: 'yes',
      footDirection: 'both',
      ...connectionSettings(`survey:${session.id}:${l.id}`),
      vertexIds: l.vertices.map((v) => v.id),
      connections: l.vertices
        .filter((v) => v.connection)
        .map((v) => ({ vertexId: v.id, target: v.connection! })),
      surveyEvidence: {
        surveyId: session.id,
        revisionId: session.remoteRevision,
      },
      surveyProvenance: 'Reviewed walking survey',
    },
  }));
  if (session.replacement) {
    const r = session.replacement;
    const matchesApplied =
      currentTarget &&
      session.appliedTarget?.fingerprint ===
        geometryFingerprint(currentTarget) &&
      session.appliedTarget.revision === currentTarget.updated_at;
    if (
      !currentTarget ||
      (!matchesApplied &&
        (geometryFingerprint(currentTarget) !== r.fingerprint ||
          currentTarget.updated_at !== r.edit.updated_at))
    )
      throw new Error(
        'The target path changed or was removed. Re-select replacement boundaries and review before applying.',
      );
    if (paths.length !== 1)
      throw new Error(
        'Replacement needs one continuous reviewed section. Repair interruptions explicitly first.',
      );
    const line = session.review[0];
    let previous = -1;
    for (const anchor of r.anchors) {
      const i = line.vertices.findIndex(
        (v) =>
          v.id === anchor.id &&
          distance(v.coordinates, anchor.coordinates) < 0.05,
      );
      if (i <= previous)
        throw new Error(
          'Place the fixed junction and restriction anchors in order before replacing.',
        );
      previous = i;
    }
    if (
      line.vertices[0].id !== r.anchors[0].id ||
      line.vertices.at(-1)!.id !== r.anchors.at(-1)!.id
    )
      throw new Error('The replacement must meet both fixed boundaries.');
    const old =
      r.edit.geometry.type === 'LineString'
        ? (r.edit.geometry.coordinates as Position[])
        : [];
    const ids = r.edit.properties.vertexIds!;
    paths = [
      {
        ...structuredClone(r.edit),
        geometry: {
          type: 'LineString',
          coordinates: [
            ...old.slice(0, r.start),
            ...line.vertices.map((v) => v.coordinates),
            ...old.slice(r.end + 1),
          ],
        },
        properties: {
          ...r.edit.properties,
          ...paths[0].properties,
          name: r.edit.properties.name,
          access: r.edit.properties.access,
          footDirection: r.edit.properties.footDirection,
          vertexIds: [
            ...ids.slice(0, r.start),
            ...line.vertices.map((v) => v.id),
            ...ids.slice(r.end + 1),
          ],
          connections: [
            ...(r.edit.properties.connections || []).filter(
              (c) =>
                (!ids.slice(r.start, r.end + 1).includes(c.vertexId) ||
                  line.vertices.some((v) => v.id === c.vertexId)) &&
                !line.vertices.some((v) => v.id === c.vertexId && v.connection),
            ),
            ...(paths[0].properties.connections || []),
          ],
        },
      },
    ];
  }
  const entrances: MapEdit[] = session.markers.map((m) => {
    if (m.kind === 'place') {
      if (!m.name.trim())
        throw new Error('Record a name for each surveyed place.');
      const metadata = Object.fromEntries(
        [
          'subtype',
          'address',
          'phone',
          'website',
          'openingHours',
          'businessStatus',
        ]
          .filter((key) => m[key as keyof SurveyMarker] !== undefined)
          .map((key) => [key, m[key as keyof SurveyMarker]]),
      );
      return {
        id: `survey:${session.id}:${m.id}`,
        kind: 'place',
        geometry: { type: 'Point', coordinates: m.coordinates },
        properties: {
          name: m.name,
          category: m.category || 'other',
          ...metadata,
          buildingId: m.buildingId,
          evidence: Object.fromEntries(
            ['name', 'coordinates', 'category', ...Object.keys(metadata)].map(
              (key) => [
                key,
                [
                  {
                    sourceId: 'campus-survey',
                    recordId: `survey-feature:${m.id}`,
                    checkedAt: m.observedAt || session.createdAt,
                    observedAt: m.observedAt || session.createdAt,
                    accuracyMetres: m.accuracy,
                  },
                ],
              ],
            ),
          ),
          surveyEvidence: {
            surveyId: session.id,
            revisionId: session.remoteRevision,
          },
        },
      };
    }
    if (!m.placeId) throw new Error('Choose a place for every entrance.');
    const vertex = session.review
      .flatMap((l) => l.vertices)
      .find((v) => v.sampleId === m.sampleId);
    const connection =
      m.connection ||
      (vertex && distance(vertex.coordinates, m.coordinates) < 0.2
        ? {
            type: 'node' as const,
            nodeId: vertex.id,
            coordinates: vertex.coordinates,
          }
        : undefined);
    if (!connection)
      throw new Error(
        `Connect ${m.name || 'the entrance'} to a reviewed path or mapped target.`,
      );
    return {
      id: `survey:${session.id}:${m.id}`,
      kind: 'entrance',
      geometry: { type: 'Point', coordinates: m.coordinates },
      properties: {
        name: m.name || 'Entrance',
        placeId: m.placeId,
        buildingId: m.buildingId,
        access: m.access,
        connection,
        surveyEvidence: {
          surveyId: session.id,
          revisionId: session.remoteRevision,
        },
        surveyProvenance: 'Reviewed walking survey',
      },
    };
  });
  return [...paths, ...entrances];
}
