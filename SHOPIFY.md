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

This creates the **`dist-ring-builder/`** folder containing everything the builder
needs (page, JS bundle, all ring parts, environments, Draco decoder).
Unneeded files (encrypted heads, main-viewer models) are already pruned.

## Step 2 — Host the folder (pick ONE, all free)

| Host | How |
|------|-----|
| **Netlify Drop** (easiest) | Go to https://app.netlify.com/drop and drag the `dist-ring-builder` folder onto the page. Done — you get a URL like `https://yourname.netlify.app` |
| Cloudflare Pages | Dashboard → Workers & Pages → Create → Upload assets → drag the folder |
| Vercel | `npx vercel dist-ring-builder` |
| Your own hosting | Upload the folder contents via FTP to any web server |

Open `https://YOUR-URL/ring-builder.html` in a browser and confirm the ring loads.

**Tip:** you upload this yourself from your machine — the source code (`src/`,
this repo) never goes anywhere, only the compiled bundle and the GLB models that
any visitor's browser downloads anyway.

## Step 3 — Embed in Shopify

1. Shopify Admin → **Online Store → Pages → Add page**
2. Title: e.g. *Design Your Ring*
3. In the content editor click the **`<>` (Show HTML)** button and paste:

```html
<iframe
  src="https://YOUR-URL/ring-builder.html"
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

- **"Add to cart" button** — the builder can send the chosen configuration
  (shape, carat, prong, band, shank, metal) to your Shopify cart via a cart
  permalink or `postMessage`, so customers can order the exact ring they built.
  Requires creating a product (+ variants or line-item properties) in Shopify first.
- **Price display** — show a live price in the builder based on the selection.
- **Branding** — colors, logo, fonts to match your theme.
- **Custom domain** — point `rings.yourdomain.com` at the Netlify/Cloudflare site.

## Updating later

Re-run `npm run build:builder` and re-upload the folder (Netlify: drag onto
the same site's *Deploys* page). The Shopify page never needs to change.
