/** gallery.js — Artwork Explorer: live search, filters, sorting, pagination. */
import { searchArtworks, SORTS } from "./api.js";
import { MOVEMENTS, MEDIUMS } from "./collections.js";
import { el, clear, icon, artCard, skeletonGrid, stateBlock, errorState, debounce, hashFor, setTitle, prefersReducedMotion } from "./ui.js";

const PAGE_SIZE = 24;
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const MAX_OFFSET = 9900; // CirrusSearch hard limit is 10,000 results

const DEFAULTS = { q: "", mode: "all", movement: "", medium: "", license: "all", orient: "all", sort: "relevance", page: "1", title: "" };

/** Strip quotes/control chars so user text can be safely wrapped in a search keyword. */
function phrase(text) {
  return text.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildQuery(state) {
  const parts = [];
  const q = state.q.trim();
  if (q) {
    if (state.mode === "title") parts.push(`intitle:"${phrase(q)}"`);
    else if (state.mode === "creator") parts.push(`insource:"${phrase(q)}"`);
    else parts.push(q);
  }
  if (state.movement) parts.push(state.movement);
  if (state.medium) parts.push(state.medium);
  if (!parts.length) parts.push("painting");
  return parts.join(" ");
}

function orientationOf(art) {
  const w = art.width || art.thumbW, h = art.height || art.thumbH;
  if (!w || !h) return "unknown";
  const r = w / h;
  if (r > 1.1) return "landscape";
  if (r < 0.9) return "portrait";
  return "square";
}

function applyClientFilters(items, state) {
  let out = items;
  if (state.license === "pd") out = out.filter((a) => a.licenseKind === "pd" || a.licenseKind === "cc0");
  else if (state.license === "cc") out = out.filter((a) => a.licenseKind === "by" || a.licenseKind === "by-sa");
  if (state.orient !== "all") out = out.filter((a) => orientationOf(a) === state.orient);
  const client = SORTS[state.sort] && SORTS[state.sort].client;
  if (client) {
    const dir = client === "yearAsc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      if (a.year == null && b.year == null) return 0;
      if (a.year == null) return 1;
      if (b.year == null) return -1;
      return (a.year - b.year) * dir;
    });
  }
  return out;
}

function select(id, label, options, value, onChange) {
  const s = el("select.field__select", { id, name: id });
  options.forEach(([v, text]) => s.append(el("option", { value: v, text, selected: v === value })));
  s.addEventListener("change", () => onChange(s.value));
  return el("div.field", el("label.field__label", { for: id, text: label }), s);
}

