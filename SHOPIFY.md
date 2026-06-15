# Putting the Ring Builder on your Shopify store

The ring builder is a static web app (HTML + JS + ~100 MB of GLB models). Shopify
themes can't comfortably host hundreds of model files, so the standard approach —
the same one iJewel and other 3D configurators use — is:

> **Host the built app on free static hosting, embed it in a Shopify page with an iframe.**

No Shopify app, no monthly fees, ~15 minutes of work.

---

## Step 1 — Build it

```
npm run build:builder
```

This creates the **`dist-ring-builder/`** folder (~164 MB) containing everything
the builder needs (page, JS bundle, all ring parts, environments, Draco decoder).
The build auto-runs `prune-builder-dist.js`, which removes unneeded files
(encrypted heads, main-viewer models, sourcemaps) so the folder stays small —
you don't need to clean anything by hand.

## Step 2 — Host the folder on Cloudflare Pages (chosen host)

Cloudflare Pages = fastest global CDN + **unlimited bandwidth** on the free plan
(important because customers download several MB of 3D models per visit).

**Option A — Dashboard (no command line):**
1. Create a free account at https://dash.cloudflare.com and log in.
2. Left sidebar → **Workers & Pages** → **Create** → **Pages** tab → **Upload assets**.
3. Give the project a name (e.g. `ring-builder`) → **Create project**.
4. **Drag the `dist-ring-builder` folder** onto the upload area → **Deploy site**.
5. You get a URL like `https://ring-builder.pages.dev`.

**Option B — Command line (faster for re-deploys later):**
```
npx wrangler login          # one time — opens a browser to log into Cloudflare
npm run deploy              # builds, prunes, and uploads in one step
```
After `wrangler login` succeeds once, you only ever need `npm run deploy`.

Open `https://YOUR-PROJECT.pages.dev/` and confirm the ring loads. (The build
emits an `index.html`, so the bare root URL works — you don't need to add
`/ring-builder.html`.)

> Within Cloudflare limits: max 20,000 files (you have ~950) and 25 MB per file
> (your biggest is the 3.2 MB JS bundle). You're well under both.

_Other hosts that also work: Netlify (https://app.netlify.com/drop, drag the folder),
Vercel (`npx vercel dist-ring-builder`). Switching later is just a URL change in the iframe._

**Tip:** you upload this yourself from your machine — the source code (`src/`,
this repo) never goes anywhere, only the compiled bundle and the GLB models that
any visitor's browser downloads anyway.

## Step 3 — Embed in Shopify

1. Shopify Admin → **Online Store → Pages → Add page**
2. Title: e.g. *Design Your Ring*
3. In the content editor click the **`<>` (Show HTML)** button and paste:

```html
<iframe
  src="https://YOUR-PROJECT.pages.dev/"
  style="width:100%;height:85vh;border:0;border-radius:12px;overflow:hidden;"
  allow="fullscreen"
  loading="lazy"
  title="3D Ring Builder">
</iframe>
```

4. **Save**, then add the page to your menu: **Online Store → Navigation →
   Main menu → Add menu item** → link to the page.

That's it — the builder is live on your site.

---

## Optional next steps (ask Claude when you want them)

- **"Add to cart" button** — the builder already captures the full selection
  (shape, carat, prong, band, shank, metal, **ring size, engraving + font**).
  Call `window.__ringBuilder.getConfiguration()` to get it as an object; it can be
  sent to your Shopify cart via a cart permalink or `postMessage` as line-item
  properties, so customers order the exact ring they built (engraving included).
  Requires creating a product in Shopify first.
- **Price display** — show a live price in the builder based on the selection.
- **Engraving on the 3D band** — the engraving text is captured and previewed in
  the panel today. Rendering it physically onto the curved inner band in 3D is a
  separate, larger task (needs the band UV-mapped or a text-decal system).
- **Branding** — colors, logo, fonts to match your theme.
- **Custom domain** — point `rings.yourdomain.com` at the Cloudflare Pages site.

## Updating later

Whenever you change the builder:
1. `npm run build:builder` (rebuilds + auto-prunes `dist-ring-builder/`)
2. Re-deploy:
   - Dashboard: project → **Create deployment** → drag the folder again, OR
   - CLI: `npm run deploy` (uploads to the `ring-builder-6hm` Cloudflare project)

The `.pages.dev` URL stays the same, so the Shopify page never needs editing.
