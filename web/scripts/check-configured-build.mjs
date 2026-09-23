// Measure production tree-shaking with owner authentication enabled, without
// needing credentials or contacting a real Supabase project. Never deploy this
// fixture build; normal `npm run build` uses the deployment's configuration.
process.env.VITE_SUPABASE_URL = 'https://turnright-benchmark.invalid';
process.env.VITE_SUPABASE_ANON_KEY = 'benchmark-public-placeholder';
const { build } = await import('vite');
await build();
for (const name of ['visual', 'world', 'voice', 'bundle'])
  await import(`./check-${name}-budget.mjs`);
