# Shaaz Mak Photography

A photography portfolio site with private client galleries, public portfolio
sections, and an admin panel for day-to-day management. Frontend is a Vite
+ React + TypeScript SPA, backend is Supabase (Postgres + Auth + Storage +
Edge Functions). No code is required for any normal day-to-day task.

---

## Architecture

```
[ Browser ]
    │
    ▼
[ Vercel — frontend (Vite SPA) ]
    │  reads/writes via supabase-js
    ▼
[ Supabase ]
    ├── Postgres   (albums, photos, clients, share links)
    ├── Auth       (admin + per-client logins, JWT, bcrypt-hashed passwords)
    ├── Storage    (originals + auto-generated WebP variants in `photos` bucket)
    └── Edge Fns   (process-upload, backfill-variants, create/update/delete-client,
                    download-album, validate-share-token, send-contact-email,
                    setup-admin)
            │
            ▼
[ Cloudflare CDN (optional) ]  cdn.shaazmakphotography.com → Supabase Storage
```

The image pipeline is the part that matters for client-perceived speed:

1. Admin uploads an original photo (any size).
2. Original lands in `photos/originals/<section>/<uuid>.<ext>` and is **never
   modified** — full-res downloads always come from this file.
3. The `process-upload` edge function decodes the image once and writes three
   WebP variants to `photos/derived/{thumb,preview,full-webp}/...`:
   - `thumb` ≤ 480 px (gallery thumbnails)
   - `preview` ≤ 1600 px (gallery viewing + lightbox)
   - `full-webp` ≤ 2560 px (lightbox on large screens)
4. The frontend renders `srcSet="<thumb> 480w, <preview> 1600w"` so browsers
   pick the smallest sufficient variant.
5. If `VITE_CDN_BASE` is set, every image URL the frontend reads from the
   database is rewritten to load from the CDN host instead.

---

## Tech stack

- **Frontend:** React 18, Vite 5, TypeScript, Tailwind, shadcn/ui,
  React Router 6, TanStack Query, react-photo-album, jszip
