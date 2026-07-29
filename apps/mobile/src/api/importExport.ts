import client from "./client";

export interface ImportPreview {
  columns: string[];
  totalRows: number;
  sampleRows: string[][];
  suggestedMapping: Record<string, string>;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: { rowNumber: number; message: string }[];
}

/** Contact fields the import mapping editor can target, in display order. */
export const IMPORT_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "email",
  "phone",
  "website",
  "address",
  "notes",
  "source",
  "tags",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
}

function fileFormData(file: PickedFile): FormData {
  const form = new FormData();
  // RN multipart file part: {uri, name, type}. On web the uri is a blob URL
  // the picker already resolved.
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType ?? "application/octet-stream",
  } as unknown as Blob);
  return form;
}

export async function importPreview(file: PickedFile): Promise<ImportPreview> {
  const { data } = await client.post<ImportPreview>("/import/preview", fileFormData(file), {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function runImport(
  file: PickedFile,
  mapping: Record<string, string>
): Promise<ImportResult> {
  const form = fileFormData(file);
  form.append("mapping", JSON.stringify(mapping));
  const { data } = await client.post<ImportResult>("/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function fetchExport(format: "csv" | "xlsx"): Promise<ArrayBuffer> {
  const { data } = await client.get<ArrayBuffer>("/export", {
    params: { format },
    responseType: "arraybuffer",
  });
  return data;
}
