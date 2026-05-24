# File storage (logos, photos, documents) — setup & migration

This project stores uploaded files (school logos, student/teacher photos,
admission documents, testimonials avatars) **outside the database** through a
small storage abstraction at [src/lib/storage.ts](../src/lib/storage.ts).

Two drivers:

| Driver | When | Where files land |
|---|---|---|
| `local` | Dev | `public/uploads/...` — served by Next.js as static files at `/uploads/...` |
| `r2` | Prod | Cloudflare R2 bucket — served by R2's CDN at the URL in `R2_PUBLIC_URL` |

The driver is chosen by `STORAGE_DRIVER` in `.env`. Switching is a one-line env
change — no code touches the driver name.

## Why R2 in production

- Files live outside the VPS, so a VPS rebuild / migration doesn't lose them.
- Downloads bypass our Node process — every avatar fetch would otherwise be a
  Postgres roundtrip + a base64 decode + a multi-MB HTTP body. R2 serves it
  directly from its CDN.
- Storage is cheap (10 GB free, then ~$0.015/GB), and unlike S3 there are
  **no egress fees** — important if school dashboards open the same student
  photos hundreds of times a day.

## Setting up R2

1. Sign up at https://dash.cloudflare.com and enable R2.
2. Create a bucket — e.g. `erp-files`.
3. Generate an R2 API token with **Object Read + Write** scope.
4. (Optional but recommended) Connect a custom domain like
   `https://files.yourerp.com` to the bucket. Without it, you can use the
   public `*.r2.dev` development URL but it's rate-limited.
5. Fill the env vars:

   ```env
   STORAGE_DRIVER=r2
   R2_ACCOUNT_ID=<your account id>
   R2_ACCESS_KEY_ID=<token access key>
   R2_SECRET_ACCESS_KEY=<token secret>
   R2_BUCKET=erp-files
   R2_PUBLIC_URL=https://files.yourerp.com   # or your r2.dev URL
   ```

6. Restart the Next.js server.

After that, every new upload through the API goes straight to R2. The DB only
holds the resulting public URL string.

## Folder layout in storage

Files are organised so they're easy to audit or purge by school:

```
schools/<schoolId>/logo/<random>.png
schools/<schoolId>/favicon/<random>.ico
schools/<schoolId>/print-header/<random>.png
schools/<schoolId>/students/<random>.jpg
schools/<schoolId>/teachers/<random>.jpg
schools/<schoolId>/admissions/<random>.jpg
schools/<schoolId>/admissions/<admissionId>/documents/<random>.pdf
schools/<schoolId>/drivers/<random>.jpg
schools/<schoolId>/avatars/<random>.jpg
testimonials/<random>.jpg
```

Filenames are random 24-char hex — so updating an image always produces a new
key. That lets us send a 1-year immutable cache header (`Cache-Control:
public, max-age=31536000, immutable`) on every file.

## How the upload pipeline works in code

Endpoints accept the same body shape they used to (a `profileImage` /
`logo` / `fileUrl` string), but the value can be one of:

- `undefined` — no change (kept as-is)
- `null` or `''` — clear it (and delete the previous file from storage)
- a `data:image/...;base64,...` string — upload to storage, store the URL
- an existing stored URL (`https://...` or `/uploads/...`) — keep as-is (the
  client is just sending the unchanged value back)

The helper that handles all three cases is `uploadIfDataUrl` in
[src/lib/storage.ts](../src/lib/storage.ts). Endpoints call it once per
upload field and the abstraction takes care of validation, size limits,
MIME-type allowlists, and best-effort deletion of the previous file.
