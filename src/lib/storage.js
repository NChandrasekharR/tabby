/* localStorage persistence — every access wrapped so private mode /
 * quota / eviction degrade to defaults instead of crashing the app. */

export const STORAGE_KEY = "tabby.v1";
export const HISTORY_KEY = "tabby.history.v1";
export const ONBOARD_KEY = "tabby.onboarded.v1";

export function hasOnboarded() {
  try {
    return localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch {
    /* ignore */
  }
}

// Load the live draft (or null). Returns a partial state object.
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    return s;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode / quota) — ignore */
  }
}

// Saved-bill history (separate from the live draft).
export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const h = JSON.parse(raw);
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

export function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* storage unavailable — ignore */
  }
}

/* ---------- backup file (localStorage is evictable) ---------- */

export function buildBackup(draft, history) {
  return {
    app: "tabby",
    version: 1,
    exportedAt: new Date().toISOString(),
    draft,
    history,
  };
}

// Merge backup entries into existing history: dedupe by id, newest first.
// Returns { merged, added, found } — `found` is how many valid entries the
// file contained at all (to distinguish "already here" from "not a backup").
export function mergeHistory(existing, incoming) {
  const valid = (Array.isArray(incoming) ? incoming : []).filter(
    (e) => e && typeof e === "object" && e.id && e.bill && typeof e.bill === "object"
  );
  const seen = new Set(existing.map((e) => e.id));
  const fresh = valid.filter((e) => !seen.has(e.id));
  const merged = [...fresh, ...existing].sort((a, b) =>
    String(b.savedAt || "").localeCompare(String(a.savedAt || ""))
  );
  return { merged, added: fresh.length, found: valid.length };
}
