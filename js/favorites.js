/** favorites.js — the visitor's personal collection, persisted in localStorage. */
import { getFavorites, removeFavorite, clearFavorites, onFavoritesChange } from "./storage.js";
import { el, clear, icon, artImage, artHref, creatorLabel, licenseBadge, extLink, stateBlock, toast, setTitle } from "./ui.js";

export function renderFavorites(root, _params, ctx) {
  setTitle("Your collection");
  const grid = el("div.masonry");
  const summary = el("p.results__summary", { "aria-live": "polite" });
  const sortSel = el("select.field__select#fav-sort", {},
    el("option", { value: "recent", text: "Recently saved" }),
    el("option", { value: "title", text: "Title A–Z" }),
    el("option", { value: "artist", text: "Creator A–Z" })
  );
  const clearBtn = el("button.btn.btn--text", { type: "button" }, icon("trash"), "Clear collection");
  const tools = el("div.fav-tools",
    el("div.field.field--inline", el("label.field__label", { for: "fav-sort", text: "Sort" }), sortSel),
    clearBtn
  );

  clear(root).append(el("div.favorites",
    el("header.page-head",
      el("p.eyebrow", { text: "Private gallery" }),
      el("h1.page-title", { tabindex: "-1", text: "Your Collection" }),
      el("p.page-lede", { text: "Works you save are stored only in this browser. Attribution travels with every piece." })
    ),
    tools,
    summary,
    grid
  ));

  const draw = () => {
    const list = getFavorites();
    const by = sortSel.value;
    if (by === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    if (by === "artist") list.sort((a, b) => (a.artist || "~").localeCompare(b.artist || "~"));
    clear(grid);
    tools.hidden = !list.length;
    if (!list.length) {
      summary.textContent = "";
      grid.append(stateBlock({
        title: "Your collection is empty",
        message: "Tap the heart on any artwork to keep it here.",
        action: el("div.state__actions",
          el("a.btn.btn--dark", { href: "#/explore", text: "Explore the collection" }),
          el("a.btn.btn--ghost", { href: "#/discover" }, icon("shuffle"), "Random discovery")
        ),
      }));
      return;
    }
    summary.textContent = `${list.length} saved work${list.length === 1 ? "" : "s"}`;
    list.forEach((art) => grid.append(favCard(art)));
  };

  sortSel.addEventListener("change", draw);
  clearBtn.addEventListener("click", () => {
    if (window.confirm("Remove every artwork from your collection?")) {
      clearFavorites();
      toast("Collection cleared");
    }
  });

  const off = onFavoritesChange(() => { if (ctx.isCurrent()) draw(); });
  draw();
  return off;
}

function favCard(art) {
  const frame = el("div.card__frame", artImage(art, { cls: "card__img" }));
  if (art.thumbW && art.thumbH) frame.style.aspectRatio = `${art.thumbW} / ${art.thumbH}`;
  const remove = el("button.btn.btn--text.card__remove", { type: "button", "aria-label": `Remove “${art.title}” from your collection` }, icon("trash"), "Remove");
  remove.addEventListener("click", () => {
    removeFavorite(art.name);
    toast("Removed from your collection");
  });
  return el("article.card.card--fav",
    el("a.card__link", { href: artHref(art) },
      frame,
      el("div.card__meta",
        el("h3.card__title", { text: art.title }),
        el("p.card__artist", { text: creatorLabel(art) }),
        el("p.card__foot", art.date ? el("span.card__date", { text: art.date }) : null, licenseBadge(art))
      )
    ),
    el("div.card__actions", extLink(art.pageUrl, "Source", "btn btn--text"), remove)
  );
}
