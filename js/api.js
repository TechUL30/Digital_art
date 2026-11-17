/**
 * api.js — Wikimedia Commons Action API client (browser-side, no key, CORS via origin=*).
 *
 * - localStorage cache (~12 h) for deterministic queries
 * - in-flight request de-duplication
 * - max 3 concurrent requests
 * - retries for 429 / 503 / network errors, honouring Retry-After, else exponential backoff
 */
import { cacheGet, cacheSet, pruneCache } from "./storage.js";
import { normalizeArtwork, thumbFromOriginal } from "./metadata.js";

const ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const MAX_CONCURRENT = 3;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

/** Restricts searches to file pages that use the {{Artwork}} template (real artwork records). */
export const ARTWORK_FILTER = "hastemplate:Artwork filetype:bitmap";

export class ApiError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

/* ---------------- Concurrency limiter ---------------- */

let active = 0;
const queue = [];

function runLimited(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const { task, resolve, reject } = queue.shift();
    active++;
    task().then(resolve, reject).finally(() => {
      active--;
      pump();
    });
  }
}

/* ---------------- Retry helpers ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(response) {
  const h = response.headers.get("Retry-After");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0) * 1000, MAX_DELAY_MS);
  const date = Date.parse(h);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_DELAY_MS);
  return null;
}

function backoffMs(attempt) {
  const exp = BASE_DELAY_MS * 2 ** attempt;
  return Math.min(exp + Math.random() * 400, MAX_DELAY_MS);
}

async function fetchWithRetry(url, signal) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetch(url, { signal, credentials: "omit" });
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      lastError = new ApiError("Network error — check your connection.", { retryable: true });
      await sleep(backoffMs(attempt));
      continue;
    }
    if (response.status === 429 || response.status === 503) {
      lastError = new ApiError(
        response.status === 429 ? "Wikimedia is rate-limiting requests. Please wait a moment." : "Wikimedia Commons is temporarily unavailable.",
        { status: response.status, retryable: true }
      );
      if (attempt < MAX_ATTEMPTS - 1) await sleep(retryAfterMs(response) ?? backoffMs(attempt));
      continue;
    }
    if (!response.ok) throw new ApiError(`HTTP ${response.status}`, { status: response.status });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new ApiError("Unexpected response from Wikimedia Commons.");
    }
    if (data && data.error) {
      if (data.error.code === "maxlag" || data.error.code === "ratelimited") {
        lastError = new ApiError("Wikimedia Commons is busy.", { retryable: true });
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new ApiError(data.error.info || "The API returned an error.");
    }
    return data;
  }
  throw lastError || new ApiError("Request failed.");
}

/* ---------------- Core request ---------------- */

const inflight = new Map();

/**
 * Perform an API GET. Options: { cache: boolean (default true), signal }.
 * Identical concurrent calls share one network request.
 */
export function apiGet(params, { cache = true, signal } = {}) {
  const search = new URLSearchParams({ ...params, format: "json", formatversion: "2", origin: "*" });
  search.sort(); // stable key for cache & dedupe
  const url = `${ENDPOINT}?${search.toString()}`;

  if (cache) {
    const hit = cacheGet(url);
    if (hit) return Promise.resolve(hit);
  }
  // Uncached calls (random discovery) are never deduplicated: each must be fresh.
  if (cache && inflight.has(url)) return inflight.get(url);

  const p = runLimited(() => fetchWithRetry(url, signal)).then((data) => {
    if (cache) cacheSet(url, data);
    return data;
  });
  if (cache) {
    inflight.set(url, p);
    p.finally(() => inflight.delete(url)).catch(() => {});
  }
  return p;
}

pruneCache(false);

/* ---------------- Artwork queries ---------------- */

const IMAGEINFO_PROPS = {
  prop: "imageinfo",
  iiprop: "url|size|mime|extmetadata",
  iiextmetadatafilter:
    "ObjectName|Artist|DateTimeOriginal|ImageDescription|LicenseShortName|License|LicenseUrl|UsageTerms|AttributionRequired|Credit|Categories",
  iiextmetadatalanguage: "en",
};

function pagesToArtworks(data) {
  const pages = data && data.query && Array.isArray(data.query.pages) ? data.query.pages : [];
  // generator results are unordered; restore search rank via `index`.
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const seen = new Set();
  const out = [];
  for (const p of pages) {
    const art = normalizeArtwork(p);
    if (art && !seen.has(art.name)) {
      seen.add(art.name);
      out.push(art);
    }
  }
  return out;
}

export const SORTS = {
  relevance: { label: "Relevance", api: "relevance" },
  newest: { label: "Recently added to Commons", api: "create_timestamp_desc" },
  oldest: { label: "Earliest added to Commons", api: "create_timestamp_asc" },
  titleAsc: { label: "File name A–Z", api: "title_natural_asc" },
  titleDesc: { label: "File name Z–A", api: "title_natural_desc" },
  yearAsc: { label: "Artwork date — oldest first (this page)", api: "relevance", client: "yearAsc" },
  yearDesc: { label: "Artwork date — newest first (this page)", api: "relevance", client: "yearDesc" },
};

/**
 * Search artworks. Returns { items, nextOffset, rawCount }.
 * `rawCount` is the number of results before license filtering.
 */
export async function searchArtworks({ query = "", offset = 0, limit = 24, sort = "relevance", thumbWidth = 500, random = false, signal } = {}) {
  const q = `${query} ${ARTWORK_FILTER}`.trim();
  const params = {
    action: "query",
    generator: "search",
    gsrsearch: q,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    gsroffset: String(offset),
    gsrsort: random ? "random" : (SORTS[sort] ? SORTS[sort].api : "relevance"),
    iiurlwidth: String(thumbWidth),
    ...IMAGEINFO_PROPS,
    // Categories are long; only the details page needs them (keeps the cache small).
    iiextmetadatafilter: IMAGEINFO_PROPS.iiextmetadatafilter.replace("|Categories", ""),
  };
  const data = await apiGet(params, { cache: !random, signal });
  const items = pagesToArtworks(data);
  const nextOffset = data && data.continue && data.continue.gsroffset != null ? Number(data.continue.gsroffset) : null;
  const rawCount = data && data.query && data.query.pages ? data.query.pages.length : 0;
  return { items, nextOffset, rawCount };
}

/** Fetch one artwork by its File: title with a large display image. */
export async function getArtwork(fileTitle, { width = 1280, signal } = {}) {
  const data = await apiGet({ action: "query", titles: fileTitle, iiurlwidth: String(width), ...IMAGEINFO_PROPS }, { signal });
  const pages = data && data.query && data.query.pages ? data.query.pages : [];
  const page = pages[0];
  if (!page || page.missing || page.invalid) return { art: null, reason: "missing" };
  const art = normalizeArtwork(page);
  if (art && !/\/thumb\//.test(art.thumb)) {
    // The API returns the unscaled original when the image is narrower than the
    // requested width. Originals can be large or rate-limited, so prefer a standard thumbnail.
    const std = thumbFromOriginal(art.full, art.width, width);
    if (std) {
      art.thumb = std;
      const w = Number(std.match(/\/(\d+)px-/)[1]);
      if (art.width && art.height) {
        art.thumbW = w;
        art.thumbH = Math.round((art.height * w) / art.width);
      }
    }
  }
  return { art, reason: art ? null : "license" };
}

/** Large/zoom URL for an image (Commons thumbnails, capped width). */
export async function getZoomUrl(fileTitle, width = 1920) {
  const { art } = await getArtwork(fileTitle, { width });
  return art ? art.thumb : null;
}