export function renderExplore(root, params, ctx) {
  const state = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (params.has(k)) state[k] = params.get(k) || DEFAULTS[k];
  if (!["all", "title", "creator"].includes(state.mode)) state.mode = "all";
  if (!SORTS[state.sort]) state.sort = "relevance";
  state.page = String(Math.max(1, Math.min(parseInt(state.page, 10) || 1, MAX_OFFSET / PAGE_SIZE)));

  const heading = state.title || "The Collection";
  setTitle(state.title || "Explore");

  let requestId = 0;

  const syncUrl = () => {
    const h = hashFor("explore", Object.fromEntries(Object.entries(state).filter(([k, v]) => v !== DEFAULTS[k])));
    history.replaceState(null, "", h);
  };

  const update = (patch, { resetPage = true } = {}) => {
    Object.assign(state, patch);
    if (resetPage) state.page = "1";
    syncUrl();
    load();
  };

  /* ---------- Search bar ---------- */
  const input = el("input.search__input#explore-q", { type: "search", value: state.q, placeholder: "Search titles, creators, subjects…", autocomplete: "off", "aria-describedby": "explore-hint" });
  const debounced = debounce(() => {
    if (input.value.trim() !== state.q) {
      state.title = "";
      update({ q: input.value.trim() });
    }
  }, 450);
  input.addEventListener("input", debounced);

  const modeGroup = el("div.segmented", { role: "radiogroup", "aria-label": "Search in" });
  [["all", "Everything"], ["title", "Title"], ["creator", "Creator"]].forEach(([v, text]) => {
    const b = el("button.segmented__btn", { type: "button", role: "radio", "aria-checked": String(state.mode === v), text });
    b.addEventListener("click", () => {
      modeGroup.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", "false"));
      b.setAttribute("aria-checked", "true");
      update({ mode: v });
    });
    modeGroup.append(b);
  });

  const form = el("form.search", { role: "search", onsubmit: (e) => { e.preventDefault(); debounced.cancel(); state.title = ""; update({ q: input.value.trim() }); } },
    el("label.visually-hidden", { for: "explore-q", text: "Search the collection" }),
    icon("search", "search__icon"),
    input,
    el("button.btn.btn--gold.search__submit", { type: "submit", text: "Search" })
  );

  /* ---------- Filters ---------- */
  const filtersPanel = el("div.filters#filters",
    select("f-movement", "Period", MOVEMENTS, state.movement, (v) => update({ movement: v })),
    select("f-medium", "Medium", MEDIUMS, state.medium, (v) => update({ medium: v })),
    select("f-license", "License", [["all", "All open licenses"], ["pd", "Public domain & CC0"], ["cc", "CC BY / CC BY-SA"]], state.license, (v) => update({ license: v }, { resetPage: false })),
    select("f-orient", "Orientation", [["all", "Any shape"], ["portrait", "Portrait"], ["landscape", "Landscape"], ["square", "Square"]], state.orient, (v) => update({ orient: v }, { resetPage: false })),
    select("f-sort", "Sort by", Object.entries(SORTS).map(([k, s]) => [k, s.label]), state.sort, (v) => update({ sort: v }, { resetPage: !SORTS[v].client })),
    el("button.btn.btn--text.filters__reset", { type: "button", onclick: () => {
      Object.assign(state, DEFAULTS);
      input.value = "";
      renderExplore(root, new URLSearchParams(), ctx);
      syncUrl();
    } }, icon("reset"), "Reset")
  );
  const filterToggle = el("button.btn.btn--ghost.filters__toggle", { type: "button", "aria-expanded": "false", "aria-controls": "filters" }, "Filters");
  filterToggle.addEventListener("click", () => {
    const open = filtersPanel.classList.toggle("is-open");
    filterToggle.setAttribute("aria-expanded", String(open));
  });

  const summary = el("p.results__summary", { "aria-live": "polite" });
  const results = el("div.results");
  const pager = el("nav.pager", { "aria-label": "Pagination" });

  clear(root).append(el("div.explore",
    el("header.page-head",
      el("p.eyebrow", { text: "Artwork Explorer" }),
      el("h1.page-title", { tabindex: "-1", text: heading }),
      el("p.page-lede#explore-hint", { text: "Live results from Wikimedia Commons artwork records. Only works under Public Domain, CC0, CC BY or CC BY-SA are shown." })
    ),
    el("div.toolbar", form, el("div.toolbar__row", modeGroup, filterToggle)),
    filtersPanel,
    summary,
    results,
    pager
  ));

  /* ---------- Loading ---------- */
  async function load() {
    const id = ++requestId;
    const page = parseInt(state.page, 10);
    const offset = (page - 1) * PAGE_SIZE;
    clear(pager);
    summary.textContent = "Searching the archive…";
    clear(results).append(skeletonGrid(12));
    results.setAttribute("aria-busy", "true");
    try {
      const { items, nextOffset, rawCount } = await searchArtworks({ query: buildQuery(state), offset, limit: PAGE_SIZE, sort: state.sort });
      if (id !== requestId || !ctx.isCurrent()) return;
      let pool = items;
      let creatorNote = "";
      if (state.mode === "creator" && state.q.trim()) {
        // insource: also matches works that merely mention the name — keep the creator's own works.
        const target = fold(state.q);
        const own = items.filter((a) => fold(a.artist).includes(target));
        if (own.length) pool = own;
        else if (items.length) creatorNote = ` · no work on this page lists “${state.q.trim()}” as creator; showing works that mention the name`;
      }
      const shown = applyClientFilters(pool, state);
      results.removeAttribute("aria-busy");
      clear(results);
      const hasNext = nextOffset != null && nextOffset < MAX_OFFSET;
      if (!shown.length) {
        summary.textContent = "";
        const filtered = rawCount > 0;
        results.append(stateBlock({
          title: filtered ? "Nothing on this page matches" : "No artworks found",
          message: filtered
            ? "Some results were hidden by your filters or because their license could not be verified. Try another page or loosen the filters."
            : "Try a different spelling, a broader keyword, or another period.",
          action: el("a.btn.btn--ghost", { href: "#/explore", onclick: (e) => { e.preventDefault(); filtersPanel.querySelector(".filters__reset").click(); } }, "Clear search & filters"),
        }));
      } else {
        const hidden = rawCount - shown.length;
        summary.textContent = `Page ${page} · ${shown.length} work${shown.length === 1 ? "" : "s"}${hidden > 0 ? ` (${hidden} hidden by filters, creator match or unverified licenses)` : ""}${creatorNote}`;
        const grid = el("div.masonry");
        shown.forEach((art, i) => {
          const card = artCard(art);
          card.style.setProperty("--i", String(i % 12));
          grid.append(card);
        });
        results.append(grid);
      }
      renderPager(page, hasNext);
    } catch (err) {
      if (id !== requestId || !ctx.isCurrent()) return;
      results.removeAttribute("aria-busy");
      summary.textContent = "";
      clear(results).append(errorState(err, load));
    }
  }

  function goPage(p) {
    state.page = String(p);
    syncUrl();
    load();
    const top = root.querySelector(".toolbar");
    if (top) top.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  function renderPager(page, hasNext) {
    clear(pager);
    if (page === 1 && !hasNext) return;
    const btn = (label, p, { current = false, aria = null, disabled = false } = {}) => {
      const b = el("button.pager__btn", { type: "button", "aria-label": aria, "aria-current": current ? "page" : null, disabled, text: label });
      if (!disabled && !current) b.addEventListener("click", () => goPage(p));
      return b;
    };
    pager.append(btn("← Previous", page - 1, { disabled: page <= 1, aria: "Previous page" }));
    const list = el("div.pager__pages");
    const start = Math.max(1, page - 2);
    const end = hasNext ? page + 1 : page;
    if (start > 1) list.append(btn("1", 1, { aria: "Page 1" }), el("span.pager__gap", { text: "…" }));
    for (let p = start; p <= end; p++) list.append(btn(String(p), p, { current: p === page, aria: `Page ${p}` }));
    pager.append(list, btn("Next →", page + 1, { disabled: !hasNext, aria: "Next page" }));
  }

  load();
  return () => debounced.cancel();
}
