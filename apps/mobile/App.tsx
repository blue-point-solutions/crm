import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import RootNavigator from "./src/navigation/RootNavigator";
import { ToastProvider } from "./src/components";
import UpdateGate from "./src/update/UpdateGate";

// Without a handler, a follow-up reminder firing while the app is open is
// silently dropped — and 9am with the CRM open is the likeliest overlap.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export default function App() {
  const [fontsLoaded] = useFonts({
    OmnesRegular: require("./assets/fonts/OmnesRegular.ttf"),
    OmnesMedium: require("./assets/fonts/OmnesMedium.ttf"),
    OmnesSemiBold: require("./assets/fonts/OmnesSemiBold.ttf"),
    OmnesBold: require("./assets/fonts/OmnesBold.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#0c4aad" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <RootNavigator />
        <UpdateGate />
        <StatusBar style="auto" />
      </ToastProvider>
    </SafeAreaProvider>
  );
}
