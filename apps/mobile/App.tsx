import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { View, ActivityIndicator } from "react-native";
import RootNavigator from "./src/navigation/RootNavigator";

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
    <>
      <RootNavigator />
      <StatusBar style="auto" />
    </>
  );
}
