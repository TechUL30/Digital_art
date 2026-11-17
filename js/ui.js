/**
 * ui.js — small DOM toolkit, shared components (cards, skeletons, states, toasts, icons).
 * All API-derived text is set through textContent / attributes, never innerHTML.
 */
import { isFavorite, toggleFavorite } from "./storage.js";
import { safeUrl, IMAGE_HOSTS, LICENSE_KINDS, thumbFromOriginal } from "./metadata.js";

/** Create an element: el("a.card", { href, onclick, attrs }, child, "text", …) */
export function el(tag, props = {}, ...children) {
  // Allow el("div", childNode, …) / el("p", "text") — props is optional.
  if (props instanceof Node || typeof props === "string" || typeof props === "number" || Array.isArray(props)) {
    children.unshift(props);
    props = {};
  }
  const name = (tag.match(/^[a-z][a-z0-9]*/i) || ["div"])[0];
  const id = tag.match(/#([\w-]+)/);
  const classes = [...tag.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const node = document.createElement(name);
  if (id) node.id = id[1];
  if (classes.length) node.className = classes.join(" ");
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className += (node.className ? " " : "") + v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Safe external link (validated URL, noopener). Returns a span if URL is invalid. */
export function extLink(href, text, cls = "") {
  const url = safeUrl(href);
  if (!url) return el("span", { class: cls, text });
  return el("a", { href: url, target: "_blank", rel: "noopener noreferrer external", class: cls }, text, icon("external", "ext-icon"));
}

/* ---------------- Icons (trusted static SVG paths) ---------------- */

const ICONS = {
  heart: "M12 20.5s-7.5-4.6-9.6-9.2C1 8.1 3 4.5 6.6 4.5c2.1 0 3.5 1.2 4.4 2.6.9-1.4 2.3-2.6 4.4-2.6 3.6 0 5.6 3.6 4.2 6.8-2.1 4.6-9.6 9.2-9.6 9.2Z",
  search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm10 3-4.6-4.6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  close: "M6 6l12 12M18 6 6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  zoomIn: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm10 3-4.6-4.6M10.5 7.5v6M7.5 10.5h6",
  zoomOut: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm10 3-4.6-4.6M7.5 10.5h6",
  shuffle: "M4 7h3.5c2 0 3.2 1 4.3 2.6l1.4 2.2c1.1 1.6 2.3 2.7 4.3 2.7H20M17 12l3 2.5-3 2.5M4 17h3.5c1.3 0 2.2-.4 3-1.1M13.5 8.1c.8-.7 1.7-1.1 3-1.1H20M17 4.5 20 7l-3 2.5",
  arrowLeft: "M15 5l-7 7 7 7",
  arrowRight: "M9 5l7 7-7 7",
  copy: "M8 8h11v12H8zM5 16V4h11",
  share: "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  reset: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4.5h4.5",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
};

const SVG_NS = "http://www.w3.org/2000/svg";

export function icon(name, cls = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `icon ${cls}`.trim());
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name] || "");
  svg.append(path);
  return svg;
}

/* ---------------- Toasts ---------------- */

export function toast(message, type = "info", timeout = 3200) {
  const region = document.getElementById("toasts");
  if (!region) return;
  const t = el("div.toast", { class: `toast--${type}`, role: type === "error" ? "alert" : "status" }, el("span", { text: message }));
  region.append(t);
  requestAnimationFrame(() => t.classList.add("is-in"));
  setTimeout(() => {
    t.classList.remove("is-in");
    t.addEventListener("transitionend", () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 600);
  }, timeout);
}

/* ---------------- Formatting ---------------- */

export function hashFor(route, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null)).toString();
  return `#/${route}${qs ? "?" + qs : ""}`;
}

export function artHref(art) {
  return hashFor("art", { f: art.name });
}

export function artistHref(name) {
  return hashFor("artist", { name });
}

export function creatorLabel(art) {
  return art.artist || "Creator not recorded";
}

export function licenseBadge(art) {
  return el("span.badge", { class: `badge--${art.licenseKind}`, title: art.license, text: LICENSE_KINDS[art.licenseKind] || art.license });
}

/* ---------------- Image ---------------- */

export function artImage(art, { cls = "", sizes = "", eager = false, src = null } = {}) {
  const url = safeUrl(src || art.thumb, IMAGE_HOSTS);
  const img = el("img", {
    class: cls,
    alt: art.artist ? `${art.title} — ${art.artist}` : art.title,
    loading: eager ? "eager" : "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    width: art.thumbW || null,
    height: art.thumbH || null,
    sizes: sizes || null,
  });
  img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
  let triedFallback = false;
  img.addEventListener("error", function onError() {
    // An unscaled original may be rate-limited or too large: retry with a standard thumbnail.
    if (!triedFallback) {
      triedFallback = true;
      const fb = thumbFromOriginal(art.full, art.width, 960);
      if (fb && fb !== img.src) {
        img.src = fb;
        return;
      }
    }
    img.removeEventListener("error", onError);
    img.classList.add("is-broken");
    img.alt = `Image unavailable: ${art.title}`;
    if (img.parentElement) img.parentElement.classList.add("img-broken");
  });
  if (url) img.src = url;
  return img;
}

