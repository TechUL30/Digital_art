/** details.js — single artwork page with attribution, related works and a zoomable lightbox. */
import { getArtwork, getZoomUrl, searchArtworks } from "./api.js";
import { attributionText, safeUrl, IMAGE_HOSTS } from "./metadata.js";
import {
  el, clear, icon, artImage, artCard, artistHref, creatorLabel, licenseBadge, favButton, extLink,
  stateBlock, errorState, toast, copyText, hashFor, setTitle, prefersReducedMotion,
} from "./ui.js";

export function renderDetails(root, params, ctx) {
  const file = params.get("f") || "";
  if (!/^File:./.test(file) || file.length > 300) {
    clear(root).append(stateBlock({ title: "Artwork not found", message: "This link does not point to a Wikimedia Commons file.", action: el("a.btn.btn--dark", { href: "#/explore", text: "Browse the collection" }) }));
    return;
  }

  clear(root).append(el("div.detail.detail--loading", { "aria-busy": "true" },
    el("div.detail__stage", el("div.skeleton.detail__skeleton")),
    el("div.detail__info", el("div.skeleton.skeleton--line"), el("div.skeleton.skeleton--title"), el("div.skeleton.skeleton--line.skeleton--short"))
  ));

  const load = async () => {
    try {
      const { art, reason } = await getArtwork(file);
      if (!ctx.isCurrent()) return;
      if (!art) {
        clear(root).append(stateBlock({
          title: reason === "license" ? "This work cannot be displayed" : "Artwork not found",
          message: reason === "license"
            ? "Its license could not be verified as Public Domain, CC0, CC BY or CC BY-SA, so ART UNIVERSE does not display it."
            : "The file may have been renamed or removed from Wikimedia Commons.",
          action: el("a.btn.btn--dark", { href: "#/explore", text: "Browse the collection" }),
        }));
        return;
      }
      draw(root, art, ctx);
    } catch (err) {
      if (ctx.isCurrent()) clear(root).append(errorState(err, load));
    }
  };
  load();
}

function metaRow(label, value) {
  if (!value) return null;
  return el("div.meta-row", el("dt", { text: label }), el("dd", {}, value));
}

