/**
 * metadata.js — turns raw Wikimedia Commons imageinfo/extmetadata into clean,
 * verified artwork records.
 *
 * Security: extmetadata values contain HTML written by Commons editors. They are
 * parsed with DOMParser into an inert document (no scripts run, no resources load)
 * and only plain text / validated URLs are extracted. Nothing from the API is ever
 * inserted into the page as HTML.
 */

const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;

const HIDDEN_SELECTORS = [
  "script", "style", "img", "noscript", "sup.reference",
  ".noprint", ".wikidata-qs", "[hidden]",
  '[style*="display:none"]', '[style*="display: none"]',
].join(",");

/* ---------------- URL validation ---------------- */

/**
 * Returns a normalised https URL string, or null if the input is not a safe
 * http(s) URL (optionally restricted to host suffixes).
 */
export function safeUrl(raw, hostSuffixes = null) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let value = raw.trim();
  if (value.startsWith("//")) value = "https:" + value;
  let u;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.protocol === "http:") u.protocol = "https:"; // all hosts we link to support https
  if (hostSuffixes) {
    const host = u.hostname.toLowerCase();
    const ok = hostSuffixes.some((s) => host === s || host.endsWith("." + s));
    if (!ok) return null;
  }
  return u.toString();
}

export const IMAGE_HOSTS = ["wikimedia.org"];
const COMMONS_HOSTS = ["commons.wikimedia.org"];
const ARTIST_LINK_HOSTS = ["wikipedia.org", "wikidata.org", "commons.wikimedia.org"];
const LICENSE_HOSTS = ["creativecommons.org", "wikimedia.org", "wikipedia.org", "gnu.org"];

/* ---------------- HTML → text ---------------- */

function parseFragment(html) {
  if (!parser || typeof html !== "string" || !html) return null;
  const doc = parser.parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
  doc.body.querySelectorAll(HIDDEN_SELECTORS).forEach((n) => n.remove());
  return doc.body;
}

function tidy(text) {
  return String(text || "")
    // QuickStatements residue that sometimes survives outside hidden nodes
    .replace(/\s*\b(?:title|label|date|creator|description|object)\s+QS:[^\n]*/gi, " ")
    .replace(/[ \s]+/g, " ")
    .trim();
}

function dedupeRepeat(text) {
  // "Unknown authorUnknown author" → "Unknown author"
  const n = text.length;
  if (n % 2 === 0 && n > 2 && text.slice(0, n / 2) === text.slice(n / 2)) return text.slice(0, n / 2);
  return text;
}

/**
 * Extract plain text from a metadata HTML value. When `preferLang` is set and the
 * value is multilingual, return the matching language block (else the first one).
 */
export function htmlToText(html, preferLang = null) {
  if (!html) return "";
  if (typeof html !== "string") return tidy(String(html));
  const body = parseFragment(html);
  if (!body) return tidy(html.replace(/<[^>]*>/g, " "));
  if (preferLang) {
    const blocks = body.querySelectorAll("[lang]");
    if (blocks.length) {
      const preferred = body.querySelector(`[lang="${preferLang}"]`);
      const pick = preferred && tidy(preferred.textContent) ? preferred : blocks[0];
      const t = tidy(pick.textContent);
      if (t) return t;
    }
  }
  return dedupeRepeat(tidy(body.textContent));
}

/** Artist value: text plus an optional validated reference link and short description. */
function parseArtist(html) {
  const result = { name: "", link: null, note: "" };
  if (!html) return result;
  result.name = htmlToText(html);
  const body = parseFragment(html);
  if (!body) return result;
  const a = body.querySelector("a[href]");
  if (a) result.link = safeUrl(a.getAttribute("href"), ARTIST_LINK_HOSTS);
  const described = body.querySelector("span[title]");
  if (described) {
    const note = tidy(described.getAttribute("title"));
    // Only keep it when it reads like a description, not a repeated name.
    if (note && note.toLowerCase() !== result.name.toLowerCase() && note.length < 140) result.note = note;
  }
  return result;
}

/* ---------------- Licensing ---------------- */

export const LICENSE_KINDS = {
  pd: "Public Domain",
  cc0: "CC0",
  by: "CC BY",
  "by-sa": "CC BY-SA",
};

/**
 * Classify a license into one of the allowed kinds, or null if it is unknown or
 * incompatible (NC, ND, GFDL-only, FAL, fair use, missing…). Only allowed kinds
 * are ever displayed.
 */
export function classifyLicense(shortName, code) {
  const s = tidy(shortName || "");
  const c = tidy(code || "").toLowerCase();
  const both = `${s} ${c}`;
  if (!s && !c) return null;
  if (/(^|[\s-])(nc|nd)([\s-]|$)|non-?commercial|no-?deriv|fair use|non-free/i.test(both)) return null;
  if (/^(public domain|pd\b|pdm\b|pd-)/i.test(s) || c === "pd" || c === "pdm" || c.startsWith("pd-") || c.startsWith("pdm-")) return "pd";
  if (/^cc0\b/i.test(s) || c === "cc0" || c.startsWith("cc-zero")) return "cc0";
  if (/^cc[\s-]by[\s-]sa\b/i.test(s) || c.startsWith("cc-by-sa")) return "by-sa";
  if (/^cc[\s-]by\b(?![\s-]sa)/i.test(s) || /^cc-by(-\d|$)/.test(c)) return "by";
  return null;
}

