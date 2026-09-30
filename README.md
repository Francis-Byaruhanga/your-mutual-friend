# Your Mutual Friend

USSD prototype for Old Mutual's hybrid life and health micro insurance product for
historically excluded market segments: retail traders, SME vendors, market vendors,
boda-boda riders and taxi drivers.

Built on the **Africa's Talking** sandbox, reached over a public HTTPS tunnel.

> While in need, your friend indeed.

## The product

| Tier | Save per month | Annual benefits |
| --- | --- | --- |
| Gold | 10,000 UGX | up to 5,000,000 UGX |
| Silver | 7,500 UGX | up to 3,500,000 UGX |
| Bronze | 5,000 UGX | up to 2,500,000 UGX |

Pricing lives in one place, [`src/domain/products.ts`](src/domain/products.ts). Bronze was
corrected to 2,500,000 UGX during the build; the original brief listed the same figure as Silver.

## Quick start

```bash
pnpm install
cp .env.example .env      # then fill in AT_API_KEY
pnpm dev:tunnel           # starts the app and the public tunnel together
```

It prints the public callback URL to paste into the sandbox. Read the tunnel section
first, because that URL changes every time you restart.

---

## Africa's Talking sandbox setup

Do this once, then paste the callback URL your tunnel prints (see the next section).

1. **Create a sandbox account** at <https://account.africastalking.com/apps/sandbox>.
   The username is `sandbox` and the API key is shown on that page.

2. **Create a USSD channel** at <https://account.africastalking.com/apps/sandbox>
   (USSD section). Pick any short code, for example `123`, which you dial as `*123#`.

3. **Set the callback URL** on that channel to your public URL plus `/ussd`:

   ```
   https://<your-public-tunnel-url>/ussd
   ```

4. **Open the simulator** at <https://simulator.africastalking.com>, register a test
   phone number, and dial your short code.

Every screen also appears in the sandbox **session details** as the value of the
`at-ussd-hop-metadata` header, which makes a misbehaving journey easy to trace.

### Where the API key goes

The key goes in `.env` at the project root, which is gitignored. Only `.env.example`
is committed.

```bash
# .env
AT_USERNAME=sandbox
AT_API_KEY=your_sandbox_key_here
AT_ENVIRONMENT=sandbox
```

Two things worth knowing:

- **The USSD callback itself does not use the API key.** Africa's Talking POSTs to your
  URL and you reply with a `text/plain` string. No credential is involved.
- The key is there for the two things still to come: the purchase confirmation **SMS**
  and the **mobile money STK push**. `src/config.ts` validates it at boot, so a typo
  surfaces immediately rather than at the first SMS.

## Public tunnel setup

Africa's Talking reaches your app over the internet, so localhost will not do.
Pick one of these. All of them need the app running on `PORT` (3000).

| Command | Hostname | Cost | Needs |
| --- | --- | --- | --- |
| `pnpm tunnel:ngrok` | `*.ngrok-free.dev`, yours to choose | free | ngrok account, reachable ngrok edge |
| `pnpm tunnel:cloudflare` | `ussd.yourdomain.com` | free | a domain you own in Cloudflare |
| `pnpm tunnel` | random `*.trycloudflare.com` | free | nothing, but changes every restart |

### A fixed hostname, today, for free

You already have one. A reserved ngrok domain does not change between restarts:

```bash
ngrok config add-authtoken <your-authtoken>   # once
pnpm dev:tunnel:ngrok                         # or pnpm tunnel:ngrok alongside pnpm dev
```

Register the callback as `https://<your ngrok domain>/ussd` and it stays valid for
every future session.

**The catch is the network, not ngrok.** A quick check on the office network showed
TLS to ngrok's edge being reset, and cloudflared failing with
`Allow outbound QUIC traffic on port 7844 or use HTTP2` then `Error 1033`. On a
hotspot both work. If you need ngrok from the office, put it behind a proxy or just
use a hotspot for tunnel traffic.