function draw(root, art, ctx) {
  setTitle(art.title);

  const img = artImage(art, { cls: "detail__img", eager: true });
  img.setAttribute("fetchpriority", "high");
  const zoomBtn = el("button.detail__zoom", { type: "button", "aria-label": `Zoom into ${art.title}` }, img, el("span.detail__zoom-hint", {}, icon("expand"), "Click to zoom"));
  if (art.thumbW && art.thumbH) zoomBtn.style.aspectRatio = `${art.thumbW} / ${art.thumbH}`;
  zoomBtn.addEventListener("click", () => openLightbox(art, zoomBtn));

  const attribution = attributionText(art);
  const desc = art.description && art.description !== art.title ? art.description : "";
  const descP = desc ? el("p.detail__desc", { text: desc }) : null;
  let descToggle = null;
  if (desc && desc.length > 600) {
    descP.classList.add("is-clamped");
    descToggle = el("button.btn.btn--text", { type: "button", "aria-expanded": "false", text: "Read more" });
    descToggle.addEventListener("click", () => {
      const open = descP.classList.toggle("is-clamped") === false;
      descToggle.setAttribute("aria-expanded", String(open));
      descToggle.textContent = open ? "Show less" : "Read more";
    });
  }

  const licenseValue = art.licenseUrl ? extLink(art.licenseUrl, art.license) : el("span", {}, art.license, " — ", extLink(art.pageUrl + "#Licensing", "see licensing on Commons"));

  const info = el("div.detail__info",
    el("a.back-link", { href: "#/explore", onclick: (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, icon("arrowLeft"), "Back"),
    el("p.eyebrow", {}, licenseBadge(art)),
    el("h1.detail__title", { tabindex: "-1", text: art.title }),
    art.titleFromFile ? el("p.detail__note", { text: "Title taken from the Commons file name (no title recorded in the metadata)." }) : null,
    el("p.detail__artist", {},
      art.artist ? el("a", { href: artistHref(art.artist), text: art.artist }) : el("span", { text: creatorLabel(art) }),
      art.date ? el("span.detail__date", { text: ` · ${art.date}` }) : null
    ),
    art.artistNote ? el("p.detail__artist-note", { text: art.artistNote }) : null,
    el("div.detail__actions",
      favButton(art),
      el("button.btn.btn--ghost", { type: "button", onclick: async () => {
        const url = location.href;
        if (navigator.share) {
          try { await navigator.share({ title: art.title, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
        }
        toast((await copyText(url)) ? "Link copied to clipboard" : "Could not copy the link", "success");
      } }, icon("share"), "Share"),
      el("button.btn.btn--ghost", { type: "button", onclick: () => openLightbox(art, zoomBtn) }, icon("zoomIn"), "Zoom")
    ),
    descP, descToggle,
    el("dl.meta",
      metaRow("Creator", art.artist ? el("span", {}, art.artist, art.artistLink ? el("span", {}, " · ", extLink(art.artistLink, "reference")) : null) : el("span.muted", { text: "Not recorded in the metadata" })),
      metaRow("Date", art.date),
      metaRow("Credit / source", art.credit),
      metaRow("Original size", art.width && art.height ? `${art.width.toLocaleString()} × ${art.height.toLocaleString()} px` : ""),
      metaRow("License", licenseValue),
      metaRow("Usage terms", art.usageTerms && art.usageTerms !== art.license ? art.usageTerms : ""),
      metaRow("Source page", extLink(art.pageUrl, "Wikimedia Commons file page")),
    ),
    el("section.attribution", { "aria-labelledby": "attr-title" },
      el("h2.attribution__title#attr-title", { text: "Attribution" }),
      el("p.attribution__text", { text: attribution }),
      el("div.attribution__actions",
        el("button.btn.btn--text", { type: "button", onclick: async () => toast((await copyText(attribution)) ? "Attribution copied" : "Could not copy", "success") }, icon("copy"), "Copy attribution"),
        art.full ? extLink(art.full, "Original file", "btn btn--text") : null
      ),
      art.attributionRequired ? el("p.attribution__note", { text: "The license requires attribution when you reuse this work." }) : null
    ),
    art.categories.length ? el("div.detail__tags",
      el("h2.detail__tags-title", { text: "Commons categories" }),
      el("ul.chips.chips--small", ...art.categories.map((c) => el("li", el("a.chip", { href: hashFor("explore", { q: `incategory:"${c.replace(/"/g, "")}"`, title: c }), text: c }))))
    ) : null
  );

  const related = el("section.section.related", { "aria-labelledby": "related-title" });
  clear(root).append(el("div.detail",
    el("div.detail__stage", zoomBtn),
    info
  ), related);

  const h1 = root.querySelector(".detail__title");
  if (h1) h1.focus({ preventScroll: true });

  if (art.artist && !/^unknown|anonymous/i.test(art.artist)) loadRelated(related, art, ctx);
}

async function loadRelated(section, art, ctx) {
  const name = art.artist.replace(/["\\]/g, " ").slice(0, 80).trim();
  try {
    const { items } = await searchArtworks({ query: `insource:"${name}"`, limit: 12 });
    if (!ctx.isCurrent()) return;
    const others = items.filter((a) => a.name !== art.name).slice(0, 8);
    if (!others.length) return;
    const grid = el("div.masonry");
    others.forEach((a) => grid.append(artCard(a)));
    section.append(
      el("header.section__head",
        el("div", el("p.eyebrow", { text: "From the same hand" }), el("h2.section__title#related-title", { text: `More by ${art.artist}` })),
        el("a.link-arrow", { href: artistHref(art.artist), text: "Artist page" })
      ),
      grid
    );
  } catch { /* related works are optional */ }
}

/* ---------------- Lightbox ---------------- */

export function openLightbox(art, returnFocus) {
  const reduce = prefersReducedMotion();
  let scale = 1, x = 0, y = 0, dragging = null;
  const pointers = new Map();
  let pinchStart = null;

  const img = artImage(art, { cls: "lightbox__img", eager: true });
  img.draggable = false;
  const stage = el("div.lightbox__stage", img);
  const level = el("span.lightbox__level", { "aria-live": "polite", text: "100%" });

  const apply = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    level.textContent = `${Math.round(scale * 100)}%`;
    stage.classList.toggle("is-zoomed", scale > 1);
  };
  const setScale = (s) => {
    scale = Math.min(Math.max(s, 1), 6);
    if (scale === 1) { x = 0; y = 0; }
    apply();
  };

  const close = () => {
    document.removeEventListener("keydown", onKey);
    box.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    setTimeout(() => box.remove(), reduce ? 0 : 250);
    if (returnFocus) returnFocus.focus();
  };

  const closeBtn = el("button.icon-btn.lightbox__close", { type: "button", "aria-label": "Close zoom view", onclick: close }, icon("close"));
  const box = el("div.lightbox", { role: "dialog", "aria-modal": "true", "aria-label": `Zoom view: ${art.title}` },
    el("div.lightbox__bar",
      el("p.lightbox__caption", {}, el("strong", { text: art.title }), el("span", { text: ` — ${creatorLabel(art)} · ${art.license}` })),
      el("div.lightbox__tools",
        el("button.icon-btn", { type: "button", "aria-label": "Zoom out", onclick: () => setScale(scale / 1.4) }, icon("zoomOut")),
        level,
        el("button.icon-btn", { type: "button", "aria-label": "Zoom in", onclick: () => setScale(scale * 1.4) }, icon("zoomIn")),
        el("button.icon-btn", { type: "button", "aria-label": "Reset zoom", onclick: () => setScale(1) }, icon("reset")),
        closeBtn
      )
    ),
    stage
  );

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    setScale(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { passive: false });
  stage.addEventListener("dblclick", () => setScale(scale > 1 ? 1 : 2.5));
  stage.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
    } else if (scale > 1) {
      dragging = { sx: e.clientX - x, sy: e.clientY - y };
    }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      setScale(pinchStart.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.d));
    } else if (dragging) {
      x = e.clientX - dragging.sx;
      y = e.clientY - dragging.sy;
      apply();
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!pointers.size) dragging = null;
  };
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);
  stage.addEventListener("click", (e) => { if (e.target === stage && scale === 1) close(); });

  function onKey(e) {
    if (e.key === "Escape") close();
    else if (e.key === "+" || e.key === "=") setScale(scale * 1.4);
    else if (e.key === "-") setScale(scale / 1.4);
    else if (e.key === "0") setScale(1);
    else if (scale > 1 && e.key.startsWith("Arrow")) {
      const step = 60;
      if (e.key === "ArrowLeft") x += step;
      if (e.key === "ArrowRight") x -= step;
      if (e.key === "ArrowUp") y += step;
      if (e.key === "ArrowDown") y -= step;
      apply();
      e.preventDefault();
    } else if (e.key === "Tab") {
      const f = [...box.querySelectorAll("button")];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && i === f.length - 1) { f[0].focus(); e.preventDefault(); }
    }
  }

  document.addEventListener("keydown", onKey);
  document.body.classList.add("no-scroll");
  document.body.append(box);
  requestAnimationFrame(() => box.classList.add("is-open"));
  closeBtn.focus();

  // Upgrade to a higher-resolution rendition for zooming.
  (art.width > 1920 ? getZoomUrl(art.name, 1920) : Promise.resolve(null)).then((url) => {
    const safe = safeUrl(url, IMAGE_HOSTS);
    if (safe && safe !== img.src) {
      const hi = new Image();
      hi.referrerPolicy = "no-referrer";
      hi.onload = () => { img.src = safe; };
      hi.src = safe;
    }
  }).catch(() => {});
}
