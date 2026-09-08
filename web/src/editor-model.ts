import { distance } from './geo';
import type { CampusData, GraphNode, MapEdit, Place, Position } from './types';
import type { Geometry } from 'geojson';
export interface SourceRecord { id: string; source: string; entity: 'meta' | 'feature' | 'place' | 'node' | 'edge'; payload: any; hash: string }
export function validateEdit(edit: MapEdit): string[] {
 const errors: string[] = [];
 if (!edit || typeof edit.id !== 'string' || edit.id.length > 200 || !/^[\w: .-]+$/.test(edit.id)) return ['Invalid feature ID.'];
 if (!['place','path','building','entrance','barrier','closure'].includes(edit.kind)) return ['Choose a supported feature type.'];
 if (!edit.geometry || !['Point','LineString','Polygon'].includes(edit.geometry.type)) return ['Draw a point, path, or building outline.'];
 if (!edit.properties || typeof edit.properties !== 'object') return ['Feature properties are required.'];
 if (edit.kind === 'path' && edit.geometry.type !== 'LineString') errors.push('Walking paths must be lines.');
 if (['place','entrance'].includes(edit.kind) && edit.geometry.type !== 'Point') errors.push('Places and entrances must be points.');
 if (edit.kind === 'building' && edit.geometry.type !== 'Polygon') errors.push('Buildings must be polygons.');
 if (!edit.deleted && typeof edit.properties.name !== 'string') errors.push('Give the feature a name or description.');
 const geometry = edit.geometry as Exclude<Geometry, { type: 'GeometryCollection' }>;
 const positions: number[][] = [];
 function walk(value: unknown) { if (!Array.isArray(value) || !value.length) { errors.push('Empty geometry.'); return; } if (typeof value[0] === 'number') positions.push(value); else value.forEach(walk); }
 walk(geometry.coordinates);
 if (positions.length > 2000) errors.push('A single edit is limited to 2,000 vertices.');
 if (positions.some(p => p.length !== 2 || p.some(n => typeof n !== 'number' || !Number.isFinite(n)) || p[0] < 3.19 || p[0] > 3.215 || p[1] < 6.455 || p[1] > 6.50)) errors.push('All coordinates must be within the LASU Ojo mapping area.');
 if (geometry.type === 'LineString' && positions.length < 2) errors.push('A path needs at least two points.');
 if (geometry.type === 'Polygon' && geometry.coordinates.some(r => r.length < 4 || JSON.stringify(r[0]) !== JSON.stringify(r.at(-1)))) errors.push('Building outlines must be closed polygons.');
 if (edit.properties.height !== undefined && (!Number.isFinite(Number(edit.properties.height)) || Number(edit.properties.height) < 0 || Number(edit.properties.height) > 150)) errors.push('Building height must be between 0 and 150 metres.');
 return [...new Set(errors)];
}
export function assembleSources(records: SourceRecord[], fallback: CampusData): CampusData {
 if (!records.length) return structuredClone(fallback);
 const meta = records.find(r => r.entity === 'meta')?.payload;
 if (!meta) throw new Error('Approved source metadata is missing. Bootstrap the sources before publishing.');
 return { ...structuredClone(meta), map: { type: 'FeatureCollection', features: records.filter(r => r.entity === 'feature').map(r => structuredClone(r.payload)) }, places: records.filter(r => r.entity === 'place').map(r => structuredClone(r.payload)), graph: { nodes: records.filter(r => r.entity === 'node').map(r => structuredClone(r.payload)), edges: records.filter(r => r.entity === 'edge').map(r => structuredClone(r.payload)) } };
}
export function applyEdits(base: CampusData, edits: MapEdit[]): { data: CampusData; errors: string[]; warnings: string[] } {
 const data = structuredClone(base), errors: string[] = [], warnings: string[] = [];
 const nodes = new Map(data.graph.nodes.map(n => [n.id, n]));
 // Apply paths first so entrances can connect to newly drawn path vertices.
 const ordered = [...edits].sort((a,b) => Number(b.kind === 'path') - Number(a.kind === 'path'));
 for (const edit of ordered) {
  const invalid = validateEdit(edit); if (invalid.length) { errors.push(...invalid.map(e => `${edit.id}: ${e}`)); continue; }
  const props = edit.properties;
  if (edit.kind === 'place') {
   const previous = data.places.find(p => p.id === edit.id);
   data.places = data.places.filter(p => p.id !== edit.id);
   if (!edit.deleted && edit.geometry.type === 'Point') data.places.push({ ...previous, id: edit.id, name: String(props.name), category: (props.category || previous?.category || 'other') as Place['category'], coordinates: edit.geometry.coordinates as Position, aliases: String(props.aliases || '').split(',').map(s => s.trim()).filter(Boolean), department: String(props.department || ''), faculty: String(props.faculty || ''), source: 'campus-review', sourceId: edit.id, arrivalKind: previous?.arrivalKind || 'unmapped' });
  } else if (edit.kind === 'path') {
   data.graph.edges = data.graph.edges.filter(e => e.sourceId !== edit.id);
   data.map.features = data.map.features.filter(f => f.properties?.id !== edit.id);
   if (edit.deleted || edit.geometry.type !== 'LineString') continue;
   const points = edit.geometry.coordinates as Position[], sequence: GraphNode[] = [];
   points.forEach((point, i) => {
    const connection = i === 0 ? props.connectStart : i === points.length - 1 ? props.connectEnd : undefined;
    if (connection && typeof connection === 'string') {
     const linked = nodes.get(connection);
     if (!linked || distance(linked.coordinates, point) > 5) { errors.push(`${props.name}: the chosen connection must be within 5 m of the drawn endpoint.`); return; }
     sequence.push(linked);
    } else { const node = { id: `${edit.id}:vertex:${i}`, coordinates: point }; nodes.set(node.id, node); sequence.push(node); }
   });
   if (sequence.length !== points.length) continue;
   if (!props.connectStart && !props.connectEnd) warnings.push(`${props.name}: isolated path; explicitly connect an endpoint before routing to the existing network.`);
   for (let i = 1; i < sequence.length; i++) {
    const a = sequence[i-1], b = sequence[i], length = distance(a.coordinates,b.coordinates);
    if (length < .2) { errors.push(`${props.name}: duplicate adjacent path vertices.`); continue; }
    for (const [from,to] of [[a,b],[b,a]]) data.graph.edges.push({ id: `${edit.id}:${from.id}>${to.id}`, from: from.id, to: to.id, distance: length, name: String(props.name), accessible: props.access !== 'private' && props.access !== 'no', steps: !!props.steps, sourceId: edit.id });
   }
   data.map.features.push({ type: 'Feature', id: edit.id, properties: { id: edit.id, kind: 'path', name: props.name, source: 'campus-review' }, geometry: { type: 'LineString', coordinates: sequence.map(n=>n.coordinates) } });
  } else if (edit.kind === 'building') {
   data.map.features = data.map.features.filter(f => f.properties?.id !== edit.id);
   if (!edit.deleted) data.map.features.push({ type:'Feature',id:edit.id,geometry:edit.geometry,properties:{id:edit.id,kind:'building',name:props.name,height:Number(props.height)||0,heightEstimated:!!props.heightEstimated,source:'campus-review'} });
  } else if (edit.kind === 'entrance' && !edit.deleted && edit.geometry.type === 'Point') {
   const place = data.places.find(p=>p.id===props.placeId), node = nodes.get(String(props.connectTo));
   if (!place || !node || distance(node.coordinates,edit.geometry.coordinates as Position)>5) errors.push(`${props.name}: choose a place and a path node within 5 m of the entrance. Draw an explicit connecting path if needed.`);
   else { place.graphNode=node.id; place.approachDistance=0; place.arrivalKind='entrance'; }
  } else if (edit.kind === 'barrier' || edit.kind === 'closure') {
   const edgeIds = Array.isArray(props.edgeIds) ? props.edgeIds.filter((id): id is string => typeof id === 'string') : [];
   const missing = edgeIds.filter(id=>!data.graph.edges.some(e=>e.id===id));
   if (!edit.deleted && (!edgeIds.length || missing.length)) errors.push(`${props.name}: select existing path segments to block.`);
   const bothDirections = new Set(edgeIds);
   for (const edge of data.graph.edges.filter(e=>edgeIds.includes(e.id))) for (const reverse of data.graph.edges.filter(e=>e.from===edge.to && e.to===edge.from)) bothDirections.add(reverse.id);
   data.closures=data.closures.filter(c=>c.id!==edit.id);
   if (!edit.deleted) data.closures.push({id:edit.id,edgeIds:[...bothDirections],reason:String(props.name),expectedReopening:props.expectedReopening ? String(props.expectedReopening) : undefined,reopenedAt:props.reopenedAt ? String(props.reopenedAt) : undefined});
  }
 }
 data.graph.nodes=[...nodes.values()];
 const connected = new Set(data.graph.edges.flatMap(e=>[e.from,e.to]));
 for (const place of data.places) {
  if (place.graphNode && !connected.has(place.graphNode)) { delete place.graphNode; place.arrivalKind='unmapped'; warnings.push(`${place.name}: its old walking connection was removed.`); }
 }
 const ids = new Set<string>();
 for (const edge of data.graph.edges) {
  if (ids.has(edge.id)) errors.push(`Duplicate edge ${edge.id}`); ids.add(edge.id);
  if (!nodes.has(edge.from) || !nodes.has(edge.to)) errors.push(`Path ${edge.id} has a missing endpoint.`);
  if (!(edge.distance>0) || !Number.isFinite(edge.distance)) errors.push(`Path ${edge.id} has an invalid length.`);
 }
 data.coverage={...data.coverage,placeCount:data.places.length,routableCount:data.places.filter(p=>p.arrivalKind==='entrance'&&p.graphNode).length,approachCount:data.places.filter(p=>p.arrivalKind==='mapped-approach'&&p.graphNode).length,disconnected:data.places.filter(p=>!p.graphNode).map(p=>p.id),fieldVerified:false};
 return {data,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
