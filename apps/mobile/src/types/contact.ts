export interface OcrField {
  value: string;
  confidence: number; // 0-1
}

export interface OcrResult {
  firstName?: OcrField;
  lastName?: OcrField;
  jobTitle?: OcrField;
  company?: OcrField;
  phones: OcrField[];   // up to 3
  emails: OcrField[];   // up to 3
  website?: OcrField;
  address?: OcrField;
  linkedin?: OcrField;
  facebook?: OcrField;
}

export type MarketingConsent = "Yes" | "No" | "NotAsked";
export type LeadTemperature = "Hot" | "Warm" | "Cold";
export type ContactStatus = "Lead" | "Active" | "Inactive";
export type ContactSource = "BNI" | "TradeShow" | "Referral" | "WalkIn" | "Online" | "ColdOutreach" | "Other";
export type DecisionMaker = "Yes" | "No" | "Unknown";

export interface ContactDraft {
  // OCR fields (editable)
  firstName: string;
  lastName: string;
  jobTitle: string;
  company: string;
  phones: string[];
  emails: string[];
  website: string;
  address: string;
  linkedin: string;
  facebook: string;
  cardImageUri?: string;
  saveCardImage: boolean;

  // User-filled fields
  source: ContactSource | null;
  tags: string[];
  status: ContactStatus;
  marketingConsent: MarketingConsent | null; // null = not yet selected (blocks save)
  decisionMaker: DecisionMaker;
  leadTemperature: LeadTemperature | null;
  interests: string[];
  painPoint: string;
  notes: string;
  followUpDate?: string; // ISO date string
}
