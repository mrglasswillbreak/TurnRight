import fs from 'node:fs/promises';
import path from 'node:path';
import { connectSolidCraft } from './mcp.mjs';
import { archive, repository, sha256 } from './inventory.mjs';
import { buildingRecipe } from './recipe.mjs';
import { patternRecipe } from './patterns.mjs';
import { tsImport } from 'tsx/esm/api';
const { createBuildingModel } = await tsImport(
  '../../web/src/building-model.ts',
  import.meta.url,
);

const inventory = JSON.parse(
  await fs.readFile(
    path.join(repository, 'data/lasu-models/inventory.json'),
    'utf8',
  ),
);
const recipes = JSON.parse(
  await fs.readFile(
    path.join(repository, 'data/lasu-models/recipes.json'),
    'utf8',
  ),
).buildings;
const data = JSON.parse(
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
const requested = process.argv.slice(2);
const targets = inventory.buildings.filter(
  (b) =>
    recipes[b.id] &&
    (!requested.length ||
      requested.some((arg) => arg === b.slug || b.id.endsWith(':' + arg))),
);
for (const building of targets) {
  const bundle = path.join(archive, building.slug);
  const feature = data.map.features.find(
      (f) => f.properties?.id === building.id,
    ),
    visual = data.visuals.buildings.find((v) => v.id === building.id);
  const recipe = patternRecipe(
    buildingRecipe(
      feature,
      visual,
      recipes[building.id],
      recipes[building.id].preserveRoof
        ? createBuildingModel(feature, visual)
        : undefined,
    ),
  );
  const run = sha256(JSON.stringify(recipe)).slice(0, 16);
  const directory = path.join(bundle, 'runs', run);
  const previous = await fs
    .readFile(path.join(bundle, 'CURRENT.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (previous?.run === run) {
    const verified = await fs
      .readFile(path.join(bundle, 'solidcraft-verification.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    if (
      verified?.exportHashes &&
      (
        await Promise.all(
          Object.entries(verified.exportHashes).map(
            async ([file, hash]) =>
              sha256(await fs.readFile(path.join(bundle, file))) === hash,
          ),
        )
      ).every(Boolean)
    ) {
      console.log(`${building.slug}: unchanged verified native bundle`);
      continue;
    }
  }
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'recipe.json'),
    JSON.stringify(recipe, null, 2),
  );
  const client = await connectSolidCraft(directory);
  const measurements = [];
  try {
    await client.call('skill_reference', { skill: 'solidcraft-modeling' });
    await client.call('inspect_design', { measure: false, sketches: false });
    console.log(
      `${building.name}: ${recipe.bodies.length} bodies, ${recipe.patterns} patterns, ${recipe.stages.length} stages`,
    );
    for (const stage of recipe.stages) {
      for (let start = 0; start < stage.commands.length; start += 60) {
        const batch = await client.call('batch', {
          commands: stage.commands.slice(start, start + 60),
          rollback: true,
          verbose: false,
        });
        if (batch.value.failed || batch.value.ok === false)
          throw new Error(JSON.stringify(batch.value));
      }
      const result = await client.call('measure', { summary: true });
      measurements.push({ stage: stage.name, result: result.value });
      if (stage.name === 'massing') {
        const actual = result.value.total?.volume_mm3;
        if (
          !Number.isFinite(actual) ||
          Math.abs(actual / recipe.expectedMassingVolume - 1) > 0.002
        )
          throw new Error(
            `Massing volume disagrees: expected ${recipe.expectedMassingVolume}, got ${actual}`,
          );
      }
      console.log(`${building.slug}: ${stage.name} measured`);
      await fs.writeFile(
        path.join(directory, 'mcp-transcript.json'),
        JSON.stringify(client.transcript, null, 2),
      );
    }
    const design = (
      await client.call('inspect_design', { measure: false, sketches: false })
    ).value;
    if (design.timeline?.some((f) => f.error))
      throw new Error('The design timeline has failed features.');
    await client.call('save', { path: path.join(directory, 'master.sc') });
    const nominalHeight = parseFloat(
      recipe.stages[0].commands.find(
        (c) => c.command === 'parameters.add' && c.params.name === 'H0',
      ).params.expression,
    );
    const parameterCheck = (
      await client.call('check_parameters', {
        set: { H0: `${nominalHeight + 100} mm` },
        report: ['errors'],
      })
    ).value;
    if (
      !parameterCheck.restored ||
      parameterCheck.errors?.length ||
      parameterCheck.parameter_errors?.length
    )
      throw new Error('Parameter-change check did not restore the design.');
    for (const format of ['obj', 'step'])
      await client.call('execute', {
        command: 'file.export',
        params: {
          path: path.join(directory, `master.${format}`),
          format,
          ...(format === 'obj' ? { quality: 'standard' } : {}),
        },
      });
    await client.call('screenshot', {
      path: path.join(directory, 'solidcraft-iso.png'),
      source: 'model',
      view: 'iso',
      width: 1600,
      height: 1200,
      grid: false,
      axes: false,
    });
    await fs.writeFile(
      path.join(directory, 'solidcraft-verification.json'),
      JSON.stringify(
        {
          server: client.server,
          measuredAt: new Date().toISOString(),
          parameterCheck,
          measurements,
          warnings: design.timeline?.filter((f) => f.warning),
          masterSha256: sha256(
            await fs.readFile(path.join(directory, 'master.sc')),
          ),
          exportHashes: Object.fromEntries(
            await Promise.all(
              ['master.sc', 'master.obj', 'master.mtl', 'master.step'].map(
                async (file) => [
                  file,
                  sha256(await fs.readFile(path.join(directory, file))),
                ],
              ),
            ),
          ),
        },
        null,
        2,
      ),
    );
    console.log(`${building.slug}: master and exports saved`);
    await fs.writeFile(
      path.join(directory, 'mcp-transcript.json'),
      JSON.stringify(client.transcript, null, 2),
    );
    for (const file of [
      'recipe.json',
      'master.sc',
      'master.obj',
      'master.mtl',
      'master.step',
      'solidcraft-iso.png',
      'solidcraft-verification.json',
      'mcp-transcript.json',
    ])
      await fs.copyFile(path.join(directory, file), path.join(bundle, file));
    await fs.writeFile(
      path.join(bundle, 'CURRENT.json'),
      JSON.stringify({ run, completedAt: new Date().toISOString() }, null, 2),
    );
  } finally {
    await fs.writeFile(
      path.join(directory, 'mcp-transcript.json'),
      JSON.stringify(client.transcript, null, 2),
    );
    client.close();
  }
}
