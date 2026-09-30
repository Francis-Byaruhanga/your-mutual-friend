/**
 * Alternative to the cloudflared quick tunnel: ngrok with a reserved domain, so
 * the callback URL stays the same across restarts.
 *
 *   pnpm tunnel:ngrok
 *
 * The office network could not reach ngrok's edge, so this is kept for use on a
 * network that can. Set NGROK_DOMAIN in .env to your reserved domain first.
 */
import { spawn } from 'node:child_process';
import { config } from '../src/config.js';

const domain = config.NGROK_DOMAIN.trim();

if (!domain) {
  process.stderr.write(
    'NGROK_DOMAIN is not set.\n' +
      'Reserve a static domain in the ngrok dashboard, then add it to .env, for example:\n' +
      '  NGROK_DOMAIN=your-mutual-friend.ngrok-free.dev\n',
  );
  process.exit(1);
}

const args = ['http', String(config.PORT), '--url', `https://${domain}`];
process.stdout.write(`Starting ngrok: ngrok ${args.join(' ')}\n`);

const tunnel = spawn('ngrok', args, { stdio: 'inherit' });

tunnel.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') {
    process.stderr.write(
      'ngrok is not installed or not on your PATH.\n' +
        '  sudo pacman -S ngrok   or   brew install ngrok/ngrok\n',
    );
    process.exit(1);
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => tunnel.kill(signal));
}

tunnel.on('close', (code) => process.exit(code ?? 0));
