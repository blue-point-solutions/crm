import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Local follow-up reminders — no server push infra. Each contact has at most
 * one scheduled reminder (identifier = contact id, so re-scheduling
 * replaces). Permission is requested lazily on the first schedule; a denial
 * degrades silently (the Dashboard's Upcoming Follow-ups list still covers
 * the use case).
 */

const CHANNEL_ID = "follow-ups";
const REMINDER_HOUR = 9; // local time on the follow-up day

let _channelReady = false;

async function ensureReady(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status } = await Notifications.getPermissionsAsync();
  let granted = status === "granted";
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.status === "granted";
  }
  if (!granted) return false;
  if (Platform.OS === "android" && !_channelReady) {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Follow-up reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    _channelReady = true;
  }
  return true;
}

/**
 * Schedule (or replace) the follow-up reminder for a contact.
 * `followUpDate` is ISO (date or datetime); fires at 9am local that day.
 * Past dates are ignored. Returns true when scheduled.
 */
export async function scheduleFollowUpReminder(
  contactId: string,
  contactName: string,
  followUpDate: string
): Promise<boolean> {
  try {
    const day = followUpDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const fireAt = new Date(`${day}T${String(REMINDER_HOUR).padStart(2, "0")}:00:00`);
    if (Number.isNaN(fireAt.getTime()) || fireAt.getTime() <= Date.now()) return false;
    if (!(await ensureReady())) return false;
    await Notifications.cancelScheduledNotificationAsync(contactId).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: contactId,
      content: {
        title: "Follow-up due",
        body: `Time to follow up with ${contactName || "a contact"}.`,
        data: { contactId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: CHANNEL_ID,
      },
    });
    // A resolved schedule call is not proof the OS registered the alarm
    // (2026-07-30 e2e finding: suspected silent no-op in the release build)
    // — read the store back so a drop is a visible `false`, not a phantom
    // success.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const registered = scheduled.some((n) => n.identifier === contactId);
    if (!registered) {
      console.warn(`[reminders] OS did not register follow-up reminder for contact ${contactId}`);
    }
    return registered;
  } catch (err) {
    // Reminders are best-effort and never block a save, but the failure has
    // to be observable (no contact PII in the log — id only).
    console.warn(
      `[reminders] failed to schedule follow-up for contact ${contactId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/** Remove the contact's reminder (follow-up cleared or contact deleted). */
export async function cancelFollowUpReminder(contactId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.cancelScheduledNotificationAsync(contactId);
  } catch {
    // best-effort
  }
}
