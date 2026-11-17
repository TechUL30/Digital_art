# ART UNIVERSE — The World's Digital Art Museum

A premium, fully static digital art museum built with **HTML5, CSS3 and vanilla JavaScript (ES modules)**.
All artworks are loaded live, in the browser, from the public
[Wikimedia Commons Action API](https://commons.wikimedia.org/w/api.php) — no backend, no build step, no API key.

## Features

- **Homepage**: editorial hero with a featured artwork, a masterpieces rail, Artwork of the Day (deterministic per date), featured collections and period/subject categories.
- **Artwork Explorer**: live search (everything / title / creator), period and medium filters, license and orientation filters, sorting, pagination, loading skeletons and empty/error states.
- **Artwork details**: large image, title, creator, date, description, credit, size, license with link, Commons source page, copyable attribution, Commons categories, related works and a zoom view (wheel, buttons, keyboard, drag, pinch).
- **Artist Explorer**: artists discovered from live results; per-artist pages list their works. No biographies are written. The only description shown is the short one Commons/Wikidata attaches.
- **Favorites**: saved in `localStorage`, synced across tabs, sortable and removable.
- **Random Discovery**: random artwork records (API `gsrsort=random`) with an animated reveal.
- Responsive from phone to desktop, keyboard accessible, `prefers-reduced-motion` aware, toast notifications.

## Licensing rules

Searches are limited to file pages using the `{{Artwork}}` template. A work is displayed **only** if its
license, as reported by Commons `extmetadata`, is Public Domain (incl. PD Mark), CC0, CC BY or CC BY-SA.
Unknown, NC, ND, GFDL-only and other licenses are excluded. Missing data is shown as missing, never invented.

## API usage

- `origin=*` on every request (anonymous CORS)
- `localStorage` cache (~12 h), in-flight request de-duplication, max 3 concurrent requests
- Debounced search input, pagination, lazy-loaded images and collection covers
- 429/503 handling with `Retry-After` support and exponential backoff with jitter

## Security

API metadata HTML is parsed with `DOMParser` into an inert document and only text is extracted.
All rendering uses `textContent`/attributes. Image, license and link URLs are validated (https only,
host allow-lists). External links use `rel="noopener noreferrer"`. A Content-Security-Policy restricts
scripts to this site and connections to `commons.wikimedia.org`.

## Structure

```
index.html
css/style.css
js/app.js         router, navigation, about page
js/api.js         Commons client: cache, dedupe, limiter, retries
js/metadata.js    metadata parsing, license verification, URL validation
js/storage.js     localStorage cache + favorites
js/ui.js          DOM helpers, cards, toasts, icons
js/home.js        homepage
js/gallery.js     artwork explorer
js/details.js     artwork page + zoom lightbox
js/artists.js     artist explorer
js/favorites.js   favorites
js/discovery.js   random discovery
js/collections.js curated queries
assets/icons/     favicon
```

## Run locally

Any static server works (ES modules need http, not `file://`):

```bash
python3 -m http.server 8000
```

## Deploy

GitHub Pages → *Deploy from a branch* → `main` / root. Uses hash routing (`#/explore`), so no server rewrites are needed.

Artwork data and images: Wikimedia Commons contributors, under the license shown for each file.
Not affiliated with the Wikimedia Foundation.
