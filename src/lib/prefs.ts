import 'expo-sqlite/localStorage/install';

/** Device-local preferences. Every access is guarded: storage can be unavailable. */
export function getPref(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`boaroute.${key}`) ?? null;
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(`boaroute.${key}`);
    else globalThis.localStorage?.setItem(`boaroute.${key}`, value);
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}
