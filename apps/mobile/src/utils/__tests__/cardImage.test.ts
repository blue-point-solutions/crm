/**
 * Security #52 on web: the upload flow's blob: object URL has no disk file to
 * delete, but it must still be revoked or the image lingers in memory for the
 * whole page session.
 */
jest.mock("expo-file-system", () => ({ File: jest.fn() }));

import { deleteCardImage } from "../cardImage";

describe("deleteCardImage", () => {
  it("revokes blob: object URLs (web upload flow)", () => {
    const revoke = jest.fn();
    (globalThis as unknown as { URL: { revokeObjectURL: jest.Mock } }).URL.revokeObjectURL =
      revoke;
    deleteCardImage("blob:https://app.bpconnect.app/1234");
    expect(revoke).toHaveBeenCalledWith("blob:https://app.bpconnect.app/1234");
  });

  it("ignores non-file, non-blob URIs", () => {
    expect(() => deleteCardImage("https://example.com/x.jpg")).not.toThrow();
    expect(() => deleteCardImage(undefined)).not.toThrow();
  });
});
