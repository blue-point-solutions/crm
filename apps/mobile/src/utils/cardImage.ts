import { File } from "expo-file-system";

/**
 * Best-effort removal of a scanned-card temp image from the app cache
 * (security #52 — discarded card photos must not linger on disk). Only
 * touches file:// URIs; failures are swallowed (the cache is OS-purgeable
 * anyway, this just shortens the window).
 */
export function deleteCardImage(uri: string | undefined): void {
  if (!uri || !uri.startsWith("file://")) return;
  try {
    new File(uri).delete();
  } catch {
    // best-effort
  }
}
