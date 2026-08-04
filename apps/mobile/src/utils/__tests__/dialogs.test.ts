/**
 * RN-Web's Alert.alert is a silent no-op, so on web the dialogs util must
 * route through window.alert/window.confirm — otherwise destructive confirms
 * (discard scan/edits) can never be answered in the browser.
 */
import { Alert, Platform } from "react-native";
import { confirmDialog, showAlert } from "../dialogs";

describe("dialogs on native", () => {
  it("confirmDialog resolves true when the confirm button is pressed", async () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      const confirm = buttons?.find((b) => b.style !== "cancel");
      confirm?.onPress?.();
    });
    await expect(
      confirmDialog({ title: "Discard?", message: "Sure?", confirmLabel: "Discard" })
    ).resolves.toBe(true);
    spy.mockRestore();
  });

  it("confirmDialog resolves false when cancelled", async () => {
    const spy = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      const cancel = buttons?.find((b) => b.style === "cancel");
      cancel?.onPress?.();
    });
    await expect(
      confirmDialog({ title: "Discard?", message: "Sure?", confirmLabel: "Discard" })
    ).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("dialogs on web", () => {
  const g = globalThis as { window?: unknown };
  let platformReplaced: { restore(): void };
  let originalWindow: unknown;

  beforeEach(() => {
    platformReplaced = jest.replaceProperty(Platform, "OS", "web");
    originalWindow = g.window;
  });

  afterEach(() => {
    platformReplaced.restore();
    g.window = originalWindow;
  });

  it("confirmDialog uses window.confirm", async () => {
    const confirm = jest.fn().mockReturnValue(true);
    g.window = { confirm };
    await expect(
      confirmDialog({ title: "Discard?", message: "Sure?", confirmLabel: "Discard" })
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith("Discard?\n\nSure?");
  });

  it("showAlert uses window.alert with title and message", () => {
    const alert = jest.fn();
    g.window = { alert };
    showAlert("Error", "Could not open photo library.");
    expect(alert).toHaveBeenCalledWith("Error\n\nCould not open photo library.");
  });
});
