import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, USSD_ROUTE } from '../src/app.js';
import { createSessionStore } from '../src/ussd/session.js';
import { createHarness } from './harness.js';

describe('POST /ussd transport', () => {
  it('answers with text/plain and the CON prefix on the first hop', async () => {
    const { app: server } = createApp({ store: createSessionStore() });

    const response = await request(server).post(USSD_ROUTE).type('form').send({
      sessionId: 'transport-1',
      serviceCode: '123',
      phoneNumber: '256700000001',
      networkCode: '64101',
      text: '',
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text.startsWith('CON ')).toBe(true);
    expect(response.text).toContain('Welcome to Your Mutual Friend');
  });

  it('sets the at-ussd-hop-metadata header so the journey is traceable', async () => {
    const { app: server } = createApp({ store: createSessionStore() });

    const response = await request(server).post(USSD_ROUTE).type('form').send({
      sessionId: 'transport-2',
      serviceCode: '123',
      phoneNumber: '256700000001',
      networkCode: '64101',
      text: '',
    });

    expect(response.headers['at-ussd-hop-metadata']).toBe('welcomeMenu');
  });

  it('never returns a 4XX, which would make AT terminate the session', async () => {
    const { app: server } = createApp({ store: createSessionStore() });

    const response = await request(server).post(USSD_ROUTE).type('form').send({ text: '' });

    expect(response.status).toBe(200);
    expect(response.text.startsWith('END ')).toBe(true);
  });

  it('rejects responses that do not start with CON or END', async () => {
    const harness = createHarness();
    const first = await harness.send('');

    expect(first.body).toMatch(/^(CON|END) /);
  });
});

describe('GET /health', () => {
  it('reports ok and the active session count', async () => {
    const { app: server } = createApp({ store: createSessionStore() });

    await request(server).post(USSD_ROUTE).type('form').send({
      sessionId: 'health-1',
      serviceCode: '123',
      phoneNumber: '256700000001',
      networkCode: '64101',
      text: '',
    });

    const response = await request(server).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.activeSessions).toBe(1);
  });
});
