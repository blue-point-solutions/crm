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
    const blob = await (await fetch(localUri)).blob();
    const put = await fetch(data.uploadUrl, {
      method: "PUT",
      headers: data.requiredHeaders,
      body: blob,
    });
    return put.ok ? data.publicUrl : null;
  } catch {
    return null;
  }
}
