/**
 * storage.js — safe localStorage wrappers: response cache (TTL) and favorites.
 * Every access is wrapped in try/catch: storage may be unavailable (private mode,
 * blocked site data) and the app must keep working without it.
 */

const CACHE_PREFIX = "au:cache:v1:";
const FAV_KEY = "au:favorites:v1";
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // ~12 hours

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

function cacheKeys() {
  const keys = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
  } catch { /* ignore */ }
  return keys;
}

/** Remove expired entries; if `aggressive`, also drop the oldest half. */
export function pruneCache(aggressive = false) {
  const now = Date.now();
  const entries = [];
  for (const k of cacheKeys()) {
    try {
      const { t } = JSON.parse(safeGet(k));
      if (!t || now - t > CACHE_TTL_MS) safeRemove(k);
      else entries.push([k, t]);
    } catch {
      safeRemove(k);
    }
  }
  if (aggressive) {
    entries.sort((a, b) => a[1] - b[1]);
    entries.slice(0, Math.ceil(entries.length / 2)).forEach(([k]) => safeRemove(k));
  }
}

export function cacheGet(key) {
  const raw = safeGet(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > CACHE_TTL_MS) {
      safeRemove(CACHE_PREFIX + key);
      return null;
    }
    return v;
  } catch {
    safeRemove(CACHE_PREFIX + key);
    return null;
  }
}

export function cacheSet(key, value) {
  const payload = JSON.stringify({ t: Date.now(), v: value });
  if (safeSet(CACHE_PREFIX + key, payload)) return;
  // Quota exceeded: prune and retry once.
  pruneCache(true);
  safeSet(CACHE_PREFIX + key, payload);
}

/* ---------------- Favorites ---------------- */

const favListeners = new Set();

export function getFavorites() {
  try {
    const list = JSON.parse(safeGet(FAV_KEY) || "[]");
    return Array.isArray(list) ? list.filter((a) => a && typeof a.name === "string" && typeof a.title === "string") : [];
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  const ok = safeSet(FAV_KEY, JSON.stringify(list));
  favListeners.forEach((fn) => fn(list));
  return ok;
}

export function isFavorite(name) {
  return getFavorites().some((a) => a.name === name);
}

/** Store only the fields needed to render a card and its attribution. */
function compact(art) {
  const { title, name, artist, date, year, thumb, thumbW, thumbH, license, licenseUrl, licenseKind, pageUrl } = art;
  return { title, name, artist, date, year, thumb, thumbW, thumbH, license, licenseUrl, licenseKind, pageUrl, savedAt: Date.now() };
}

/** Toggle favorite state. Returns { added, persisted }. */
export function toggleFavorite(art) {
  const list = getFavorites();
  const idx = list.findIndex((a) => a.name === art.name);
  let added;
  if (idx >= 0) {
    list.splice(idx, 1);
    added = false;
  } else {
    list.unshift(compact(art));
    added = true;
  }
  const persisted = saveFavorites(list);
  return { added, persisted };
}

export function removeFavorite(name) {
  saveFavorites(getFavorites().filter((a) => a.name !== name));
}

export function clearFavorites() {
  saveFavorites([]);
}

export function onFavoritesChange(fn) {
  favListeners.add(fn);
  return () => favListeners.delete(fn);
}

// Keep tabs in sync.
try {
  window.addEventListener("storage", (e) => {
    if (e.key === FAV_KEY) favListeners.forEach((fn) => fn(getFavorites()));
  });
} catch { /* ignore */ }
