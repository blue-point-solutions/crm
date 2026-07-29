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
  CardScannerConfirm: undefined;
  ContactDetail: { contactId: string };
  BiometricConsent: undefined;
};
