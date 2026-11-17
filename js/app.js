/**
 * app.js — ART UNIVERSE entry point: hash router, navigation, global behaviours.
 * Hash routing keeps every view working on GitHub Pages without server rewrites.
 */
import { renderHome } from "./home.js";
import { renderExplore } from "./gallery.js";
import { renderDetails } from "./details.js";
import { renderArtists, renderArtist } from "./artists.js";
import { renderFavorites } from "./favorites.js";
import { renderDiscovery } from "./discovery.js";
import { getFavorites, onFavoritesChange } from "./storage.js";
import { el, clear, stateBlock, setTitle, prefersReducedMotion } from "./ui.js";

const routes = {
  "": renderHome,
  explore: renderExplore,
  art: renderDetails,
  artists: renderArtists,
  artist: renderArtist,
  favorites: renderFavorites,
  discover: renderDiscovery,
  about: renderAbout,
};

const NAV_SECTION = { art: "explore", artist: "artists" };

const view = document.getElementById("view");
let token = 0;
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  return { route: decodeURIComponent(path || "").replace(/\/$/, ""), params: new URLSearchParams(query) };
}

function router() {
  const { route, params } = parseHash();
  if (typeof cleanup === "function") {
    try { cleanup(); } catch { /* ignore */ }
  }
  cleanup = null;
  const my = ++token;
  const ctx = { isCurrent: () => my === token };
  const render = routes[route] || renderNotFound;

  closeMenu();
  updateNav(NAV_SECTION[route] || route);
  view.classList.remove("view-in");
  void view.offsetWidth; // restart entrance animation
  view.classList.add("view-in");
  window.scrollTo({ top: 0, behavior: "auto" });

  try {
    cleanup = render(view, params, ctx) || null;
  } catch (err) {
    console.error(err);
    clear(view).append(stateBlock({ kind: "error", title: "This page could not be displayed", message: "An unexpected error occurred." }));
  }

  // Move focus to the page heading for screen-reader and keyboard users (not on first load).
  if (router.hasRun) {
    requestAnimationFrame(() => {
      const h = view.querySelector("h1");
      if (h) {
        if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
      }
    });
  }
  router.hasRun = true;
}

function updateNav(section) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === section;
    a.classList.toggle("is-active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

/* ---------------- Mobile menu ---------------- */

const menuBtn = document.getElementById("menu-toggle");
const nav = document.getElementById("site-nav");

function closeMenu() {
  if (!nav.classList.contains("is-open")) return;
  nav.classList.remove("is-open");
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.setAttribute("aria-label", "Open menu");
  document.body.classList.remove("menu-open");
}

menuBtn.addEventListener("click", () => {
  const open = !nav.classList.contains("is-open");
  nav.classList.toggle("is-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.body.classList.toggle("menu-open", open);
  if (open) {
    const first = nav.querySelector("a");
    if (first) first.focus();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav.classList.contains("is-open")) {
    closeMenu();
    menuBtn.focus();
  }
  // "/" focuses the nearest search field.
  if (e.key === "/" && !e.target.closest("input, textarea, select, [contenteditable]")) {
    const input = view.querySelector('input[type="search"]');
    if (input) {
      e.preventDefault();
      input.focus();
    } else {
      e.preventDefault();
      location.hash = "#/explore";
    }
  }
});

window.matchMedia("(min-width: 900px)").addEventListener("change", (m) => { if (m.matches) closeMenu(); });

/* ---------------- Header behaviour ---------------- */

const header = document.querySelector(".site-header");
const toTop = document.getElementById("to-top");
let ticking = false;
window.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 12);
    toTop.classList.toggle("is-visible", y > 900);
    ticking = false;
  });
}, { passive: true });

toTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  document.getElementById("main").focus({ preventScroll: true });
});

/* ---------------- Favorites counter ---------------- */

const favCount = document.getElementById("fav-count");
function syncFavCount(list = getFavorites()) {
  favCount.textContent = list.length ? String(list.length) : "";
  favCount.hidden = !list.length;
}
onFavoritesChange(syncFavCount);
syncFavCount();

/* ---------------- Static views ---------------- */

function renderNotFound(root) {
  setTitle("Not found");
  clear(root).append(stateBlock({
    title: "This gallery does not exist",
    message: "The room you are looking for may have moved.",
    action: el("a.btn.btn--dark", { href: "#/", text: "Return to the entrance" }),
  }));
}

function renderAbout(root) {
  setTitle("About & licensing");
  const p = (text) => el("p", { text });
  const a = (href, text) => el("a", { href, target: "_blank", rel: "noopener noreferrer external", text });
  clear(root).append(el("article.prose",
    el("p.eyebrow", { text: "About the museum" }),
    el("h1.page-title", { tabindex: "-1", text: "About ART UNIVERSE" }),
    p("ART UNIVERSE is an independent, non-commercial digital museum. It has no server of its own: every artwork, title, date and attribution is requested live, in your browser, from the public Wikimedia Commons API."),
    el("h2", { text: "How works are selected" }),
    p("Searches are limited to Commons file pages that use the {{Artwork}} information template, which records structured details such as title, creator and date. A work is shown only when its license, as reported by Commons, is one of:"),
    el("ul", el("li", { text: "Public Domain (including the Public Domain Mark)" }), el("li", { text: "CC0" }), el("li", { text: "CC BY (any version)" }), el("li", { text: "CC BY-SA (any version)" })),
    p("Anything with an unknown, non-commercial, no-derivatives or otherwise incompatible license is excluded automatically. Missing information is shown as missing — it is never guessed or invented."),
    el("h2", { text: "Attribution" }),
    p("Every artwork page lists the title, creator, license (with a link to the license where Commons provides one) and a link to the original Commons file page, plus a ready-to-copy attribution line. Rights holders and Commons contributors retain all rights granted by their licenses."),
    el("h2", { text: "Your data" }),
    p("Favorites and a temporary cache of API responses (about 12 hours) are stored in your browser’s localStorage. Nothing is sent anywhere except the requests to Wikimedia Commons needed to show artworks."),
    el("h2", { text: "Sources" }),
    el("p", {}, "Data and images: ", a("https://commons.wikimedia.org/", "Wikimedia Commons"), ". API: ", a("https://www.mediawiki.org/wiki/API:Imageinfo", "MediaWiki Action API (imageinfo)"), ". ART UNIVERSE is not affiliated with or endorsed by the Wikimedia Foundation."),
    el("h2", { text: "Keyboard shortcuts" }),
    el("ul",
      el("li", { text: "/ — jump to search" }),
      el("li", { text: "Space — next work on the Random Discovery page" }),
      el("li", { text: "+ / − / 0 / arrow keys — zoom, reset and pan in the zoom view; Esc closes it" })
    )
  ));
}

/* ---------------- Boot ---------------- */

document.getElementById("year").textContent = String(new Date().getFullYear());
window.addEventListener("hashchange", router);
router();
