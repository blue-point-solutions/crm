// TEMPORARY STAND-IN for the real contacts backend (blocked on ticket #8/#3,
// `platform-contacts` in the `library` repo). Persists contacts on-device via
// AsyncStorage instead of a server, so the scan -> save -> view flow actually
// works end-to-end today instead of being a UI-only mock.
//
// Deliberately shaped to match the real API client (api/contacts.ts)'s
// function signatures and return types (ContactListItem / ContactDetail) so
// swapping this out for real network calls later is close to a drop-in
// replacement at each call site, not a rewrite. Local contacts are merged
// with the existing MOCK_CONTACTS demo data in ContactsScreen, not a
// replacement for it.
//
// Known gap, by design: this has no concept of the things a real backend
// would need to handle (network failure, auth, multi-device sync, real
// server-side duplicate detection) -- callers still build for a "saving"/
// "error" state around these functions so that plumbing doesn't have to be
// invented later when the real API replaces this file.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ContactDetail, ContactListItem } from "./contacts";
import { ContactDraft } from "../types/contact";

const STORAGE_KEY = "@bpconnect/local_contacts";

function computeCompletenessScore(draft: ContactDraft): number {
  // Mirrors the weighting described in the project requirements doc.
  let score = 0;
  if (draft.emails.some((e) => e.trim())) score += 25;
  if (draft.phones.some((p) => p.trim())) score += 15;
  if (draft.company.trim()) score += 15;
  score += 10; // Industry -- not currently a captured field
  if (draft.jobTitle.trim()) score += 10;
  if (draft.source) score += 10;
  if (draft.marketingConsent !== null) score += 10;
  if (draft.notes.trim()) score += 5;
  return score;
}

function draftToContactDetail(draft: ContactDraft): ContactDetail {
  const now = new Date().toISOString();
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    firstName: draft.firstName,
    lastName: draft.lastName,
    company: draft.company,
    email: draft.emails[0],
    phone: draft.phones[0],
    leadTemperature: draft.leadTemperature ?? undefined,
    source: draft.source ?? "",
    completenessScore: computeCompletenessScore(draft),
    dateAdded: now,
    jobTitle: draft.jobTitle,
    emails: draft.emails,
    phones: draft.phones,
    website: draft.website,
    address: draft.address,
    linkedin: draft.linkedin,
    facebook: draft.facebook,
    cardImageUri: draft.saveCardImage ? draft.cardImageUri : undefined,
    tags: draft.tags,
    status: draft.status,
    marketingConsent: draft.marketingConsent ?? "NotAsked",
    decisionMaker: draft.decisionMaker,
    interests: draft.interests,
    painPoint: draft.painPoint,
    notes: draft.notes,
    followUpDate: draft.followUpDate,
    activities: [],
    lastActivityDate: undefined,
  };
}

async function readAll(): Promise<ContactDetail[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ContactDetail[];
  } catch {
    return [];
  }
}

async function writeAll(contacts: ContactDetail[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export async function createLocalContact(draft: ContactDraft): Promise<ContactDetail> {
  const detail = draftToContactDetail(draft);
  const all = await readAll();
  all.unshift(detail); // newest first
  await writeAll(all);
  return detail;
}

export async function listLocalContacts(): Promise<ContactListItem[]> {
  const all = await readAll();
  return all.map(({ activities: _activities, ...listItem }) => listItem);
}

export async function getLocalContact(id: string): Promise<ContactDetail | undefined> {
  const all = await readAll();
  return all.find((c) => c.id === id);
}
