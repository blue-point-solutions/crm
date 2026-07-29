import type { ContactDraft } from "../types/contact";

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Dashboard: undefined;
  Contacts: undefined;
  CardScanner: { onCaptureDone?: string } | undefined;
  CameraPermission: undefined;
  CardScannerReview: { imageUri: string };
  CardScannerContactDetails: { draft: ContactDraft };
  CardScannerConfirm: {
    contactId: string;
    contactName: string;
    duplicatesCount: number;
  };
  ContactDetail: { contactId: string };
  BiometricConsent: undefined;
};
