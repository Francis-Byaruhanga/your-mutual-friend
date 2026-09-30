import { createApp } from './app.js';
import { config, ussdCallbackUrl } from './config.js';
import { scheduleSessionSweep } from './ussd/session.js';

const { app, store } = createApp();
scheduleSessionSweep(store);

const server = app.listen(config.PORT, () => {
  console.info('Your Mutual Friend USSD service');
  console.info(`  listening on   http://localhost:${config.PORT}`);
  console.info(`  ussd endpoint  POST /ussd`);
  console.info(`  health         GET /health`);
  console.info(`  AT environment ${config.AT_ENVIRONMENT}`);
  console.info('');
  console.info('  Paste this callback URL into the AT sandbox USSD channel:');
  console.info(`  ${ussdCallbackUrl}`);
  console.info('');
  if (config.AT_ENVIRONMENT === 'production') {
    console.warn('  AT_ENVIRONMENT is production. Replace the simulated PIN screen with STK.');
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.info(`\nReceived ${signal}, shutting down.`);
    server.close(() => process.exit(0));
  });
}
