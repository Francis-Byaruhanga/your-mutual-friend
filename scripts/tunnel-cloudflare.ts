/**
 * A Cloudflare **named** tunnel, which gives a hostname that never changes, so
 * the Africa's Talking callback URL is set once and stays valid.
 *
 * This is the production-grade option. A quick tunnel (scripts/tunnel.ts) hands
 * you a random URL on every restart, which is fine for a demo but not for a
 * field test.
 *
 * One time setup:
 *   1. Own a domain and add it to a (free) Cloudflare account:
 *      https://dash.cloudflare.com -> Add a site -> change your nameservers
 *   2. cloudflared tunnel login            # opens a browser, pick the domain
 *   3. cloudflared tunnel create ymf-ussd
 *   4. cloudflared tunnel route dns ymf-ussd ussd.yourdomain.com
 *   5. put the tunnel id in .env as CLOUDFLARE_TUNNEL_ID, then run this script
 *
 * Requires outbound TCP and UDP on port 7844. Some office networks block it.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { config, ussdCallbackUrl } from '../src/config.js';

const TUNNEL_NAME = 'ymf-ussd';
const configPath = join(homedir(), '.cloudflared', `${TUNNEL_NAME}.yml`);

const tunnelId = process.env.CLOUDFLARE_TUNNEL_ID?.trim();
const hostname = process.env.CLOUDFLARE_HOSTNAME?.trim();

if (!tunnelId || !hostname) {
  const callback = hostname ? `https://${hostname}/ussd` : 'https://<CLOUDFLARE_HOSTNAME>/ussd';
  process.stderr.write(
    'A named tunnel needs both of these in .env:\n' +
      '  CLOUDFLARE_TUNNEL_ID=<id from `cloudflared tunnel list`>\n' +
      '  CLOUDFLARE_HOSTNAME=ussd.yourdomain.com\n\n' +
      'Then register the callback in the AT sandbox as:\n' +
      `  ${callback}\n\n` +
      'For a quick tunnel with a changing URL, use `pnpm tunnel` instead.\n',
  );
  process.exit(1);
}

if (!existsSync(configPath)) {
  process.stderr.write(
    `No tunnel config at ${configPath}.\n\n` +
      'A named tunnel also needs credentials, which live in your home directory:\n' +
      '  cloudflared tunnel login\n' +
      `  cloudflared tunnel create ${TUNNEL_NAME}\n` +
      `  cloudflared tunnel route dns ${TUNNEL_NAME} ${hostname}\n\n` +
      `That writes ${configPath}. Point it at this app:\n` +
      `  ingress:\n    - hostname: ${hostname}\n      service: http://localhost:${config.PORT}\n` +
      '    - service: http_status:404\n',
  );
  process.exit(1);
}

// A missing or stale ingress rule silently breaks the callback, so fail loudly.
const tunnelConfig = readFileSync(configPath, 'utf8');
if (!tunnelConfig.includes(String(config.PORT))) {
  process.stderr.write(
    `${configPath} does not point at port ${config.PORT}.\n` +
      `Add:\n  ingress:\n    - hostname: ${hostname}\n      service: http://localhost:${config.PORT}\n` +
      '    - service: http_status:404\n',
  );
  process.exit(1);
}

process.stdout.write(
  [
    `Starting named Cloudflare tunnel ${TUNNEL_NAME}`,
    `  tunnel   ${tunnelId}`,
    `  hostname ${hostname}`,
    `  upstream http://localhost:${config.PORT}`,
    '',
    '  AT sandbox callback URL (set once, never changes):',
    `  ${ussdCallbackUrl.replace(config.AT_CALLBACK_BASE_URL, `https://${hostname}`)}/ussd`,
    '',
  ].join('\n'),
);

const tunnel = spawn('cloudflared', ['tunnel', 'run', TUNNEL_NAME], { stdio: 'inherit' });

tunnel.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') {
    process.stderr.write('cloudflared is not installed.  sudo pacman -S cloudflared\n');
    process.exit(1);
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => tunnel.kill(signal));
}

tunnel.on('close', (code) => process.exit(code ?? 0));
