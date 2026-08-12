# GPX Route Comparer

Compare GPX rides from a manually selected starting line, replay them together, and archive commute statistics in Supabase.

## Features

- Compare one or more GPX recordings per route.
- Synchronize recordings at an interpolated starting-line intersection.
- Replay routes at 1x–16x with shared speed-color tiers.
- Store original GPX files in a private Supabase Storage bucket.
- Store calculated trip metrics in Supabase Postgres.
- Browse the trip leaderboard and load archived files into Route A or Route B.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Add the Supabase project URL and secret key to `.env`. The secret key is used only by server-side functions and must never be exposed in `app.js` or a public environment variable.

The local development command automatically loads `.env` from the project root. An optional `.env.local` file can override individual values; both filenames are ignored by Git. Do not use `local.env`.

If the environment variables are omitted, route comparison still works and the archive UI reports that storage is not configured. The included development server mirrors the project's Vercel API routes without requiring the Vercel CLI.

## Supabase setup

Run [`supabase/migrations/20260812000000_create_trip_archive.sql`](supabase/migrations/20260812000000_create_trip_archive.sql) against the target Supabase project. It creates:

- A private `gpx-files` Storage bucket.
- The `public.trips` metrics table and leaderboard indexes.
- Row-level security with no public client policies. Vercel Functions use the server-only secret key.

Required environment variables:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_STORAGE_BUCKET=gpx-files
```

Optional automatic direction suggestion variables:

```text
COMMUTE_HOME_LAT=50.000000
COMMUTE_HOME_LON=8.000000
COMMUTE_WORK_LAT=50.100000
COMMUTE_WORK_LON=8.100000
COMMUTE_ENDPOINT_RADIUS_M=1000
```

Set these under Vercel Project Settings → Environment Variables and redeploy. The radius is the maximum distance from each configured endpoint used for a confident direction match; it defaults to 1000 metres and is constrained to 100–5000 metres. Direction is automatically preselected only when both the start and finish match the corresponding home/work endpoints. Otherwise the selection remains manual.

These coordinates are returned to the browser to calculate and explain the suggestion. They are configuration rather than secrets; use nearby approximate points instead of exact addresses if desired.

Legacy projects can use `SUPABASE_SERVICE_ROLE_KEY` instead of `SUPABASE_SECRET_KEY`.

## Deploy to Vercel

1. Import this Git repository into Vercel.
2. Add the three Supabase variables and, optionally, the five commute endpoint variables under Project Settings → Environment Variables.
3. Deploy. Vercel automatically serves the static frontend and the files under `api/` as Node.js Functions.

The application intentionally has no user authentication yet. Anyone who can access the deployment can list, upload, and download archived trips through the application API. Supabase credentials remain server-only, and no delete endpoint is exposed.

Uploads are capped at 4 MB to remain safely below the Vercel Function request-body limit. The original GPX file is retained so metrics can be recalculated later when the processing algorithm changes.

## Screenshot 

![A map with two different routes, synced to start from the same point.](gpx-comparer-screenshot.jpg)

## Attribution

Based on [GPX Route Comparer](https://github.com/ZeroOne3010/gpx-comparer) by Ville Saalo. Used and modified under the MIT License.
