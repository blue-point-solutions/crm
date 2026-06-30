export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  Contacts: undefined;
  CardScanner: { onCaptureDone?: string } | undefined;
  CameraPermission: undefined;
  CardScannerReview: { imageUri: string };
  CardScannerConfirm: undefined;
  ContactDetail: { contactId: string };
};
