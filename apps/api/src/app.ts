import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { hasRingCxCreds } from '@qa/shared';
import { config } from './env';
import { errorHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { interactionsRouter } from './routes/interactions';
import { evaluationsRouter } from './routes/evaluations';
import { scorecardsRouter } from './routes/scorecards';
import { agentsRouter } from './routes/agents';
import { dashboardRouter } from './routes/dashboard';
import { usersRouter } from './routes/users';
import { pipelineRouter } from './routes/pipeline';

export function createApp() {
  const app = express();
  const allowedOrigins = config.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors(
      allowedOrigins?.length
        ? { origin: allowedOrigins }
        : {}, // no CORS_ORIGIN set → allow all (local dev)
    ),
  );
  app.use(express.json({ limit: '2mb' }));
  if (config.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      env: config.NODE_ENV,
      ringcxConfigured: hasRingCxCreds(config),
      transcriptionConfigured: Boolean(config.ASSEMBLYAI_API_KEY),
      scoringConfigured: Boolean(config.ANTHROPIC_API_KEY),
      queueConfigured: Boolean(config.REDIS_URL),
    });
  });

  app.use('/auth', authRouter);
  app.use('/interactions', interactionsRouter);
  app.use('/evaluations', evaluationsRouter);
  app.use('/scorecards', scorecardsRouter);
  app.use('/agents', agentsRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/users', usersRouter);
  app.use('/pipeline', pipelineRouter);

  app.use(errorHandler);
  return app;
}
