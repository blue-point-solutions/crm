import { File } from "expo-file-system";
import client from "./client";

export interface UploadUrlResponse {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  imageKey: string;
  publicUrl: string;
  expiresAt: string;
}

/**
 * Uploads a scanned-card photo straight to R2 via a presigned URL and
 * returns its public URL for cardImageUri. Returns null on any failure —
 * card-image storage is best-effort and must never block saving the contact
 * (the API also 503s here when R2 isn't configured).
 */
export async function uploadCardImage(localUri: string): Promise<string | null> {
  try {
    const { data } = await client.post<UploadUrlResponse>("/cards/upload-url", {
      contentType: "image/jpeg",
    });
    const put = await fetch(data.uploadUrl, {
      method: "PUT",
      headers: data.requiredHeaders,
      body: await readLocalImage(localUri),
    });
    if (!put.ok) {
      // Message-only logging (no URL/PII): presigned URLs carry credentials.
      console.warn("[cards] card-image PUT rejected:", put.status);
    }
    return put.ok ? data.publicUrl : null;
  } catch (e) {
    console.warn(
      "[cards] card-image upload failed:",
      e instanceof Error ? e.message : String(e)
    );
    return null;
  }
}

/**
 * RN's fetch cannot read file:// URIs as a request source on Android — the
 * old `fetch(localUri).blob()` threw, the catch above returned null, and
 * every native save silently dropped its card image (2026-08-05 emulator
 * finding). expo-file-system's File implements the Blob interface and is
 * documented as a valid fetch body, so native reads go through it; web keeps
 * the fetch path for blob:/data: URIs.
 */
async function readLocalImage(localUri: string): Promise<Blob> {
  if (localUri.startsWith("file://")) {
    return new File(localUri) as unknown as Blob;
  }
  return (await fetch(localUri)).blob();
}
