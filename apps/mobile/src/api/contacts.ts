import client from "./client";

export interface ContactListItem {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email?: string;
  phone?: string;
  leadTemperature?: "Hot" | "Warm" | "Cold";
  source?: string;
  completenessScore: number; // 0-100
  dateAdded: string;
}

export interface ContactListParams {
  q?: string;
  tag?: string;
  status?: string;
  source?: string;
  leadTemperature?: string;
  page?: number;
}

export interface ContactListResponse {
  items: ContactListItem[];
  total: number;
  page: number;
}

export async function listContacts(params?: ContactListParams): Promise<ContactListResponse> {
  const { data } = await client.get<ContactListResponse>("/contacts", { params });
  return data;
}

export async function getDashboard() {
  const { data } = await client.get("/dashboard");
  return data;
}

export interface Activity {
  id: string;
  type: "note" | "call" | "email" | "meeting";
  content: string;
  createdAt: string;
}

export interface ContactDetail extends ContactListItem {
  jobTitle: string;
  emails: string[];
  phones: string[];
  website: string;
  address: string;
  linkedin: string;
  facebook: string;
  cardImageUri?: string;
  source: string;
  tags: string[];
  status: "Lead" | "Active" | "Inactive";
  marketingConsent: "Yes" | "No" | "NotAsked";
  decisionMaker: "Yes" | "No" | "Unknown";
  interests: string[];
  painPoint: string;
  notes: string;
  followUpDate?: string;
  activities: Activity[];
  lastActivityDate?: string;
}

export async function getContact(id: string): Promise<ContactDetail> {
  const { data } = await client.get<ContactDetail>(`/contacts/${id}`);
  return data;
}

export async function updateContact(id: string, patch: Partial<ContactDetail>): Promise<ContactDetail> {
  const { data } = await client.patch<ContactDetail>(`/contacts/${id}`, patch);
  return data;
}

export function getMockContactDetail(id: string): ContactDetail {
  const base = MOCK_CONTACTS.find((c) => c.id === id) ?? MOCK_CONTACTS[0];
  return {
    ...base,
    jobTitle: "Head of Partnerships",
    emails: base.email ? [base.email, `${base.firstName.toLowerCase()}@personal.com`] : [],
    phones: base.phone ? [base.phone, "+44 20 7946 0123"] : [],
    website: "https://apexsolutions.co.uk",
    address: "14 Canary Wharf, London, E14 5AB",
    linkedin: "https://linkedin.com/in/example",
    facebook: "https://facebook.com/example",
    cardImageUri: undefined,
    source: base.source ?? "BNI",
    tags: ["VIP", "Q3-Target", "Decision-Maker"],
    status: "Active",
    marketingConsent: "Yes",
    decisionMaker: "Yes",
    interests: ["SaaS", "Automation", "AI"],
    painPoint: "Struggling to scale outbound without losing personalisation at volume.",
    notes: "Met at BNI June breakfast. Keen on a demo before end of Q3. Prefers morning calls.",
    followUpDate: "2026-07-15",
    activities: [
      {
        id: "a1",
        type: "call",
        content: "Intro call — discussed pain points and demo timeline.",
        createdAt: "2026-06-22T10:00:00Z",
      },
      {
        id: "a2",
        type: "email",
        content: "Sent follow-up email with pricing deck attached.",
        createdAt: "2026-06-23T14:30:00Z",
      },
      {
        id: "a3",
        type: "note",
        content: "Confirmed they have budget approved for H2.",
        createdAt: "2026-06-25T09:15:00Z",
      },
    ],
    lastActivityDate: "2026-06-25T09:15:00Z",
  };
}

export const MOCK_CONTACTS: ContactListItem[] = [
  {
    id: "1",
    firstName: "Sarah",
    lastName: "Mitchell",
    company: "Apex Solutions Ltd",
    email: "s.mitchell@apexsolutions.co.uk",
    phone: "+44 7700 900123",
    leadTemperature: "Hot",
    source: "BNI",
    completenessScore: 92,
    dateAdded: "2026-06-20T09:14:00Z",
  },
  {
    id: "2",
    firstName: "James",
    lastName: "O'Brien",
    company: "Pinnacle Consulting",
    email: "jobrien@pinnacleconsult.com",
    phone: "+44 7700 900456",
    leadTemperature: "Warm",
    source: "TradeShow",
    completenessScore: 74,
    dateAdded: "2026-06-18T14:32:00Z",
  },
  {
    id: "3",
    firstName: "Priya",
    lastName: "Sharma",
    company: "NovaTech Industries",
    email: "priya.sharma@novatech.io",
    leadTemperature: "Hot",
    source: "Referral",
    completenessScore: 85,
    dateAdded: "2026-06-15T11:05:00Z",
  },
  {
    id: "4",
    firstName: "Marcus",
    lastName: "Webb",
    company: "Greenfield Partners",
    phone: "+44 7911 123456",
    leadTemperature: "Cold",
    source: "WalkIn",
    completenessScore: 41,
    dateAdded: "2026-06-10T16:48:00Z",
  },
  {
    id: "5",
    firstName: "Fiona",
    lastName: "Gallagher",
    company: "Horizon Digital",
    email: "fiona@horizondigital.net",
    phone: "+44 7800 654321",
    leadTemperature: "Warm",
    source: "Online",
    completenessScore: 61,
    dateAdded: "2026-06-08T10:22:00Z",
  },
  {
    id: "6",
    firstName: "Daniel",
    lastName: "Okonkwo",
    company: "Sterling Capital Group",
    email: "d.okonkwo@sterlingcg.com",
    phone: "+44 7500 111222",
    source: "ColdOutreach",
    completenessScore: 55,
    dateAdded: "2026-06-01T08:00:00Z",
  },
];
