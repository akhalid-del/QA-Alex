import { build } from 'esbuild';

// Bundle the API into a single self-contained CJS function for Vercel.
// @prisma/client stays external so its native query engine loads from
// node_modules (nft traces + includes it); everything else is inlined,
// which avoids all ESM/workspace-TS runtime resolution problems.
await build({
  entryPoints: ['server-entry.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['@prisma/client', '.prisma/client'],
  // import.meta.url is used by env.ts for local dotenv; shim it for CJS.
  banner: { js: "const import_meta_url = require('url').pathToFileURL(__filename).href;" },
  define: { 'import.meta.url': 'import_meta_url' },
  logLevel: 'info',
});

console.log('Bundled api/index.js');
