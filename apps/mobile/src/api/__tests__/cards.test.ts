/**
 * Regression tests for the 2026-08-05 emulator finding: RN's fetch cannot
 * read file:// URIs on Android, so uploadCardImage must source native reads
 * from expo-file-system's File (a fetch-compatible Blob) — never
 * fetch(file://...). Web blob:/data: URIs keep the fetch path.
 */
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ __expoFile: uri })),
}));
jest.mock("../client", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import { File } from "expo-file-system";
import client from "../client";
import { uploadCardImage } from "../cards";

const mockPost = (client as unknown as { post: jest.Mock }).post;

const presign = {
  data: {
    uploadUrl: "https://r2.example/upload",
    requiredHeaders: { "content-type": "image/jpeg" },
    imageKey: "k",
    publicUrl: "https://pub.example/k.jpg",
    expiresAt: "2099-01-01T00:00:00Z",
  },
};

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue(presign);
  fetchMock = jest.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve("web-blob") });
  (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

describe("uploadCardImage", () => {
  it("native file:// reads via expo-file-system File, never fetch(file://)", async () => {
    const url = await uploadCardImage("file:///cache/card.jpg");
    expect(url).toBe("https://pub.example/k.jpg");
    expect(File).toHaveBeenCalledWith("file:///cache/card.jpg");
    // Exactly one fetch: the PUT. No fetch of the file:// URI.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [putUrl, opts] = fetchMock.mock.calls[0];
    expect(putUrl).toBe("https://r2.example/upload");
    expect(opts.method).toBe("PUT");
    expect(opts.body).toEqual({ __expoFile: "file:///cache/card.jpg" });
  });

  it("web blob: URIs read via fetch().blob()", async () => {
    const url = await uploadCardImage("blob:https://app/x");
    expect(url).toBe("https://pub.example/k.jpg");
    expect(File).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("blob:https://app/x");
    expect(fetchMock.mock.calls[1][1].body).toBe("web-blob");
  });

  it("returns null when the PUT fails, never throws", async () => {
    fetchMock.mockResolvedValue({ ok: false, blob: () => Promise.resolve("b") });
    await expect(uploadCardImage("file:///cache/card.jpg")).resolves.toBeNull();
  });
});
