const ANALYTICS_ID_STORAGE_KEY = "partyplay.analyticsId";
const ANALYTICS_ID_PATTERN = /^a_[a-f0-9]{32}$/;

function createAnalyticsId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `a_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function getOrCreateAnalyticsId(): string {
  try {
    const stored = window.localStorage.getItem(ANALYTICS_ID_STORAGE_KEY);
    if (stored && ANALYTICS_ID_PATTERN.test(stored)) return stored;
    const created = createAnalyticsId();
    window.localStorage.setItem(ANALYTICS_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return createAnalyticsId();
  }
}
