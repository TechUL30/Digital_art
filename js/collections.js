/**
 * collections.js — curated entry points. Each is only a search query against
 * Wikimedia Commons; all artworks shown come from live API results.
 */

/** Pool used for the homepage hero, masterpiece rail and Artwork of the Day. */
export const MASTERPIECE_QUERY = "hastemplate:Assessments painting";

/** Pool used for Random Discovery (sorted randomly by the API). */
export const DISCOVERY_QUERY = "painting";

export const COLLECTIONS = [
  { id: "impressionism", title: "Light & Impressionism", kicker: "France · 1860–1900", query: "impressionism", blurb: "Plein-air canvases, broken brushwork and the fleeting effects of light." },
  { id: "renaissance", title: "The Renaissance", kicker: "Europe · 14th–16th c.", query: "renaissance", blurb: "Perspective, humanism and the rebirth of classical ideals." },
  { id: "baroque", title: "Baroque Drama", kicker: "Europe · 17th c.", query: "baroque painting", blurb: "Theatrical light, movement and emotional intensity." },
  { id: "ukiyoe", title: "Ukiyo-e: Floating World", kicker: "Japan · 17th–19th c.", query: "ukiyo-e", blurb: "Woodblock prints of landscapes, actors and everyday life." },
  { id: "dutch", title: "Dutch Golden Age", kicker: "Netherlands · 17th c.", query: "dutch golden age painting", blurb: "Interiors, still lifes and portraits of a mercantile republic." },
  { id: "romanticism", title: "Romantic Sublime", kicker: "Europe · 1790–1850", query: "romanticism painting", blurb: "Storms, ruins and the overwhelming power of nature." },
  { id: "icons", title: "Sacred Icons", kicker: "Byzantium & beyond", query: "byzantine icon", blurb: "Gold grounds and devotional images from the Eastern tradition." },
  { id: "manuscripts", title: "Illuminated Pages", kicker: "Medieval manuscripts", query: "illuminated manuscript", blurb: "Gilded miniatures from books of hours and chronicles." },
];

export const CATEGORIES = [
  { label: "Medieval", query: "medieval painting" },
  { label: "Renaissance", query: "renaissance" },
  { label: "Baroque", query: "baroque painting" },
  { label: "Rococo", query: "rococo" },
  { label: "Neoclassicism", query: "neoclassicism" },
  { label: "Romanticism", query: "romanticism painting" },
  { label: "Realism", query: "realism painting" },
  { label: "Impressionism", query: "impressionism" },
  { label: "Post-Impressionism", query: "post-impressionism" },
  { label: "Symbolism", query: "symbolism painting" },
  { label: "Art Nouveau", query: "art nouveau" },
  { label: "Ukiyo-e", query: "ukiyo-e" },
  { label: "Chinese painting", query: "chinese painting" },
  { label: "Persian miniatures", query: "persian miniature" },
  { label: "Portraits", query: "portrait painting" },
  { label: "Landscapes", query: "landscape painting" },
  { label: "Still life", query: "still life" },
  { label: "Mythology", query: "mythology painting" },
  { label: "Marine", query: "marine painting" },
  { label: "Botanical", query: "botanical illustration" },
];

/** Explorer filters — each adds a keyword to the search. */
export const MOVEMENTS = [
  ["", "All periods"],
  ["medieval", "Medieval"],
  ["renaissance", "Renaissance"],
  ["baroque", "Baroque"],
  ["rococo", "Rococo"],
  ["neoclassicism", "Neoclassicism"],
  ["romanticism", "Romanticism"],
  ["realism", "Realism"],
  ["impressionism", "Impressionism"],
  ["post-impressionism", "Post-Impressionism"],
  ["symbolism", "Symbolism"],
  ["ukiyo-e", "Ukiyo-e"],
];

export const MEDIUMS = [
  ["", "All media"],
  ["painting", "Painting"],
  ["drawing", "Drawing"],
  ["print", "Print & engraving"],
  ["watercolor", "Watercolour"],
  ["fresco", "Fresco"],
  ["manuscript", "Manuscript"],
  ["sculpture", "Sculpture"],
];

/** Seeds for the Artist Explorer — artists are discovered from these live results. */
export const ARTIST_SEEDS = [
  "hastemplate:Assessments painting",
  "impressionism",
  "renaissance",
  "baroque painting",
  "ukiyo-e",
];
