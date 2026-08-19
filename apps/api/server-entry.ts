// Bundle entry for the Vercel serverless function. esbuild inlines the whole
// Express app + workspace packages into a single CJS file (api/index.js),
// keeping only @prisma/client external. An Express app is a valid
// (req, res) handler, so exporting it is all Vercel needs.
import { createApp } from './src/app';

export default createApp();
