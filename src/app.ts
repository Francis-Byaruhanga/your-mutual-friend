import express, { type NextFunction, type Request, type Response } from 'express';
import { createRepositories, type Repositories } from './domain/repository.js';
import type { UssdReply } from './ussd/reply.js';
import { createUssdRouter, type UssdRouter } from './ussd/router.js';
import { genericError } from './ussd/screens.js';
import { createSessionStore, type SessionStore } from './ussd/session.js';

export const USSD_ROUTE = '/ussd';

export interface AppOptions {
  readonly repositories?: Repositories;
  readonly store?: SessionStore;
  readonly now?: () => Date;
}

export interface App {
  app: express.Express;
  router: UssdRouter;
  repositories: Repositories;
  store: SessionStore;
}

/**
 * Africa's Talking sends application/x-www-form-urlencoded bodies. Express 5
 * still needs the urlencoded parser wired up, since it no longer bundles
 * body-parser.
 */
export function createApp(options: AppOptions = {}): App {
  const repositories = options.repositories ?? createRepositories();
  const store = options.store ?? createSessionStore();
  const router = createUssdRouter({
    repositories,
    store,
    ...(options.now ? { now: options.now } : {}),
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.use(express.json({ limit: '8kb' }));

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      environment: process.env.NODE_ENV ?? 'development',
      activeSessions: store.size(),
    });
  });

  app.post(USSD_ROUTE, (request, response) => {
    const startedAt = performance.now();
    const sessionId = readField(request.body, 'sessionId');
    const serviceCode = readField(request.body, 'serviceCode');
    const phoneNumber = readField(request.body, 'phoneNumber');
    const networkCode = readField(request.body, 'networkCode');
    const text = readField(request.body, 'text');

    if (!sessionId || !phoneNumber) {
      // Africa's Talking terminates the session on a 4XX, so answer in-band.
      response
        .status(200)
        .type('text/plain')
        .set('at-ussd-hop-metadata', 'malformedRequest')
        .send(`END ${genericError()}`);
      return;
    }

    let reply: UssdReply;
    try {
      reply = router.handle({ sessionId, serviceCode, phoneNumber, networkCode, text });
    } catch (error) {
      console.error(`[ussd] unhandled failure on session ${sessionId}`, error);
      response
        .status(200)
        .type('text/plain')
        .set('at-ussd-hop-metadata', 'unhandledError')
        .send(`END ${genericError()}`);
      return;
    }

    // AT expects text/plain and needs the response inside its 10 second budget.
    response.status(200).type('text/plain').set('at-ussd-hop-metadata', reply.hop).send(reply.body);

    console.info(
      `[ussd] ${phoneNumber} text="${text}" hop=${reply.hop} ${(performance.now() - startedAt).toFixed(1)}ms`,
    );
  });

  app.use((_request: Request, response: Response) => {
    response.status(404).type('text/plain').send('END Service unavailable');
  });

  app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
    console.error('[ussd] express error', error);
    response.status(500).type('text/plain').send(`END ${genericError()}`);
  });

  return { app, router, repositories, store };
}

function readField(body: unknown, field: string): string {
  if (typeof body !== 'object' || body === null) {
    return '';
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}
