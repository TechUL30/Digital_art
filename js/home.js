/** home.js — editorial homepage: hero, masterpieces rail, artwork of the day, collections, categories. */
import { searchArtworks } from "./api.js";
import { COLLECTIONS, CATEGORIES, MASTERPIECE_QUERY } from "./collections.js";
import {
  el, clear, icon, artImage, artHref, artistHref, creatorLabel, licenseBadge, favButton,
  errorState, hashFor, whenVisible, setTitle, extLink,
} from "./ui.js";

function dayIndex() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

export function renderHome(root, _params, ctx) {
  setTitle("");
  const page = el("div.home");

  /* ---------- Hero ---------- */
  const heroArt = el("figure.hero__art", el("div.skeleton.hero__skeleton", { "aria-hidden": "true" }));
  const searchInput = el("input.hero__input", { type: "search", name: "q", placeholder: "Search 'Vermeer', 'water lilies', 'ukiyo-e'…", "aria-label": "Search the collection", autocomplete: "off" });
  const hero = el("section.hero", { "aria-labelledby": "hero-title" },
    el("div.hero__text",
      el("p.eyebrow", { text: "The World's Digital Art Museum" }),
      el("h1.hero__title#hero-title", {}, "Every gallery ", el("em", { text: "of the world," }), " open at once."),
      el("p.hero__lede", { text: "Wander through openly licensed masterpieces preserved on Wikimedia Commons — from illuminated manuscripts to Impressionist light — each presented with its full provenance and attribution." }),
      el("form.hero__search", { role: "search", onsubmit: (e) => {
        e.preventDefault();
        const q = searchInput.value.trim();
        location.hash = hashFor("explore", { q });
      } },
        icon("search", "hero__search-icon"),
        searchInput,
        el("button.btn.btn--gold", { type: "submit", text: "Search" })
      ),
      el("div.hero__actions",
        el("a.btn.btn--dark", { href: "#/explore" }, "Enter the collection"),
        el("a.btn.btn--ghost", { href: "#/discover" }, icon("shuffle"), "Surprise me")
      )
    ),
    heroArt
  );
  page.append(hero);

  /* ---------- Masterpieces rail ---------- */
  const rail = el("div.rail__track", { tabindex: "0", role: "list", "aria-label": "Masterpieces" });
  const scrollRail = (dir) => rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const railSection = el("section.section.rail", { "aria-labelledby": "rail-title" },
    el("header.section__head",
      el("div", el("p.eyebrow", { text: "Hall I" }), el("h2.section__title#rail-title", { text: "Masterpieces of the Commons" })),
      el("div.rail__controls",
        el("button.icon-btn", { type: "button", "aria-label": "Scroll masterpieces left", onclick: () => scrollRail(-1) }, icon("arrowLeft")),
        el("button.icon-btn", { type: "button", "aria-label": "Scroll masterpieces right", onclick: () => scrollRail(1) }, icon("arrowRight")),
        el("a.link-arrow", { href: hashFor("explore", { q: MASTERPIECE_QUERY }) }, "View all")
      )
    ),
    rail
  );
  for (let i = 0; i < 6; i++) rail.append(el("div.rail__item.skeleton", { "aria-hidden": "true" }));
  page.append(railSection);

  /* ---------- Artwork of the day ---------- */
  const aotd = el("section.section.aotd", { "aria-labelledby": "aotd-title" },
    el("div.aotd__inner", el("div.skeleton.aotd__skeleton", { "aria-hidden": "true" }))
  );
  page.append(aotd);

  /* ---------- Collections ---------- */
  const colGrid = el("div.collections");
  page.append(el("section.section", { "aria-labelledby": "col-title" },
    el("header.section__head", el("div", el("p.eyebrow", { text: "Hall II" }), el("h2.section__title#col-title", { text: "Featured collections" }))),
    colGrid
  ));
  COLLECTIONS.forEach((c, i) => colGrid.append(collectionCard(c, i, ctx)));

  /* ---------- Categories ---------- */
  page.append(el("section.section.categories", { "aria-labelledby": "cat-title" },
    el("header.section__head", el("div", el("p.eyebrow", { text: "Hall III" }), el("h2.section__title#cat-title", { text: "Periods, places & subjects" }))),
    el("ul.chips", ...CATEGORIES.map((c) => el("li", el("a.chip", { href: hashFor("explore", { q: c.query }), text: c.label }))))
  ));

  /* ---------- Invitation band ---------- */
  page.append(el("section.band", { "aria-label": "Ways to explore" },
    bandItem("01", "Discover by chance", "Let the archive choose a random work for you.", "#/discover", "Random discovery"),
    bandItem("02", "Meet the artists", "Browse creators found in live collection results.", "#/artists", "Artist explorer"),
    bandItem("03", "Curate your own", "Save works to a private collection kept in this browser.", "#/favorites", "Your favorites"),
  ));

  clear(root).append(page);

  /* ---------- Data ---------- */
  const loadMasterpieces = async () => {
    try {
      const { items } = await searchArtworks({ query: MASTERPIECE_QUERY, limit: 16, thumbWidth: 960 });
      if (!ctx.isCurrent()) return;
      if (!items.length) throw new Error("No artworks were returned.");
      const [first, ...rest] = items;
      fillHero(heroArt, first);
      clear(rail);
      rest.slice(0, 12).forEach((art) => rail.append(railItem(art)));
    } catch (err) {
      if (!ctx.isCurrent()) return;
      clear(heroArt).append(el("div.hero__fallback", el("span", { text: "✦" })));
      clear(rail).append(errorState(err, loadMasterpieces));
    }
  };

  const loadAotd = async () => {
    const offset = dayIndex() % 400;
    try {
      const { items } = await searchArtworks({ query: MASTERPIECE_QUERY, offset, limit: 5, thumbWidth: 960 });
      if (!ctx.isCurrent()) return;
      if (!items.length) throw new Error("Today's artwork could not be found.");
      fillAotd(aotd, items[0]);
    } catch (err) {
      if (!ctx.isCurrent()) return;
      clear(aotd).append(errorState(err, loadAotd));
    }
  };

  loadMasterpieces();
  whenVisible(aotd, loadAotd, "400px");
}

