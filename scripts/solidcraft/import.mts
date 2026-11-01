import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  identityTransform,
  MODEL_LIMITS,
  newModelDocument,
  modelDocumentErrors,
  type ModelDetailTier,
  type ModelObject,
  type Vec3,
} from '../../web/src/model-document';
import { compileModelDocument } from '../../web/src/model-document-compiler';
import { buildDetailedModel } from '../../web/scripts/build-detailed-models';
import { buildingRevision } from '../../web/src/building-visuals';
import { detailRevision } from '../../web/src/building-facades';
import { archive, repository, sha256 } from './inventory.mjs';
import { finishModel } from './finish.mts';
import { compactImportedModel } from './import-compaction.mts';

type Recipe = {
  id: string;
  origin: [number, number];
  bodies: {
    name: string;
    colour: string;
    role: string;
    tier: ModelDetailTier;
  }[];
};

/** SolidCraft's named components are merged by material and tier, retaining face provenance. */
export function importSolidCraftOBJ(text: string, recipe: Recipe) {
  if (!text.startsWith('# SolidCraft OBJ export (mm)'))
    throw new Error('Expected the millimetre SolidCraft export.');
  const document = newModelDocument(recipe.origin);
  document.replaceVisual = true;
  document.materials = [];
  const positions: Vec3[] = [],
    normals: Vec3[] = [];
  const bodies = new Map(recipe.bodies.map((b) => [b.name, b]));
  const objects = new Map<string, ModelObject>();
  let current: ModelObject | undefined,
    component = '',
    faceIndex = 0;
  let conversionError = 0;
  for (const line of text.split(/\r?\n/)) {
    const [type, ...items] = line.trim().split(/\s+/);
    if (type === 'v') {
      const millimetres = items.slice(0, 3).map(Number) as Vec3;
      const metres = millimetres.map((n) => n / 1000) as Vec3;
      if (!metres.every(Number.isFinite))
        throw new Error('Invalid OBJ vertex.');
      conversionError = Math.max(
        conversionError,
        ...metres.map((n, i) => Math.abs(n * 1000 - millimetres[i]) / 1000),
      );
      positions.push(metres);
    } else if (type === 'vn') {
      const normal = items.map(Number) as Vec3;
      if (
        normal.length !== 3 ||
        !normal.every(Number.isFinite) ||
        Math.abs(Math.hypot(...normal) - 1) > 0.001
      )
        throw new Error('OBJ normal is not a finite unit vector.');
      normals.push(normal);
    } else if (type === 'o') {
      component = items.join(' ');
      faceIndex = 0;
      const body = bodies.get(component);
      if (!body) throw new Error(`Unmapped SolidCraft body: ${component}`);
      // Window divisions and signature fins remain legible in the distant variant.
      const tier = ['glass', 'diamond', 'fin'].includes(body.role)
        ? 'structure'
        : body.tier;
      const id = `${tier}-${body.role}-${body.colour.slice(1)}`;
      current = objects.get(id);
      if (!current) {
        current = {
          id,
          name: `${body.tier} ${body.role}`,
          detailTier: tier,
          hidden: false,
          locked: false,
          transform: identityTransform(),
          vertices: {},
          faces: [],
          source: { kind: 'import', name: 'SolidCraft master.obj (mm, Z up)' },
        };
        objects.set(id, current);
        document.materials.push({
          id,
          name: body.role,
          colour: body.colour,
          opacity: 1,
          roughness: body.role === 'glass' ? 0.23 : 0.78,
          metalness: body.role === 'glass' ? 0.32 : 0,
          doubleSided: false,
        });
      }
    } else if (type === 'f') {
      if (!current) throw new Error('OBJ face has no named component.');
      const corners = items.map((item) => {
        const [v, , n] = item.split('/').map(Number),
          vertex = `v${v}`;
        const point = positions[v - 1];
        if (!point) throw new Error('Missing OBJ vertex.');
        current!.vertices[vertex] = point;
        const normal = normals[n - 1];
        if (!normal) throw new Error('Missing OBJ normal.');
        return { vertex, ...(normal ? { normal } : {}) };
      });
      const points = corners
        .slice(0, 3)
        .map((c) => current!.vertices[c.vertex]);
      if (points.length !== 3) throw new Error('Invalid OBJ face.');
      const a = points[1].map((n, i) => n - points[0][i]),
        b = points[2].map((n, i) => n - points[0][i]);
      const cross = [
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        ],
        area = Math.hypot(...cross);
      if (
        area < 1e-18 ||
        cross.reduce((sum, n, i) => sum + n * corners[0].normal![i], 0) / area <
          -0.001
      )
        throw new Error('OBJ has a degenerate face or reversed winding.');
      current.faces.push({
        id: `${component.replace(/[^\w:.-]/g, '_')}-${faceIndex++}`,
        corners,
        material: current.id,
      });
    }
  }
  document.objects = [...objects.values()];
  const errors = modelDocumentErrors(document);
  if (errors.length) throw new Error(errors.join(' '));
  const meshes = compileModelDocument(document, recipe.origin);
  const bounds = (points: number[][]) =>
    [0, 1, 2].map((axis) => {
      let min = Infinity,
        max = -Infinity;
      for (const p of points) {
        min = Math.min(min, p[axis]);
        max = Math.max(max, p[axis]);
      }
      return [min, max];
    });
  const compiled = meshes.flatMap((m) =>
    Array.from({ length: m.positions.length / 3 }, (_, i) =>
      m.positions.slice(i * 3, i * 3 + 3),
    ),
  );
  const expected = bounds(positions),
    actual = bounds(compiled);
  const error = Math.max(
    conversionError,
    ...actual.flatMap((p, i) => p.map((n, j) => Math.abs(n - expected[i][j]))),
  );
  if (error > 0.01) throw new Error('Export/import conversion exceeded 1 cm.');
  return {
    document,
    verification: {
      conversionErrorMetres: error,
      origin: recipe.origin,
      boundsMetres: actual,
      components: bodies.size,
      objects: document.objects.length,
      vertices: positions.length,
      triangles: meshes.reduce((n, m) => n + m.indices.length / 3, 0),
      normalsAndWindingVerified: true,
      observation:
        'Conversion tolerance only; dimensions remain reference-based estimates.',
    },
  };
}

