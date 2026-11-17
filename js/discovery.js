/** discovery.js — Random Discovery: a randomly sorted batch from the API, revealed one at a time. */
import { searchArtworks } from "./api.js";
import { DISCOVERY_QUERY } from "./collections.js";
import { el, clear, icon, artImage, artHref, artistHref, creatorLabel, licenseBadge, favButton, extLink, errorState, setTitle, prefersReducedMotion } from "./ui.js";

let queue = []; // module-level so returning to the page keeps the batch
let fetching = null;

async function refill() {
  if (!fetching) {
    // Random sort is never cached: every batch is fresh.
    fetching = searchArtworks({ query: DISCOVERY_QUERY, limit: 12, random: true, thumbWidth: 960 })
      .then(({ items }) => { queue.push(...items); })
      .finally(() => { fetching = null; });
  }
  return fetching;
}

async function nextArtwork() {
  if (!queue.length) await refill();
  if (!queue.length) await refill(); // the batch might have been fully filtered by license
  const art = queue.shift();
  if (queue.length < 3) refill().catch(() => {}); // prefetch
  return art;
}

export function renderDiscovery(root, _params, ctx) {
  setTitle("Random discovery");
  const stage = el("div.discover__stage", { "aria-live": "polite" });
  const nextBtn = el("button.btn.btn--gold.btn--lg", { type: "button" }, icon("shuffle"), "Discover another");
  const seen = el("p.discover__count");
  let count = 0;
  let busy = false;

  clear(root).append(el("div.discover",
    el("header.page-head.page-head--center",
      el("p.eyebrow", { text: "Random Discovery" }),
      el("h1.page-title", { tabindex: "-1", text: "Let the archive choose" }),
      el("p.page-lede", { text: "Each turn draws a random artwork record from Wikimedia Commons. Press the button — or the space bar — to reveal another." })
    ),
    stage,
    el("div.discover__controls", nextBtn, seen)
  ));

  const show = async () => {
    if (busy) return;
    busy = true;
    nextBtn.disabled = true;
    const reduce = prefersReducedMotion();
    const old = stage.firstElementChild;
    if (old && !reduce) old.classList.add("is-leaving");
    else if (!old) stage.append(el("div.discover__card.discover__card--loading", el("div.skeleton.discover__skeleton")));
    try {
      const [art] = await Promise.all([nextArtwork(), new Promise((r) => setTimeout(r, old && !reduce ? 450 : 0))]);
      if (!ctx.isCurrent()) return;
      if (!art) throw new Error("No artwork could be drawn this time. Please try again.");
      const card = discoverCard(art);
      const img = card.querySelector("img");
      // Wait (briefly) for the image so the reveal animation shows the work, not a blank frame.
      await Promise.race([
        new Promise((r) => { if (img.complete) r(); else { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); } }),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
      if (!ctx.isCurrent()) return;
      clear(stage).append(card);
      requestAnimationFrame(() => card.classList.add("is-in"));
      count++;
      seen.textContent = `${count} work${count === 1 ? "" : "s"} discovered this visit`;
      setTitle(`${art.title} · Discovery`);
    } catch (err) {
      if (ctx.isCurrent()) clear(stage).append(errorState(err, show));
    } finally {
      busy = false;
      nextBtn.disabled = false;
    }
  };

  nextBtn.addEventListener("click", show);
  const onKey = (e) => {
    if (e.key === " " && !e.target.closest("input, textarea, select, button, a")) {
      e.preventDefault();
      show();
    }
  };
  document.addEventListener("keydown", onKey);
  show();
  return () => document.removeEventListener("keydown", onKey);
}

function discoverCard(art) {
  const frame = el("a.discover__frame", { href: artHref(art), "aria-label": `View details of ${art.title}` }, artImage(art, { cls: "discover__img", eager: true }));
  if (art.thumbW && art.thumbH) frame.style.aspectRatio = `${art.thumbW} / ${art.thumbH}`;
  const desc = art.description && art.description !== art.title ? art.description : "";
  return el("article.discover__card",
    frame,
    el("div.discover__info",
      el("p.eyebrow", {}, licenseBadge(art)),
      el("h2.discover__title", { text: art.title }),
      el("p.discover__artist", {},
        art.artist ? el("a", { href: artistHref(art.artist), text: art.artist }) : el("span", { text: creatorLabel(art) }),
        art.date ? el("span", { text: ` · ${art.date}` }) : null
      ),
      desc ? el("p.discover__desc", { text: desc.length > 260 ? desc.slice(0, 260).trimEnd() + "…" : desc }) : null,
      el("p.discover__license", {}, "License: ", art.licenseUrl ? extLink(art.licenseUrl, art.license) : art.license, " · ", extLink(art.pageUrl, "Commons page")),
      el("div.discover__actions",
        el("a.btn.btn--dark", { href: artHref(art), text: "View details" }),
        favButton(art)
      )
    )
  );
}