- **Backend:** Supabase (Postgres, Auth, Storage, Deno edge functions)
- **Image processing:** [imagescript](https://deno.land/x/imagescript) inside
  the Deno edge runtime — no native deps, no separate worker
- **Hosting:** Vercel (frontend) + Supabase managed (backend) + optional
  Cloudflare (CDN)

---

## Local development

Prerequisites: **Node 18+** and **npm**. (No Docker, no Postgres install —
the Supabase backend you connect to is the same one that's already deployed.)

```sh
git clone <your repo url>
cd shaazmakphotography-main
cp .env.example .env          # then fill in real values from Supabase dashboard
npm install
npm run dev                   # http://localhost:8080
```

The values you need for `.env` live in your Supabase project dashboard under
**Project Settings → API**:

- `VITE_SUPABASE_URL` — Project URL
- `VITE_SUPABASE_ANON_KEY` — `anon` public key (safe in the browser)
- `VITE_SUPABASE_PROJECT_ID` — the slug from the URL
- `VITE_CDN_BASE` — leave blank until you've finished the Cloudflare step below

---

## First-time backend setup

You only do this once, the very first time you connect a Supabase project.

1. Install the Supabase CLI: `npm install -g supabase` (or use `brew`).
2. Log in: `supabase login`.
3. Link this folder to your project: `supabase link --project-ref <your-project-id>`.
4. Apply the database schema:
   ```sh
   supabase db push
   ```
5. Deploy every edge function:
   ```sh
   supabase functions deploy process-upload backfill-variants update-client \
     create-client delete-client download-album send-contact-email \
     validate-share-token setup-admin
   ```
6. Create the storage bucket:
   - Supabase dashboard → **Storage** → **New bucket** → name `photos`,
     toggle **Public bucket: ON**.
   - Add a public read policy for the `photos` bucket if it isn't there
     already (the dashboard prompts you when you toggle public).
7. Create the first admin account by visiting `https://your-site/setup-admin`
   in the browser and filling in the form. After that, this route is no
   longer needed.
8. (Optional) Run the one-time backfill to generate WebP variants for any
   photos that existed before this pipeline. Open the admin dashboard and
   click **Reprocess images** until the counts hit 0.

---

## Deploying the frontend (Vercel)

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. Vercel auto-detects Vite. The defaults are correct.
4. Under **Environment Variables**, add the four values from `.env.example`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_ID`,
   and `VITE_CDN_BASE` once you have it).
5. Click **Deploy**.

From this point on, **every push to `main` automatically rebuilds and
redeploys the live site.** No CLI needed.

---

## Deploying backend changes

The frontend redeploys itself on every git push. The backend does not — these
are the only commands you need:

- **Database schema change** (you added a new SQL file under
  `supabase/migrations/`):
  ```sh
  supabase db push
  ```
- **Edge function change** (you edited a file under `supabase/functions/`):
  ```sh
  supabase functions deploy <function-name>
  ```

That's it. There is no other ongoing operational work.

---

## Cloudflare CDN setup (optional but recommended)

Putting Cloudflare in front of Supabase Storage cuts image load time
dramatically and is free.

1. Add your domain to Cloudflare (free plan is fine).
2. **DNS** → add a CNAME record:
   - Name: `cdn`
   - Target: `<your-project-id>.supabase.co`
   - Proxy status: **Proxied** (orange cloud)
3. **Rules → Cache Rules** → create a rule:
   - **When incoming requests match:** URI Path **starts with**
     `/storage/v1/object/public/photos/derived/`
   - **Then:** Cache eligibility = **Eligible for cache**, Edge TTL =
     **1 year** (the `derived/` files are uuid-named and immutable).
4. In Vercel, set `VITE_CDN_BASE=https://cdn.yourdomain.com` and redeploy.
5. Reload the live site — image URLs in DevTools should now resolve to
   `cdn.yourdomain.com` and return `cf-cache-status: HIT` on the second load.

---

## Day-to-day operations (no command line)

Everything below is done through the admin panel at `/admin`.

| Task | Where |
|---|---|
| Add a new client | **Clients** tab → **Add Client** |
| Reset a client's password | **Clients** tab → ✏️ **Edit** on the client row |
| Create a private gallery for a client | **Albums** tab → **New Album** |
| Upload photos to a gallery | **Albums** tab → **Manage Photos** on the album |
| Reorder photos in a gallery | Drag and drop on the **Manage Photos** page |
| Set the album cover photo | Hover any photo → ⭐ |
| Add to the public Portfolio page | **Portfolio** tab → **Add Photo** |
| Add to the Featured Work strip on the homepage | **Homepage** tab → **Add Photo** |
| Reorder portfolio / homepage photos | Drag and drop in the relevant tab |
| Reprocess legacy images for the new pipeline | **Dashboard** stats → **Reprocess images** |

Clients log in at `/login` with the username and password you give them and
land on `/my-album`, where they can browse and download their photos.

---

## Backups

Supabase automatically takes daily backups of your Postgres database (Pro
plan and above; the free plan keeps 7 days). To take a manual snapshot:

```sh
supabase db dump --file backup-$(date +%F).sql
```

Storage objects (the photos themselves) are NOT included in the database
dump. To back those up, use [`rclone`](https://rclone.org) against the
S3-compatible Supabase Storage endpoint, or simply keep your originals
on a local drive — that's the source of truth.

---

## Troubleshooting

- **Uploads fail with "Image processing failed":** Make sure
  `process-upload` is deployed (`supabase functions deploy process-upload`)
  and that the Supabase service role key is set on the project (it is by
  default — only an issue if you've rotated keys).
- **Images load slowly even after the pipeline change:** Check
  `VITE_CDN_BASE` is set in Vercel and the deployment has been rebuilt
  since. Without it, images come straight from Supabase.
- **`Reprocess images` keeps showing the same count:** look at the
  function logs in the Supabase dashboard → **Logs → Edge Functions →
  backfill-variants**. If a specific photo errors out, the count won't
  drop. Delete the offending row and re-upload it through the admin panel.
- **Hero images are blank:** they live in `public/hero/`. If you ever
  replace them, keep the file names (`hero-1.webp` … `hero-4.webp`).