async function main() {
  const inventory = JSON.parse(
    await fs.readFile(
      path.join(repository, 'data/lasu-models/inventory.json'),
      'utf8',
    ),
  );
  const source = JSON.parse(
    await fs.readFile(
      path.join(
        archive,
        'baseline',
        inventory.baselineVersion,
        'packages',
        inventory.baselineVersion,
        'campus.json',
      ),
      'utf8',
    ),
  );
  const targets = inventory.buildings.filter(
    (b: { id: string; slug: string }) =>
      process.argv
        .slice(2)
        .some((arg) => arg === b.slug || b.id.endsWith(':' + arg)),
  );
  for (const building of targets) {
    const directory = path.join(archive, building.slug);
    const recipe = JSON.parse(
      await fs.readFile(path.join(directory, 'recipe.json'), 'utf8'),
    ) as Recipe;
    const obj = await fs.readFile(path.join(directory, 'master.obj'), 'utf8');
    const { document: importedDocument, verification } = importSolidCraftOBJ(
      obj,
      recipe,
    );
    const finishing = await finishModel(
      importedDocument,
      building.id,
      inventory.baselineVersion,
      source.photos,
    );
    const { document, quantization } = compactImportedModel(importedDocument);
    if (quantization) {
      verification.conversionErrorMetres += quantization.maxPositionErrorMetres;
      verification.boundsMetres = quantization.boundsAfterMetres;
    }
    if (verification.conversionErrorMetres > 0.01)
      throw Error('Export/import conversion exceeded 1 cm after compaction.');
    const feature = structuredClone(
      source.map.features.find(
        (f: { properties?: { id: string } }) =>
          f.properties?.id === building.id,
      ),
    );
    feature.properties.modelDocument = document;
    const visual = {
      ...source.visuals.buildings.find(
        (v: { id: string }) => v.id === building.id,
      ),
      geometryRevision: buildingRevision(feature),
      detailRevision: detailRevision(feature),
    };
    const output = path.join(directory, 'render-assets');
    const descriptor = await buildDetailedModel(
      feature,
      visual,
      output,
      source.photos,
    );
    const documentJSON = JSON.stringify(document);
    if (Buffer.byteLength(documentJSON) > MODEL_LIMITS.documentBytes)
      throw Error('Editable model exceeds the 25 MiB upload limit.');
    await fs.writeFile(
      path.join(directory, 'turnright.model.json'),
      documentJSON,
    );
    await fs.writeFile(
      path.join(directory, 'detail-descriptor.json'),
      JSON.stringify(descriptor, null, 2),
    );
    await fs.writeFile(
      path.join(directory, 'import-verification.json'),
      JSON.stringify(
        {
          ...verification,
          ...(quantization ? { quantization } : {}),
          objSha256: sha256(obj),
          documentSha256: sha256(documentJSON),
          finishing,
        },
        null,
        2,
      ),
    );
    console.log(
      `${building.name}: ${verification.triangles} triangles, ${verification.objects} editable objects; conversion error ${verification.conversionErrorMetres} m`,
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await main();
