# Your Mutual Friend

USSD prototype for Old Mutual's hybrid life and health micro insurance product, aimed at
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
corrected to 2,500,000 UGX during the build; the original brief listed the same figure as
Silver.

---

## Quick start

```bash
pnpm install
cp .env.example .env          # add your AT_API_KEY
pnpm dev:tunnel:ngrok         # app + public tunnel with a fixed URL
```

Then paste the callback URL it prints into your AT sandbox USSD channel.

You can also drive the whole journey in the terminal, with no tunnel and no AT account:

```bash
pnpm simulate                                        # interactive
pnpm simulate 1 1 Sarah Nakato 1 22.07.1992 1 9999   # scripted sign up
pnpm simulate 3                                      # check details
```

---

## Africa's Talking sandbox setup

### Sandbox short codes are not production short codes

This trips people up, so it is worth being explicit. A code like `*384*25894#` is a
**production** service code. Africa's Talking answers production codes it has no callback
for with its own placeholder:

> You have arrived at Africa's Talking USSD services

That message means the code is not pointing at this app. It is not a bug in the code
here, and no amount of dialling differently will change it. The **sandbox only routes
short codes you create in your own sandbox account**, so the simulator will never reach
this app through a production code.

For a field test on real handsets you need the production console instead, with this app
reachable on a stable URL.

### One time setup

1. **Create a sandbox account** at
   <https://account.africastalking.com/apps/sandbox>. The username is `sandbox`; the API
   key is shown on that page.

2. **Create a USSD channel**:
   <https://account.africastalking.com/apps/sandbox/ussd/channel/create>

3. **Set the callback URL** on that channel:
   <https://account.africastalking.com/apps/sandbox/ussd/channel/callback>

   ```
   https://<your-public-url>/ussd
   ```

   Note the path above is `/ussd/channel/callback`, not `/ussd/channel/create`. Africa's
   Talking's help article links both steps to the same URL, which is a typo on their
   side.

4. **Open the simulator** at <https://simulator.africastalking.com:1517/> (note the
   `:1517` port), register a test phone number, and dial the short code from step 2.

### Reading a journey

Every screen is reported in the sandbox session details as the value of the
`at-ussd-hop-metadata` response header, so you can see exactly which screen a tester's
session is sitting on:

| Hop | Screen |
| --- | --- |
| `welcomeMenu` | main menu |
| `coverSelect` | the three tiers |
| `captureFirstName` / `captureSurname` | name capture |
| `confirmIdentity` | confirm name, step 3 of the brief |
| `captureDateOfBirth` | date of birth, step 4 |
| `verifyPolicy` | summary, step 5 |
| `mobileMoneyPin` | simulated payment |
| `purchaseComplete` | policy issued |
| `claimConfirm` / `captureTicketNumber` / `claimSubmitted` | the claims journey |
| `policyDetails` / `detailsNoPolicy` | check details |

### Where the API key goes

In `.env` at the project root, which is gitignored. Only `.env.example` is committed.

```bash
AT_USERNAME=sandbox
AT_API_KEY=your_sandbox_key_here
AT_ENVIRONMENT=sandbox
```

Two things worth knowing:

- **The USSD callback does not need the API key.** Africa's Talking POSTs to your URL and
  you reply with a `text/plain` string. No credential is involved in that hop.
- The key is there for what is still to come: the purchase confirmation **SMS** and the
  **mobile money STK push**. `src/config.ts` validates it at boot, so a typo surfaces
  immediately rather than at the first SMS.

---

## Public tunnel setup

Africa's Talking reaches this app over the internet, so localhost will not do. All of
these need the app running on `PORT` (3000).

| Command | Hostname | Needs |
| --- | --- | --- |
| `pnpm dev:tunnel:ngrok` | `deafening-generic-chemist.ngrok-free.dev`, fixed | ngrok account |
| `pnpm dev:tunnel:cloudflare` | `ussd.yourdomain.com`, fixed | a domain you own |
| `pnpm dev:tunnel` | random `*.trycloudflare.com`, **changes every restart** | nothing |

**Use `pnpm dev:tunnel:ngrok` for anything you intend to repeat.** Only the first two
give a URL that stays valid between sessions, and Africa's Talking needs the callback to
be re-registered every time a quick tunnel restarts.

### ngrok, with a fixed URL

One time:

```bash
ngrok config add-authtoken <your-authtoken>
ngrok config check
```

Set your reserved domain in `.env`:

```bash
NGROK_DOMAIN=deafening-generic-chemist.ngrok-free.dev
```

Then every session:

```bash
pnpm dev:tunnel:ngrok
```

Register the callback once as `https://<NGROK_DOMAIN>/ussd` and it stays valid.

