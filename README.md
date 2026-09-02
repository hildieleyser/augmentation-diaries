# Augmentation Diaries

The public site for the podcast, plus a small backend that receives enquiries from
the form at the bottom of the page.

No dependencies. Node's own standard library does the whole job, so there is
nothing to install and nothing to keep patched.

## Running it

```bash
node server.js          # http://127.0.0.1:3000
npm run dev             # same, restarting on file changes
npm test                # 25 tests, no network needed
```

## Layout

```
public/            the site, served as static files
  index.html       one page
  assets/site.css  all of the styling
  assets/art.js    the four drawings, rendered to canvas at load
  assets/form.js   the enquiry form
lib/config.js      environment variables, with defaults
lib/validate.js    what counts as a valid enquiry
lib/store.js       append-only JSON Lines storage
lib/ratelimit.js   fixed-window per-IP limiter
server.js          routing, static files, security headers
data/              where enquiries land (git-ignored)
test/              node:test suites for all of the above
```

## Endpoints

| Method | Path              | Notes                                                    |
| ------ | ----------------- | -------------------------------------------------------- |
| GET    | `/`               | the page                                                 |
| GET    | `/healthz`        | `{ ok: true, uptime }` for a monitor                     |
| POST   | `/api/enquiries`  | validates, rate limits, appends. `201` with the record id |
| GET    | `/api/enquiries`  | needs `Authorization: Bearer $ADMIN_TOKEN`               |

Reading what has come in:

```bash
ADMIN_TOKEN=$(openssl rand -hex 32) node server.js
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" localhost:3000/api/enquiries | jq
```

Or straight off disk, since the format is one JSON object per line:

```bash
jq -r '[.receivedAt, .kind, .name, .email] | @tsv' data/enquiries.jsonl
```

## Configuration

Copy `.env.example` to `.env`. Every value has a working default, so the only
one that matters in practice is `ADMIN_TOKEN`, and leaving it unset simply keeps
the listing endpoint shut.

`TRUST_PROXY=1` is needed behind nginx, Fly, Render or anything else that sets
`X-Forwarded-For`, otherwise the rate limiter sees one client address for the
whole internet.

## What the backend does about abuse

- A hidden `role` field in the form. Anything filled into it gets a `202` and is
  thrown away, so a bot cannot tell it failed.
- The form refuses a submission completed in under two seconds.
- Five submissions per IP per ten minutes by default.
- A 32 KB body cap, read as a stream, so a large upload is cut off rather than
  buffered.
- Length caps and control-character stripping on every text field.
- The admin token is compared in constant time.
- Static file paths are resolved and then checked to be inside `public/`.

## Before this goes live

- Put a real address in `public/index.html`, in place of `REPLACE@EXAMPLE.COM`.
  It appears once in the form's fallback line.
- Check Gregory's biography, in the "Who is making it" section. The Rough
  Translation and NPR details were written from public sources rather than from
  him.
- Confirm the Plasticity Lab wording describes the affiliation as it actually
  stands.
- The four drawings are generated, not photographic, and the footer says so. If
  photographs arrive, drop them in `public/assets/` and replace the `<canvas>`
  elements with `<img>`.

## Storage, and when to move off it

JSON Lines on disk suits a handful of enquiries a week: it survives a crash
mid-write, it is readable with `cat`, and it needs no service running behind it.
It assumes one process with a persistent disk, so it will not work on a
serverless host, where the filesystem disappears between invocations.

To move to Postgres, replace `lib/store.js` with something exposing the same two
methods, `add(enquiry, meta)` and `list({ limit })`. Nothing else in the codebase
touches storage.

## Deploying

Any host that runs a Node process with a persistent disk works. A container is
included:

```bash
docker build -t augmentation-diaries .
docker run -p 3000:3000 -v augdiaries-data:/data \
  -e TRUST_PROXY=1 -e ADMIN_TOKEN=... augmentation-diaries
```

Terminate TLS at the proxy in front of it. The app sets a content security
policy that allows only Google Fonts from outside its own origin.
