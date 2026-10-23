// 场景：OpenSEO iframe origin 跨 remount 缓存 — debug revision 热更后不必黑屏等 ensure。
const STORAGE_KEY = "agnx:open-seo:last-origin";

export function readPersistedOpenSeoOrigin(): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return typeof raw === "string" && raw.startsWith("http") ? raw : null;
  } catch {
    return null;
  }
}

export function persistOpenSeoOrigin(origin: string): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, origin);
  } catch {
    // ignore quota / private mode
  }
}

export function clearPersistedOpenSeoOrigin(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function resolveOpenSeoOriginCache(moduleCached: string | null): string | null {
  return moduleCached ?? readPersistedOpenSeoOrigin();
}
