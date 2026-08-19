// Vercel serverless entrypoint. Vercel treats any handler exported from
// /api as a function; an Express app is itself a valid (req, res) handler,
// so no adapter is needed. All routing/middleware live in ../src/app as
// normal — this file only exists for Vercel's function detection.
import { createApp } from '../src/app';

export default createApp();
