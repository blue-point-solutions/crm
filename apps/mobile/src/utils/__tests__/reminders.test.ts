/**
 * Regression tests for the 2026-07-30 e2e finding: a follow-up reminder was
 * never observably scheduled and the silent try/catch masked whatever failed.
 * The trigger we pass is validated against the REAL expo-notifications SDK 56
 * `parseTrigger` (not a hand-rolled imitation), and the new
 * read-back-after-schedule check is covered for both outcomes.
 */
import { scheduleFollowUpReminder, cancelFollowUpReminder } from "../reminders";
import * as Notifications from "expo-notifications";

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  // Real enum values — a drifted mock here would defeat the point.
  SchedulableTriggerInputTypes: jest.requireActual(
    "expo-notifications/build/Notifications.types"
  ).SchedulableTriggerInputTypes,
}));

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;
// parseTrigger's module imports the native scheduler at module scope.
jest.mock("expo-notifications/build/NotificationScheduler", () => ({
  __esModule: true,
  default: {},
}));

const { parseTrigger } = jest.requireActual(
  "expo-notifications/build/scheduleNotificationAsync"
);

const CONTACT_ID = "c0ffee00-1111-2222-3333-444455556666";
const FUTURE_DAY = "2099-05-20";

function grantPermission() {
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "granted" } as Notifications.NotificationPermissionsStatus);
}

function registeredInStore() {
  mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: CONTACT_ID } as Notifications.NotificationRequest,
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  mockNotifications.scheduleNotificationAsync.mockResolvedValue(CONTACT_ID);
  mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("scheduleFollowUpReminder", () => {
  it("schedules with a trigger the real SDK 56 parseTrigger accepts, at 9am local on the follow-up day", async () => {
    grantPermission();
    registeredInStore();

    await expect(
      scheduleFollowUpReminder(CONTACT_ID, "Jane Smith", FUTURE_DAY)
    ).resolves.toBe(true);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const request = mockNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(request.identifier).toBe(CONTACT_ID);
    expect(request.content.data).toEqual({ contactId: CONTACT_ID });

    // The exact regression: does the shape we send survive the library's own
    // validation and come out as a date trigger (not silently drop through
    // to the Android bare-channel fallback)?
    const parsed = parseTrigger(request.trigger);
    expect(parsed).toEqual({
      type: "date",
      timestamp: new Date(`${FUTURE_DAY}T09:00:00`).getTime(),
      channelId: "follow-ups",
    });
  });

  it("replaces any existing reminder for the contact (cancel before schedule)", async () => {
    grantPermission();
    registeredInStore();

    await scheduleFollowUpReminder(CONTACT_ID, "Jane Smith", FUTURE_DAY);

    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      CONTACT_ID
    );
  });

  it("returns false when the OS store does not contain the reminder after scheduling (silent native drop)", async () => {
    grantPermission();
    mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);

    await expect(
      scheduleFollowUpReminder(CONTACT_ID, "Jane Smith", FUTURE_DAY)
    ).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns false for a past follow-up date without touching the scheduler", async () => {
    grantPermission();

    await expect(
      scheduleFollowUpReminder(CONTACT_ID, "Jane Smith", "2001-01-01")
    ).resolves.toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("returns false for a malformed date without touching the scheduler", async () => {
    grantPermission();

    await expect(
      scheduleFollowUpReminder(CONTACT_ID, "Jane Smith", "soon")
    ).resolves.toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("returns false when permission is denied and not re-grantable", async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "denied" } as Notifications.NotificationPermissionsStatus);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: "denied" } as Notifications.NotificationPermissionsStatus);

    await expect(
      scheduleFollowUpReminder(CONTACT_ID, "Jane Smith", FUTURE_DAY)
    ).resolves.toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("returns false and warns (never throws) when the scheduler rejects", async () => {
    grantPermission();
    mockNotifications.scheduleNotificationAsync.mockRejectedValue(
      new Error("native module unavailable")
    );

    await expect(
      scheduleFollowUpReminder(CONTACT_ID, "Jane Smith", FUTURE_DAY)
    ).resolves.toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("cancelFollowUpReminder", () => {
  it("cancels by contact id and swallows errors", async () => {
    mockNotifications.cancelScheduledNotificationAsync.mockRejectedValue(
      new Error("boom")
    );
    await expect(cancelFollowUpReminder(CONTACT_ID)).resolves.toBeUndefined();
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      CONTACT_ID
    );
  });
});