function fillHero(fig, art) {
  const img = artImage(art, { cls: "hero__img", eager: true });
  img.setAttribute("fetchpriority", "high");
  const frame = el("a.hero__frame", { href: artHref(art), "aria-label": `View ${art.title}` }, img);
  if (art.thumbW && art.thumbH) frame.style.aspectRatio = `${art.thumbW} / ${art.thumbH}`;
  clear(fig).append(
    frame,
    el("figcaption.hero__caption",
      el("span.hero__caption-label", { text: "Featured" }),
      el("a.hero__caption-title", { href: artHref(art), text: art.title }),
      el("span.hero__caption-meta", { text: [creatorLabel(art), art.date].filter(Boolean).join(" · ") }),
      el("span.hero__caption-license", { text: art.license })
    )
  );
}

function railItem(art) {
  const frame = el("div.rail__frame", artImage(art, { cls: "rail__img" }));
  return el("a.rail__item", { href: artHref(art), role: "listitem" },
    frame,
    el("span.rail__title", { text: art.title }),
    el("span.rail__artist", { text: creatorLabel(art) })
  );
}

function fillAotd(section, art) {
  const frame = el("a.aotd__frame", { href: artHref(art), "aria-label": `View ${art.title}` }, artImage(art, { cls: "aotd__img" }));
  if (art.thumbW && art.thumbH) frame.style.aspectRatio = `${art.thumbW} / ${art.thumbH}`;
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const desc = art.description && art.description !== art.title ? art.description : "";
  clear(section).append(el("div.aotd__inner",
    frame,
    el("div.aotd__text",
      el("p.eyebrow", { text: `Artwork of the Day · ${date}` }),
      el("h2.aotd__title#aotd-title", { text: art.title }),
      el("p.aotd__artist", {},
        art.artist ? el("a", { href: artistHref(art.artist), text: art.artist }) : el("span", { text: creatorLabel(art) }),
        art.date ? el("span.aotd__date", { text: ` · ${art.date}` }) : null
      ),
      desc ? el("p.aotd__desc", { text: desc.length > 320 ? desc.slice(0, 320).trimEnd() + "…" : desc }) : null,
      el("p.aotd__license", {}, licenseBadge(art), " ", extLink(art.pageUrl, "Wikimedia Commons")),
      el("div.aotd__actions",
        el("a.btn.btn--dark", { href: artHref(art) }, "View details"),
        favButton(art)
      )
    )
  ));
}

function collectionCard(c, i, ctx) {
  const cover = el("div.collection__cover", el("div.skeleton", { "aria-hidden": "true" }));
  const card = el("a.collection", { href: hashFor("explore", { q: c.query, title: c.title }) },
    cover,
    el("div.collection__body",
      el("span.collection__num", { text: String(i + 1).padStart(2, "0") }),
      el("p.collection__kicker", { text: c.kicker }),
      el("h3.collection__title", { text: c.title }),
      el("p.collection__blurb", { text: c.blurb })
    )
  );
  whenVisible(card, async () => {
    try {
      const { items } = await searchArtworks({ query: c.query, limit: 4, thumbWidth: 500 });
      if (!ctx.isCurrent()) return;
      const art = items[0];
      clear(cover);
      if (art) {
        const img = artImage(art, { cls: "collection__img" });
        img.alt = "";
        cover.append(img);
        cover.title = `${art.title} — ${creatorLabel(art)} (${art.license})`;
      }
    } catch {
      if (ctx.isCurrent()) clear(cover);
    }
  });
  return card;
}

function bandItem(num, title, text, href, cta) {
  return el("a.band__item", { href },
    el("span.band__num", { text: num }),
    el("h3.band__title", { text: title }),
    el("p.band__text", { text }),
    el("span.link-arrow", { text: cta })
  );
}
