import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RootStackParamList } from "./types";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import HomeScreen from "../screens/HomeScreen";
import CardScannerScreen from "../screens/CardScannerScreen";
import CameraPermissionScreen from "../screens/CameraPermissionScreen";
import CardScannerReviewScreen from "../screens/CardScannerReviewScreen";
import CardScannerConfirmScreen from "../screens/CardScannerConfirmScreen";
import ContactsScreen from "../screens/ContactsScreen";
import ContactDetailScreen from "../screens/ContactDetailScreen";
import DashboardScreen from "../screens/DashboardScreen";
import BiometricConsentScreen from "../screens/BiometricConsentScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
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
        <Stack.Screen name="CardScannerConfirm" component={CardScannerConfirmScreen} />
        <Stack.Screen name="ContactDetail" component={ContactDetailScreen} />
        <Stack.Screen name="BiometricConsent" component={BiometricConsentScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