/* ---------------- Dates ---------------- */

/** Best-effort numeric year for sorting/filtering only — never displayed as fact. */
export function extractYear(dateText) {
  if (!dateText) return null;
  const m = dateText.match(/\b(1[0-9]{3}|20[0-2][0-9]|[1-9][0-9]{2})\b/);
  if (m) return parseInt(m[1], 10);
  const c = dateText.match(/\b(\d{1,2})(?:st|nd|rd|th)[\s-]+century\b/i);
  if (c) return (parseInt(c[1], 10) - 1) * 100 + 50;
  return null;
}

/* ---------------- Categories ---------------- */

const CATEGORY_NOISE = /^(pd|cc|gfdl|pdm|files?|artworks? with|pages|media|images?|license|self-published|uploaded|wikidata|supported by|template|superseded|featured|formerly|quality|valued|google art project|works? with|creator template|artworks digital|paintings? with|all media|checked|cc-|retouched|scans?|photographs by|photos by|taken with|assessments)/i;

function parseCategories(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .split("|")
    .map((c) => tidy(c))
    .filter((c) => c && c.length < 70 && !CATEGORY_NOISE.test(c) && !/\b(missing|needing|lacking|errors?)\b/i.test(c))
    .slice(0, 8);
}

/* ---------------- Main normaliser ---------------- */

function fileNameToTitle(name) {
  return name.replace(/^File:/, "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ").trim();
}

/**
 * Convert an API page object into an artwork record, or null if the record lacks
 * a usable image or a verified compatible license.
 */
export function normalizeArtwork(page) {
  if (!page || typeof page.title !== "string") return null;
  const ii = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
  if (!ii) return null;
  const m = ii.extmetadata || {};
  const v = (k) => (m[k] && typeof m[k].value === "string" ? m[k].value : "");

  const licenseShort = htmlToText(v("LicenseShortName"));
  const licenseKind = classifyLicense(licenseShort, htmlToText(v("License")));
  if (!licenseKind) return null; // exclude unknown / incompatible licenses

  const full = safeUrl(ii.url, IMAGE_HOSTS);
  const thumb = safeUrl(ii.thumburl, IMAGE_HOSTS) || full;
  const pageUrl = safeUrl(ii.descriptionurl, COMMONS_HOSTS) ||
    `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
  if (!thumb) return null;
  if (ii.mime && !/^image\/(jpeg|png|gif|webp|tiff)/i.test(ii.mime)) return null;

  const objectName = htmlToText(v("ObjectName"), "en");
  const artist = parseArtist(v("Artist"));
  const date = htmlToText(v("DateTimeOriginal"));
  const description = htmlToText(v("ImageDescription"), "en");

  return {
    name: page.title, // "File:…" — the stable identifier
    title: objectName || fileNameToTitle(page.title),
    titleFromFile: !objectName,
    artist: artist.name,
    artistLink: artist.link,
    artistNote: artist.note,
    date,
    year: extractYear(date),
    description: description.length > 4000 ? description.slice(0, 4000) + "…" : description,
    credit: htmlToText(v("Credit")),
    license: licenseShort || LICENSE_KINDS[licenseKind],
    licenseKind,
    licenseUrl: safeUrl(htmlToText(v("LicenseUrl")), LICENSE_HOSTS),
    usageTerms: htmlToText(v("UsageTerms")),
    attributionRequired: v("AttributionRequired") === "true",
    categories: parseCategories(v("Categories")),
    full,
    thumb,
    thumbW: Number(ii.thumbwidth) || Number(ii.width) || 0,
    thumbH: Number(ii.thumbheight) || Number(ii.height) || 0,
    width: Number(ii.width) || 0,
    height: Number(ii.height) || 0,
    pageUrl,
  };
}

/**
 * Build a standard Commons thumbnail URL from an original upload URL, using the
 * documented path pattern …/commons/thumb/a/ab/Name.ext/{w}px-Name.ext. Picks the
 * largest standard bucket that is smaller than the original. Returns null if the
 * URL does not match or the image is too small to have a thumbnail.
 */
const STANDARD_WIDTHS = [1280, 960, 500, 330, 250];
export function thumbFromOriginal(fullUrl, originalWidth, maxWidth = 1280) {
  const url = safeUrl(fullUrl, IMAGE_HOSTS);
  if (!url) return null;
  const m = url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)/);
  if (!m) return null;
  const w = STANDARD_WIDTHS.find((s) => s <= maxWidth && (!originalWidth || s < originalWidth));
  if (!w) return null;
  const [, a, ab, file] = m;
  const ext = /\.(tiff?|pdf|djvu)$/i.test(file) ? ".jpg" : "";
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${file}/${w}px-${file}${ext}`;
}

/** Plain-text attribution line suitable for copying. */
export function attributionText(art) {
  const parts = [];
  parts.push(`“${art.title}”`);
  parts.push(art.artist ? `by ${art.artist}` : "creator not recorded");
  if (art.date) parts.push(`(${art.date})`);
  let line = parts.join(" ") + ".";
  line += ` License: ${art.license}`;
  if (art.licenseUrl) line += ` (${art.licenseUrl})`;
  line += `. Source: Wikimedia Commons — ${art.pageUrl}`;
  return line;
}