/* ---------------- Favorite button ---------------- */

export function favButton(art, { compact = false } = {}) {
  const btn = el("button.fav-btn", { type: "button", class: compact ? "fav-btn--compact" : "" });
  const label = el("span.fav-label");
  const sync = () => {
    const on = isFavorite(art.name);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    const text = on ? "Saved to favorites" : "Save to favorites";
    btn.setAttribute("aria-label", `${on ? "Remove" : "Save"} “${art.title}” ${on ? "from" : "to"} favorites`);
    btn.title = text;
    label.textContent = on ? "Saved" : "Save";
  };
  btn.append(icon("heart"), compact ? "" : label);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { added, persisted } = toggleFavorite(art);
    sync();
    btn.classList.add("pulse");
    setTimeout(() => btn.classList.remove("pulse"), 450);
    if (!persisted) toast("Could not save — browser storage is unavailable.", "error");
    else toast(added ? "Added to your collection" : "Removed from your collection", added ? "success" : "info");
  });
  btn._sync = sync;
  sync();
  return btn;
}

/* ---------------- Card ---------------- */

export function artCard(art, { onOpen = null, showFav = true } = {}) {
  const card = el("article.card");
  const link = el("a.card__link", { href: artHref(art), "aria-label": `${art.title}, ${creatorLabel(art)}${art.date ? ", " + art.date : ""}` });
  const frame = el("div.card__frame");
  frame.append(artImage(art, { cls: "card__img", sizes: "(max-width: 600px) 50vw, 25vw" }));
  if (art.thumbW && art.thumbH) frame.style.aspectRatio = `${art.thumbW} / ${art.thumbH}`;
  const meta = el("div.card__meta",
    el("h3.card__title", { text: art.title }),
    el("p.card__artist", { text: creatorLabel(art) }),
    el("p.card__foot", art.date ? el("span.card__date", { text: art.date }) : null, licenseBadge(art))
  );
  link.append(frame, meta);
  if (onOpen) link.addEventListener("click", onOpen);
  card.append(link);
  if (showFav) card.append(favButton(art, { compact: true }));
  return card;
}

/* ---------------- Skeletons & states ---------------- */

const SKELETON_RATIOS = [1.25, 0.8, 1.4, 1, 0.75, 1.3, 1.1, 0.9];

export function skeletonGrid(n = 12) {
  const grid = el("div.masonry", { "aria-hidden": "true" });
  for (let i = 0; i < n; i++) {
    const ratio = SKELETON_RATIOS[i % SKELETON_RATIOS.length];
    const frame = el("div.skeleton.skeleton--frame");
    frame.style.aspectRatio = `1 / ${ratio}`;
    grid.append(el("div.card.card--skeleton", frame, el("div.skeleton.skeleton--line"), el("div.skeleton.skeleton--line.skeleton--short")));
  }
  return grid;
}

export function stateBlock({ title, message, action = null, kind = "empty" }) {
  return el("div.state", { class: `state--${kind}`, role: kind === "error" ? "alert" : null },
    el("div.state__ornament", { "aria-hidden": "true", text: kind === "error" ? "!" : "✦" }),
    el("h2.state__title", { text: title }),
    message ? el("p.state__msg", { text: message }) : null,
    action
  );
}

export function errorState(err, retry) {
  const msg = err && err.message ? err.message : "Something went wrong while contacting Wikimedia Commons.";
  return stateBlock({
    kind: "error",
    title: "The archive did not respond",
    message: msg,
    action: retry ? el("button.btn.btn--ghost", { type: "button", onclick: retry }, icon("reset"), "Try again") : null,
  });
}

/* ---------------- Misc ---------------- */

export function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function debounce(fn, ms = 350) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = el("textarea", { readonly: true, "aria-hidden": "true" });
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Lazy-run `fn` when `node` scrolls near the viewport. */
export function whenVisible(node, fn, rootMargin = "200px") {
  if (!("IntersectionObserver" in window)) { fn(); return () => {}; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      fn();
    }
  }, { rootMargin });
  io.observe(node);
  return () => io.disconnect();
}

export function setTitle(text) {
  document.title = text ? `${text} · ART UNIVERSE` : "ART UNIVERSE — The World's Digital Art Museum";
}