### Named Cloudflare tunnel, for a hostname that never changes

Worth setting up before a field test, because a named tunnel does not depend on anyone
keeping a process alive. You need a domain you own, added to a free Cloudflare account
at <https://dash.cloudflare.com> (Add a site, then change its nameservers at your
registrar).

```bash
cloudflared tunnel login                  # opens a browser, choose your domain
cloudflared tunnel create ymf-ussd
cloudflared tunnel route dns ymf-ussd ussd.yourdomain.com
```

Then set in `.env`:

```bash
CLOUDFLARE_TUNNEL_ID=<id from `cloudflared tunnel list`>
CLOUDFLARE_HOSTNAME=ussd.yourdomain.com
```

Check that `~/.cloudflared/ymf-ussd.yml` points at this app, because a stale ingress rule
fails as a silent 404 at test time:

```yaml
tunnel: <your tunnel id>
credentials-file: /home/you/.cloudflared/<machine-id>.json
ingress:
  - hostname: ussd.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Then `pnpm dev:tunnel:cloudflare`. The script refuses to start if that ingress rule does
not point at the right port.

### Quick tunnel, for a throwaway demo

No account and nothing to configure, but the URL is random per restart, so the sandbox
callback has to be re-registered each time. `pnpm dev:tunnel` starts it and prints the
URL.

---

## Troubleshooting

**Africa's Talking returns its own placeholder message, not our menu.**
The dialled short code has no callback URL registered. Either it is a production code
rather than a sandbox one, or the callback on the channel is wrong. See
[Sandbox short codes](#sandbox-short-codes-are-not-production-short-codes).

**The tunnel URL is in `.env` but the app is served somewhere else.**
`.env`'s `AT_CALLBACK_BASE_URL` is a record of what you registered in the sandbox, not
the source of truth. The live tunnel is the source of truth. If they disagree, Africa's
Talking is probably pointed at the wrong one.

**Two different URLs are printed at startup.**
`pnpm dev:tunnel` starts the app, which prints `AT_CALLBACK_BASE_URL` from `.env`, and
separately starts a quick tunnel, which prints its own random URL. Use
`pnpm dev:tunnel:ngrok` instead and both refer to the same fixed URL.

**`Error 1033` from cloudflared, or `Allow outbound QUIC traffic on port 7844`.**
The network blocks outbound TCP/UDP on port 7844. Check before relying on a network:

```bash
timeout 6 bash -c 'cat </dev/null >/dev/tcp/region1.v2.argotunnel.com/7844' && echo open || echo blocked
```

**`http_code=000`, or `Error 522` from a proxy, against an ngrok URL.**
The network is not reaching ngrok's edge. Seen on an office network while the ngrok
agent still reported `online` with zero live connections. A mobile hotspot fixed it. This
is a network problem, not an app problem.

**`pnpm simulate` starts a server of its own.**
That is intentional: it starts a temporary in-process instance when nothing is listening
on `PORT`, so you can use it without `pnpm dev`. If a server is already running it uses
that one instead.

**Check Details says no active policy found.**
Policies live in memory. If the server restarted since someone signed up, their policy
is gone. This is a prototype limitation, not a fault.

---

## The journeys

### 1. Sign Up

1. Main menu: `1. Sign Up`
2. Select a cover: Gold, Silver or Bronze
3. Enter first name, then surname
4. Confirm details: `1. Correct`, `2. Incorrect`, `0. Back`
5. Enter date of birth as `dd.mm.yyyy`, the format on the National ID
6. Verify the summary: `1. Proceed to pay first installment`, `2. Go Back`
7. Mobile money PIN, simulated
8. Policy number issued, with the provider list and terms link

The brief moves from cover selection straight to a pre-filled name, with no screen that
collects it, so two capture screens were added to make the journey complete and testable.

### 2. Claim

1. Main menu: `2. Claim`
2. Confirm your details
3. Enter the service ticket number from your hospital, pharmacy or funeral provider
4. Claim reference issued

### 3. Check Details

Main menu: `3. Check Details` for name, date of birth, policy number, policy type and
tenure so far. Anyone without an active policy is pointed at Sign Up rather than shown an
empty screen.

### Navigation

Every input screen offers `0. Back`, which returns to the previous screen and re-renders
it. Data from the abandoned attempt is discarded, so a customer who goes back and picks a
different tier does not carry a stale date of birth into the new policy.

---

## Prototype limitations

Each of these is the next thing to build.

- **The mobile money PIN is simulated.** Any 4 to 6 digits are accepted so the journey
  can be demonstrated. The digits are never stored, logged or forwarded. Before launch
  this must be replaced by an **Africa's Talking STK push**, where the network collects
  the PIN on the handset and this application never sees it.
- **No SMS.** The purchase confirmation prints the hospital, pharmacy and funeral
  provider list plus the terms link in the terminal `END` message instead.
  `purchaseConfirmation()` in [`src/ussd/screens.ts`](src/ussd/screens.ts) holds the text
  that becomes the SMS body.
- **Policies are in memory.** A server restart loses every issued policy, so Check
  Details and Claim only work for someone who signed up since the last restart. The
  `PolicyRepository` interface in
  [`src/domain/repository.ts`](src/domain/repository.ts) is the seam for a real database.
- **Sessions are in memory too**, with a 30 minute idle TTL. A restart mid-journey
  returns the customer to the main menu rather than guessing where they were.
- **The callback is unauthenticated**, which is normal for the sandbox. Add a shared
  secret before anything reaches production.
- **Providers are hard coded** sample names. They should come from a lookup keyed on the
  customer's area.
- **One policy per phone number** is treated as the active one, so multi-policy holders
  will need a chooser.
- **The claims screen has no Submit step.** The brief shows a `1. Submit` line under the
  ticket number input, but on a real handset the value typed *is* the submission, so a
  Submit step would mean typing the ticket number twice. `0. Back` is offered instead.

---

## Project layout

```
src/
  server.ts             bootstrap and startup banner
  app.ts                express app: POST /ussd, GET /health
  config.ts             .env loading and validation
  domain/
    products.ts         the three tiers, single source of truth
    policy.ts           issue, tenure, formatting
    claim.ts            claim submission
    validation.ts       dates, names, ticket numbers
    repository.ts       persistence interface + in-memory implementations
  ussd/
    router.ts           state machine, 0. Back rewind
    session.ts          session store with idle TTL
    reply.ts            CON/END builders, telco-safe character stripping
    screens.ts          every customer-facing string
  flows/
    root.ts signup.ts claim.ts details.ts
