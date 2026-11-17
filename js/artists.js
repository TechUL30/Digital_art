/**
 * artists.js — Artist Explorer. Artists are discovered from live artwork results;
 * no biographies are written. The only descriptive text shown is the short
 * description Commons itself attaches to the creator (from Wikidata), when present.
 */
import { searchArtworks } from "./api.js";
import { ARTIST_SEEDS } from "./collections.js";
import { el, clear, icon, artImage, artCard, artistHref, skeletonGrid, stateBlock, errorState, extLink, setTitle, debounce } from "./ui.js";

const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function isNamedArtist(name) {
  return name && name.length < 80 && !/^(unknown|anonymous|unidentified|not specified|attributed|various|workshop of|circle of|follower of|school of|after\b)/i.test(name);
}

/* ---------------- Index ---------------- */

export function renderArtists(root, _params, ctx) {
  setTitle("Artists");
  const filterInput = el("input.search__input#artist-filter", { type: "search", placeholder: "Filter artists or look one up…", autocomplete: "off" });
  const grid = el("div.artist-grid");
  const count = el("p.results__summary", { "aria-live": "polite" });
  let artists = [];

  const form = el("form.search", { role: "search", onsubmit: (e) => {
    e.preventDefault();
    const name = filterInput.value.trim();
    if (name) location.hash = artistHref(name);
  } },
    el("label.visually-hidden", { for: "artist-filter", text: "Filter artists" }),
    icon("search", "search__icon"),
    filterInput,
    el("button.btn.btn--gold.search__submit", { type: "submit", text: "Look up" })
  );

  clear(root).append(el("div.artists",
    el("header.page-head",
      el("p.eyebrow", { text: "Artist Explorer" }),
      el("h1.page-title", { tabindex: "-1", text: "The Artists" }),
      el("p.page-lede", { text: "Creators discovered in live collection results across several periods. Filter the list, or press “Look up” to search the archive for any artist by name." })
    ),
    el("div.toolbar", form),
    count,
    grid
  ));
  grid.append(skeletonGrid(8));

  const draw = () => {
    const f = fold(filterInput.value);
    const shown = f ? artists.filter((a) => fold(a.name).includes(f)) : artists;
    clear(grid);
    count.textContent = `${shown.length} artist${shown.length === 1 ? "" : "s"} discovered${f ? " matching your filter" : ""}`;
    if (!shown.length) {
      grid.append(stateBlock({ title: "No artist in this list matches", message: "Press “Look up” to search the whole archive for this name.", action: el("a.btn.btn--dark", { href: artistHref(filterInput.value.trim()), text: `Look up “${filterInput.value.trim()}”` }) }));
      return;
    }
    shown.forEach((a) => grid.append(artistTile(a)));
  };
  filterInput.addEventListener("input", debounce(draw, 200));

  const load = async () => {
    try {
      const results = await Promise.allSettled(ARTIST_SEEDS.map((q) => searchArtworks({ query: q, limit: 30, thumbWidth: 500 })));
      if (!ctx.isCurrent()) return;
      const ok = results.filter((r) => r.status === "fulfilled");
      if (!ok.length) throw results[0].reason;
      const map = new Map();
      for (const r of ok) {
        for (const art of r.value.items) {
          if (!isNamedArtist(art.artist)) continue;
          // Merge variants such as "Takahashi Bihō (b. 1873)" and "Takahashi Bihō".
          const display = art.artist.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim() || art.artist;
          const key = fold(display);
          const entry = map.get(key) || { name: display, count: 0, sample: art, note: "", link: null };
          entry.count++;
          if (!entry.note && art.artistNote) entry.note = art.artistNote;
          if (!entry.link && art.artistLink) entry.link = art.artistLink;
          map.set(key, entry);
        }
      }
      artists = [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      draw();
    } catch (err) {
      if (ctx.isCurrent()) clear(grid).append(errorState(err, load));
    }
  };
  load();
}

function artistTile(a) {
  const frame = el("div.artist-tile__frame", artImage(a.sample, { cls: "artist-tile__img" }));
  frame.querySelector("img").alt = "";
  return el("a.artist-tile", { href: artistHref(a.name) },
    frame,
    el("div.artist-tile__body",
      el("h2.artist-tile__name", { text: a.name }),
      a.note ? el("p.artist-tile__note", { text: a.note }) : null,
      el("p.artist-tile__count", { text: `${a.count} work${a.count === 1 ? "" : "s"} in these results` })
    )
  );
}

/* ---------------- Single artist ---------------- */

export function renderArtist(root, params, ctx) {
  const name = (params.get("name") || "").trim().slice(0, 100);
  if (!name) {
    location.hash = "#/artists";
    return;
  }
  setTitle(name);
  const safeName = name.replace(/["\\]/g, " ").trim();
  const noteEl = el("p.page-lede");
  const refEl = el("p.artist-ref");
  const grid = el("div.masonry");
  const status = el("div.results");
  const summary = el("p.results__summary", { "aria-live": "polite" });
  const more = el("button.btn.btn--ghost.load-more", { type: "button", hidden: true, text: "Load more works" });
  let offset = 0;
  let total = 0;
  let mentionsOnly = false;

  clear(root).append(el("div.artist-page",
    el("header.page-head",
      el("a.back-link", { href: "#/artists" }, icon("arrowLeft"), "All artists"),
      el("p.eyebrow", { text: "Artist" }),
      el("h1.page-title", { tabindex: "-1", text: name }),
      noteEl,
      refEl
    ),
    summary,
    status,
    grid,
    el("div.load-more-wrap", more)
  ));
  status.append(skeletonGrid(8));

  const load = async () => {
    more.disabled = true;
    more.textContent = "Loading…";
    try {
      const { items, nextOffset } = await searchArtworks({ query: `insource:"${safeName}"`, offset, limit: 30 });
      if (!ctx.isCurrent()) return;
      clear(status);
      const target = fold(name);
      let matches = items.filter((a) => fold(a.artist).includes(target));
      if (offset === 0 && !matches.length && items.length) {
        mentionsOnly = true;
      }
      if (mentionsOnly) matches = items;
      const first = matches[0];
      if (offset === 0 && first) {
        if (!mentionsOnly && first.artistNote) noteEl.textContent = first.artistNote + " — description from Wikimedia Commons/Wikidata.";
        if (!mentionsOnly && first.artistLink) refEl.append(extLink(first.artistLink, "Reference page for this creator"));
        if (mentionsOnly) noteEl.textContent = `No artwork in the first results lists “${name}” as its creator. Showing works whose Commons records mention this name.`;
      }
      matches.forEach((a) => grid.append(artCard(a)));
      total += matches.length;
      offset = nextOffset ?? offset;
      if (!total && nextOffset == null) {
        status.append(stateBlock({ title: "No works found", message: `The archive returned no openly licensed artworks for “${name}”. Check the spelling or try the full name.`, action: el("a.btn.btn--dark", { href: "#/artists", text: "Back to artists" }) }));
      }
      summary.textContent = total ? `${total} work${total === 1 ? "" : "s"} shown` : "";
      more.hidden = nextOffset == null;
    } catch (err) {
      if (!ctx.isCurrent()) return;
      clear(status).append(errorState(err, load));
    } finally {
      more.disabled = false;
      more.textContent = "Load more works";
    }
  };
  more.addEventListener("click", load);
  load();
}
