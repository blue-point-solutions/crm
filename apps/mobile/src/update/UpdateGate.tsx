import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Platform } from "react-native";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as IntentLauncher from "expo-intent-launcher";
import { File, Paths } from "expo-file-system";
import {
  checkForUpdate,
  withCacheBust,
  type UpdateManifest,
} from "@platform/app-update/core";

// Sideloaded-app self-update (see library/packages/platform-app-update and
// schedule's 2026-06-26 design): on launch, compare the installed versionCode
// against the published manifest; offer (or force, when mandatory) a download
// that hands the verified APK to the OS installer.
const MANIFEST_URL = "https://apk.bpconnect.app/update.json";

// Android Intent.FLAG_GRANT_READ_URI_PERMISSION
const FLAG_GRANT_READ_URI_PERMISSION = 1;

async function sha256HexOf(bytes: Uint8Array): Promise<string> {
  // RN/Hermes has no crypto.subtle, so the library's verifySha256 is unusable
  // here; expo-crypto digests raw bytes instead.
  // .slice() re-homes the view in a plain ArrayBuffer to satisfy BufferSource.
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytes.slice() as Uint8Array<ArrayBuffer>,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function downloadAndInstall(manifest: UpdateManifest): Promise<void> {
  const target = new File(Paths.cache, `update-v${manifest.versionCode}.apk`);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(
    withCacheBust(manifest.apkUrl, Date.now()),
    target,
  );
  const actual = await sha256HexOf(await file.bytes());
  if (actual !== manifest.sha256.toLowerCase()) {
    file.delete();
    throw new Error("Downloaded APK failed its integrity check. Try again.");
  }
  await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
    data: file.contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

type Phase = "idle" | "prompt" | "downloading" | "error";

export default function UpdateGate() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [manifest, setManifest] = useState<UpdateManifest | null>(null);
  const [mandatory, setMandatory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const versionCode = Number(Application.nativeBuildVersion ?? 0);
    checkForUpdate(
      MANIFEST_URL,
      { versionCode, versionName: Application.nativeApplicationVersion ?? "0" },
      { cacheBust: Date.now() },
    )
      .then((result) => {
        if (result.updateAvailable) {
          setManifest(result.manifest);
          setMandatory(result.mandatory);
          setPhase("prompt");
        }
      })
      // Offline or manifest missing: never block the app on the update check.
      .catch(() => {});
  }, []);

  const install = useCallback(() => {
    if (!manifest) return;
    setPhase("downloading");
    downloadAndInstall(manifest)
      .then(() => setPhase(mandatory ? "prompt" : "idle"))
      .catch((e: Error) => {
        setError(e.message);
        setPhase("error");
      });
  }, [manifest, mandatory]);

  if (phase === "idle" || !manifest) return null;

  return (
    <Modal transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {phase === "downloading" ? "Downloading update…" : "Update available"}
          </Text>
          <Text style={styles.body}>
            Version {manifest.versionName}
            {manifest.notes ? `\n\n${manifest.notes}` : ""}
            {error ? `\n\n${error}` : ""}
          </Text>
          {phase === "downloading" ? (
            <ActivityIndicator color="#0c4aad" style={styles.spinner} />
          ) : (
            <View style={styles.row}>
              {!mandatory && (
                <Pressable style={styles.ghost} onPress={() => setPhase("idle")}>
                  <Text style={styles.ghostLabel}>Later</Text>
                </Pressable>
              )}
              <Pressable style={styles.primary} onPress={install}>
                <Text style={styles.primaryLabel}>
                  {phase === "error" ? "Retry" : "Update now"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  title: { fontFamily: "OmnesSemiBold", fontSize: 18, color: "#0c1c33" },
  body: { fontFamily: "OmnesRegular", fontSize: 14, color: "#41506b", marginTop: 8 },
  spinner: { marginTop: 16 },
  row: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 12 },
  primary: {
    backgroundColor: "#0c4aad",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  primaryLabel: { fontFamily: "OmnesMedium", color: "#fff", fontSize: 14 },
  ghost: { paddingVertical: 10, paddingHorizontal: 12 },
  ghostLabel: { fontFamily: "OmnesMedium", color: "#41506b", fontSize: 14 },
});
