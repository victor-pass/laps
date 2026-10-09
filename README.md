# Laps
Allows a team of users to manage a race where each racer has a QR code scanned each lap.

## App Interface

Every page shares a persistent header: nav links plus a **Choose Race** select/create dropdown, so you can pick a race you already belong to or type a new name to create one from anywhere in the app.

Pages:
1. **Scan** - The default page. A large camera view that scans any QR code, agnostic to what it encodes. Race QR codes are join links (`https://<host>/join/<uuid>`); anything else is assumed to be a racer. Scanning a racer's QR code shows a popup with their calculated lap count and adds them to the selected race. Scanning a race QR code asks for confirmation before switching everyone's selected race, since that's an easy thing to trigger by mistake (or mischief) with a photo of the code.
2. **Show Race QR Code** - If you have access to a race you can display its QR code (and link) for others to scan. This is the primary permission model for letting others scan racers into your race. Because the code is a plain link, a new volunteer can scan it with their phone's own camera: they sign in, confirm **Join**, and land on the scanner already in the race - no install needed first.
3. **Race Summary** - Shows every racer in the race, how many laps we think they've completed, and when. Lap timestamps can be compared against a minimum lap time (a column not yet added to the db, likely configurable from this page) to flag duplicate scans. Also allows kicking off a CSV download of the raw lap details for the selected race.
4. **Join Race** (`/join/<uuid>`) - The landing page for a race link. Signing in from here returns you to it; logging in from any other page lands on the home page.


## Development

To get started:
- Install depedencies: `pnpm install` 
- Run a local dev instance: `pnpm dev`
- Deploy to cloudflare: `pnpm run deploy`

## Database
Postgres neon production db connection string is set in DATABASE_URL. Please review env.example and grab connection Details from the [neon console](https://console.neon.tech/app/projects/green-star-08181756) 

Common tasks:
- generate migration files: `npx drizzle-kit generate`
- migrate database: `npx drizzle-kit migrate`
- view database: `npx drizzle-kit studio`

## Cloudflare
- [public](https://laps.victorpass.dev)
- [workers](https://laps.victorpass.workers.dev)
- [all deployments](https://dash.cloudflare.com/0c855cdf521de8fed5ad5d3ac1c22763/workers/services/view/laps/production/deployments)

- Deploy - `pnpm run deploy`

### Cloudflare Bindings Secrets

We use cloudflare bindings to store secrets in the cloud.  Use wrangler to put secrets there that match the `.env` file. For a new cloudflare worker environment you must add the necesary secrets.

To upload them in bulk the easiest way is to add them all from the .env file:
`npx wrangler secret bulk .env`

To add a single new secret: `npx wrangler secret put ENV_VARIABLE`

(see `example.env` for all secrets used by the app)

### Updating Cloudflare Bindings types
To re-generate typescript types for cloudflare bindings:

```txt
pnpm run cf-typegen
```

## Auth

We authenticate via google auth
Locally, authentication will not run by default.  To use google authenticator please set the`GOOGLE_ID` and `GOOGLE_SECRET` from the [google auth console](https://console.cloud.google.com/auth/clients?authuser=2&orgonly=true&project=laps-509419)