scripts/
  simulate.ts           drive the journey from the terminal
  tunnel.ts             cloudflared quick tunnel, random URL
  tunnel-ngrok.ts       ngrok with a reserved domain, fixed URL
  tunnel-cloudflare.ts  named Cloudflare tunnel, fixed URL
tests/
  harness.ts            drives the real app over the real wire format
  signup.test.ts claim-and-details.test.ts transport.test.ts domain.test.ts
```

### How the router works

Africa's Talking sends the whole session history in `text`, joined with `*`. Rather than
matching every possible string such as `'1*1*John*Doe*1*05.10.1988'`, the router keeps a
`state` and a `stateStack` in the session store. Each state handles one input and says
where to go next.

`0. Back` pops the state stack and asks the previous state to redraw itself with an empty
input, so the customer lands on the previous screen rather than having their input
replayed.

### Response rules

Africa's Talking terminates a session on a 4XX or a reply that does not begin with `CON`
or `END`, and expects an answer within 10 seconds. So this app:

- prefixes every reply with `CON` or `END`, including errors, and never returns a 4XX
- strips telco-hostile characters (parentheses, smart quotes, em dashes, currency
  symbols) centrally in `reply.ts` instead of trusting every screen to remember
- responds in `text/plain` with the `at-ussd-hop-metadata` header

---

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | app with reload on `localhost:3000` |
| `pnpm dev:tunnel:ngrok` | app and ngrok, fixed URL |
| `pnpm dev:tunnel:cloudflare` | app and named Cloudflare tunnel, fixed URL |
| `pnpm dev:tunnel` | app and a quick tunnel, **URL changes every restart** |
| `pnpm tunnel:ngrok` | ngrok only |
| `pnpm tunnel:cloudflare` | named Cloudflare tunnel only |
| `pnpm tunnel` | quick cloudflared tunnel only |
| `pnpm simulate` | interactive USSD in the terminal |
| `pnpm test` | vitest suite |
| `pnpm typecheck` | tsc, no emit |
| `pnpm lint` / `pnpm format` | biome check, with and without fixes |
| `pnpm build` / `pnpm start` | compile to `dist/` and run it |

---

## Tests

100 tests covering all three journeys, the `0. Back` rewind, invalid input on every screen,
leap days and the eligible age range, duplicate claim tickets, duplicate policy numbers,
lost sessions, and the transport contract Africa's Talking depends on.

They drive the real Express app over the real form-encoded wire format with an injectable
clock, so nothing touches the network.

```bash
pnpm test
```

---

## Documentation

- [USSD overview](https://developers.africastalking.com/docs/ussd/overview)
- [Handling sessions](https://developers.africastalking.com/docs/ussd/handle_sessions)
- [Sandbox help](https://help.africastalking.com/en/articles/1170660-how-do-i-get-started-on-the-africa-s-talking-sandbox)
