import { File } from "expo-file-system";

/**
 * Best-effort removal of a scanned-card temp image from the app cache
 * (security #52 — discarded card photos must not linger on disk). Only
 * touches file:// URIs; failures are swallowed (the cache is OS-purgeable
 * anyway, this just shortens the window).
 */
export function deleteCardImage(uri: string | undefined): void {
  if (!uri) return;
  // Web upload flow: expo-image-picker hands back a blob: object URL — there
  // is no file on disk, but the in-memory blob lives until revoked.
  if (uri.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(uri);
    } catch {
      // best-effort
    }
    return;
  }
  if (!uri.startsWith("file://")) return;
  try {
    new File(uri).delete();
  } catch {
    // best-effort
  }
}