### A fixed hostname you do not have to think about: named Cloudflare tunnel

A quick tunnel URL is random per restart, which is a poor thing to depend on during
a field test. A named tunnel gives a hostname that never changes, so the AT callback
is set once and stays valid. One time setup:

1. Own a domain and add it to a free Cloudflare account at
   <https://dash.cloudflare.com> (Add a site, then change your nameservers at your
   registrar).
2. Authenticate and create the tunnel:

   ```bash
   cloudflared tunnel login                  # opens a browser, choose your domain
   cloudflared tunnel create ymf-ussd
   cloudflared tunnel route dns ymf-ussd ussd.yourdomain.com
   ```

3. Put the id and hostname in `.env`:

   ```bash
   CLOUDFLARE_TUNNEL_ID=<id from `cloudflared tunnel list`>
   CLOUDFLARE_HOSTNAME=ussd.yourdomain.com
   ```

4. Check that `~/.cloudflared/ymf-ussd.yml` routes to this app, or the callback
   silently 404s:

   ```yaml
   tunnel: <your tunnel id>
   credentials-file: /home/you/.cloudflared/<machine-id>.json
   ingress:
     - hostname: ussd.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

5. `pnpm dev:tunnel:cloudflare`

Then register `https://ussd.yourdomain.com/ussd` in the AT sandbox and never touch
it again. `pnpm tunnel:cloudflare` refuses to start if the ingress rule does not
point at the right port, rather than failing quietly at test time.

**Both cloudflared options need outbound TCP and UDP on port 7844.** Check before
you rely on a network:

```bash
timeout 6 bash -c 'cat </dev/null >/dev/tcp/region1.v2.argotunnel.com/7844' && echo open || echo blocked
```

### Quick tunnel, for a demo

No account, nothing to configure, but the URL changes on every restart so the AT
callback has to be re-registered each time:

```bash
pnpm dev:tunnel
```

It prints the callback URL to copy.

---

## The journeys

### 1. Sign Up

```
CON Welcome to Your Mutual Friend          CON Select a cover:            CON Enter your first name
   While in need, your friend indeed    ->   1. Gold ...               ->   ...
   1. Sign Up                            CON Confirm your details:       CON Enter your surname
   2. Claim                              ->   Name: John             ->   ...
   3. Check Details                      CON Enter your date of birth    CON Confirm your details
                                                                          1. Correct
                                                                          2. Incorrect
                                                                          0. Back
```

...then the summary, the simulated mobile money prompt, and the policy confirmation with
the provider list and terms link.

The brief jumps from cover selection straight to a pre-filled name, with no screen that
collects it. Two capture screens were added so the journey is complete and testable.

### 2. Claim

Choose option 2, confirm your details, enter the service ticket number from your
provider, and receive a claim reference.

### 3. Check Details

Choose option 3 for your name, date of birth, policy number, policy type and tenure.

Anyone without an active policy gets a clear message pointing them at Sign Up, rather
than an empty screen.

---

## Prototype limitations

These are deliberate, and each is the next thing to build.

- **The mobile money PIN is simulated.** The screen accepts any 4 to 6 digits so the
  journey can be demonstrated. The digits are never stored, logged or forwarded, and
  the app logs nothing containing them. Before launch this must be replaced by an
  **Africa's Talking STK push**, where the network collects the PIN on the handset and
  the application never sees it.
- **No SMS.** The purchase confirmation prints the hospital, pharmacy and funeral
  provider list plus the terms link directly in the terminal `END` message instead.
  `purchaseConfirmation()` in [`src/ussd/screens.ts`](src/ussd/screens.ts) holds the
  text that will become the SMS body.
- **Policies are held in memory.** Restarting the server loses every issued policy, so
  Check Details and Claim only work for someone who signed up in the same run. The
  `PolicyRepository` interface in [`src/domain/repository.ts`](src/domain/repository.ts)
  is the seam for a real database.
