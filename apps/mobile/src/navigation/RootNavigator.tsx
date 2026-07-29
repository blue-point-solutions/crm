import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RootStackParamList } from "./types";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import HomeScreen from "../screens/HomeScreen";
import CardScannerScreen from "../screens/CardScannerScreen";
import CameraPermissionScreen from "../screens/CameraPermissionScreen";
import CardScannerReviewScreen from "../screens/CardScannerReviewScreen";
import CardScannerContactDetailsScreen from "../screens/CardScannerContactDetailsScreen";
import CardScannerConfirmScreen from "../screens/CardScannerConfirmScreen";
import ContactsScreen from "../screens/ContactsScreen";
import ContactDetailScreen from "../screens/ContactDetailScreen";
import DashboardScreen from "../screens/DashboardScreen";
import BiometricConsentScreen from "../screens/BiometricConsentScreen";

import { restoreSession } from "../api/client";
import { getBiometricPreference } from "../utils/biometrics";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  // Cold-start bootstrap: restore the persisted session. With a session and
  // no biometric lock, land on Dashboard; with biometrics enabled, land on
  // Login where the stored session unlocks behind the biometric prompt.
  const [initialRoute, setInitialRoute] = useState<"Login" | "Dashboard" | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const restored = await restoreSession();
        if (!restored) {
          setInitialRoute("Login");
          return;
        }
        const preference = await getBiometricPreference();
        setInitialRoute(preference === "enabled" ? "Login" : "Dashboard");
      } catch {
        setInitialRoute("Login");
      }
    })();
  }, []);

  if (initialRoute === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#0c4aad" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Contacts" component={ContactsScreen} />
        <Stack.Screen name="CardScanner" component={CardScannerScreen} />
        <Stack.Screen name="CameraPermission" component={CameraPermissionScreen} />
        <Stack.Screen name="CardScannerReview" component={CardScannerReviewScreen} />
        <Stack.Screen name="CardScannerContactDetails" component={CardScannerContactDetailsScreen} />
        <Stack.Screen name="CardScannerConfirm" component={CardScannerConfirmScreen} />
        <Stack.Screen name="ContactDetail" component={ContactDetailScreen} />
        <Stack.Screen name="BiometricConsent" component={BiometricConsentScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
