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
