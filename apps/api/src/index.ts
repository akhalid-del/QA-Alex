import { createApp } from './app';
import { config } from './env';

// Most PaaS hosts (Railway, Render, Fly) inject PORT and expect the app to
// bind to it; API_PORT is the local-dev fallback.
const port = Number(process.env.PORT) || config.API_PORT;

const app = createApp();
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});