- **Sessions are in memory too**, with a 30 minute idle TTL. A restart mid-journey
  returns the customer to the main menu rather than guessing where they were.
- **The callback endpoint is unauthenticated**, which is normal for the sandbox. Add a
  shared secret before pointing anything at production.
- **Providers are hard coded** sample names in `screens.ts`. They should come from a
  lookup keyed on the customer's area.
- **One policy per phone number** is treated as the active one. Multi-policy holders
  will need a policy chooser.

### A note on the claims screen

The brief shows a `1. Submit` line under the ticket number input. On a real USSD
handset the value a customer types *is* the submission, so adding a Submit step would
mean typing the ticket number twice. The input is taken as the submission and `0. Back`
is offered instead.

---

## Project layout

```
src/
  server.ts            bootstrap, prints the callback URL
  app.ts               express app: POST /ussd, GET /health
  config.ts            .env loading and validation
  domain/              product, policy, claim, validation, repositories
  ussd/
    router.ts          state machine; 0. Back rewinds one screen
    session.ts         session store with idle TTL
    reply.ts           CON/END builders and telco-safe character stripping
    screens.ts         every customer-facing string
  flows/               root, signup, claim, details
scripts/
  tunnel.ts            cloudflared quick tunnel, random URL
  tunnel-ngrok.ts     ngrok with a reserved domain, fixed URL
  tunnel-cloudflare.ts  named Cloudflare tunnel, fixed URL
  simulate.ts          drive the journey from the terminal
tests/                 vitest + supertest
```

### How the router works

Africa's Talking sends the whole session history in `text`, joined with `*`. Rather
than matching every possible string such as `'1*1*John*Doe*1*05.10.1988'`, the router
keeps a `state` plus a `stateStack` in the session store. Each state handles one input
and says where to go next.

`0. Back` pops the state stack and asks the previous state to redraw itself with an
empty input, so the customer lands on the previous screen instead of replaying what
they typed. Data belonging to the abandoned attempt is dropped, which is what stops a
stale date of birth following a customer who changed tier.

### Response rules

Africa's Talking terminates a session on a 4XX or a reply that does not start with
`CON` or `END`, and expects an answer within 10 seconds. So:

- every reply is prefixed with `CON` or `END`, including errors
- telco-hostile characters (parentheses, smart quotes, em dashes, currency symbols)
  are stripped centrally in `reply.ts` rather than trusted to each screen
- `text/plain` is returned with the `at-ussd-hop-metadata` header

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | app with reload on `localhost:3000` |
| `pnpm dev:tunnel` | app and a quick tunnel together |
| `pnpm tunnel` | just the cloudflared quick tunnel, random URL |
| `pnpm tunnel:ngrok` | ngrok with your reserved domain, fixed URL |
| `pnpm tunnel:cloudflare` | named Cloudflare tunnel, fixed URL |
| `pnpm dev:tunnel:ngrok` | app and ngrok together |
| `pnpm dev:tunnel:cloudflare` | app and named Cloudflare tunnel together |
| `pnpm simulate` | interactive USSD in the terminal |
| `pnpm simulate 3` | scripted, e.g. check details |
| `pnpm test` | vitest suite |
| `pnpm typecheck` | tsc, no emit |
| `pnpm lint` | biome check |
| `pnpm format` | biome check, with fixes |
| `pnpm build` / `pnpm start` | compile to `dist/` and run it |

## Tests

100 tests covering all three journeys, the `0. Back` rewind, invalid input on every
screen, leap days and the eligible age range, duplicate claim tickets, duplicate
policy numbers, lost sessions, and the transport contract Africa's Talking depends on.

They drive the real Express app over the real form-encoded wire format, with an
injectable clock, so nothing reaches the network.

```bash
pnpm test
```

## Documentation

- [USSD overview](https://developers.africastalking.com/docs/ussd/overview)
- [Handling sessions](https://developers.africastalking.com/docs/ussd/handle_sessions)
- [Sandbox help](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox)
