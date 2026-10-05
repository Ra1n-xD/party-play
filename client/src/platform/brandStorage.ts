/** Rename browser keys without losing sessions or retry receipts on the existing origin. */
export interface BrandStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function legacyKey(key: string): string {
  return key.replace(/^partyside/, "partyplay");
}

export function readBrandStorage(storage: BrandStorage, key: string): string | null {
  const current = storage.getItem(key);
  if (current !== null) return current;
  const oldKey = legacyKey(key);
  if (oldKey === key) return null;
  const previous = storage.getItem(oldKey);
  if (previous === null) return null;
  try {
    storage.setItem(key, previous);
    storage.removeItem(oldKey);
  } catch {
    // Read-only storage can still provide the previous session for this tab.
  }
  return previous;
}

export function removeBrandStorage(storage: BrandStorage, key: string): void {
  // Remove the fallback first so a logout cannot resurrect a previous token.
  storage.removeItem(legacyKey(key));
  storage.removeItem(key);
}

export const brandStorage: BrandStorage = {
  getItem: (key) => readBrandStorage(window.localStorage, key),
  setItem(key, value) {
    window.localStorage.setItem(key, value);
    try {
      window.localStorage.removeItem(legacyKey(key));
    } catch {
      // The new value was already saved successfully.
    }
  },
  removeItem: (key) => removeBrandStorage(window.localStorage, key),
};
