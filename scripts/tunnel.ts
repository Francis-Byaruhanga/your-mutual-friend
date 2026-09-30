/**
 * Exposes the local app on a public HTTPS URL so Africa's Talking can reach the
 * USSD callback.
 *
 *   pnpm tunnel
 *
 * Uses a cloudflared quick tunnel: no account and no authtoken needed, which
 * matters because the office network blocked ngrok's edge and port 7844. The
 * trade off is a random *.trycloudflare.com URL that changes on every restart, so
 * the URL printed here has to be copied into the AT sandbox callback each time.
 *
 * For a fixed URL, use `pnpm tunnel:ngrok` with a reserved ngrok domain on a
 * network that can reach it.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { config, ussdCallbackUrl } from '../src/config.js';

const tunnel = spawn(
  'cloudflared',
  ['tunnel', '--url', `http://localhost:${config.PORT}`, '--no-autoupdate'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
let announced = false;

function handleLine(line: string): void {
  if (announced || !URL_PATTERN.test(line)) {
    return;
  }
  const publicUrl = URL_PATTERN.exec(line)?.[0];
  if (!publicUrl) {
    return;
  }
  announced = true;

  process.stdout.write(
    [
      '',
      '  Public URL  ' + publicUrl,
      '  Callback    ' + publicUrl + '/ussd',
      '',
      '  Copy that callback URL into the AT sandbox USSD channel:',
      `  ${publicUrl}/ussd`,
      '',
      '  Note: it changes every time this tunnel restarts, so re-copy it then.',
      '',
      '  Callback URL from .env (update if you want config to match):',
      `  ${ussdCallbackUrl}`,
      '',
    ].join('\n'),
  );
}

createInterface({ input: tunnel.stdout }).on('line', handleLine);
createInterface({ input: tunnel.stderr }).on('line', handleLine);

tunnel.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') {
    process.stderr.write(
      'cloudflared is not installed or not on your PATH.\n' +
        '  sudo pacman -S cloudflared\n\n' +
        'Note: cloudflared needs outbound port 7844, which some office networks block.\n',
    );
    process.exit(1);
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

tunnel.on('close', (code) => process.exit(code ?? 0));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => tunnel.kill(signal));
}
