import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { CameraView, CameraType, FlashMode } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { requestPhotoLibraryPermission } from "../utils/permissions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardScannerScreenProps {
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
}

type NavigationProps = NativeStackScreenProps<RootStackParamList, "CardScanner">;

// ---------------------------------------------------------------------------
// Exported detection hook (wired in externally when real ML is available)
// ---------------------------------------------------------------------------

/** Call this from a real ML edge-detection module to signal card presence. */
export let setCardDetected: (detected: boolean) => void = () => undefined;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = Partial<CardScannerScreenProps> & Partial<NavigationProps>;

export default function CardScannerScreen({ onCapture, onCancel, navigation }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Camera state
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  // Capture state
  const [isProcessing, setIsProcessing] = useState(false);

  // Card bounding box dimensions (3.5 : 2 aspect ratio, 85% screen width)
  const boxWidth = screenWidth * 0.85;
  const boxHeight = boxWidth * (2 / 3.5);

  // ---------------------------------------------------------------------------
  // Auto-capture
  // ---------------------------------------------------------------------------

  // Longest edge to resize to after cropping, before handing off to OCR.
  // Real-device testing found the old fixed 856x540 *squish* (no crop, plus a
  // portrait->landscape aspect distortion) left card text only a few pixels
  // tall once the card was a small fraction of a full-frame photo -- nowhere
  // near enough resolution for ML Kit to read reliably. 1600px keeps text
  // legible while still being far smaller than a raw 12MP capture.
  const OCR_TARGET_LONG_EDGE = 1600;

  const handleCapture = useCallback(
    async (uri: string, cropRegion?: { originX: number; originY: number; width: number; height: number }) => {
      // TODO: Real perspective correction (for an angled/skewed photo of the
      // card) requires OpenCV or an ML-based homography transform --
      // expo-image-manipulator only supports affine ops (crop/resize/rotate/
      // flip), so this only does a straight rectangular crop to the on-screen
      // guide box, not true corner-to-corner correction.
      const actions: ImageManipulator.Action[] = [];
      if (cropRegion) {
        actions.push({ crop: cropRegion });
      }
      const cropWidth = cropRegion?.width;
      if (cropWidth) {
        actions.push({ resize: { width: Math.min(cropWidth, OCR_TARGET_LONG_EDGE) } });
      } else {
        // Gallery-imported images have no known guide-box region to crop to
        // (the user picked an arbitrary photo) -- just cap the long edge,
        // preserving aspect ratio rather than forcing a fixed distorted size.
        actions.push({ resize: { width: OCR_TARGET_LONG_EDGE } });
      }

      const result = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      if (onCapture) {
        onCapture(result.uri);
      } else if (navigation) {
        // Navigate to review screen with the captured image URI
        navigation.navigate("CardScannerReview", { imageUri: result.uri });
      }
    },
    [onCapture, navigation]
  );

  const captureCard = useCallback(async () => {
    if (!cameraRef.current || isProcessing) return;

    setIsProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92 });
      if (!photo) return;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Brief "Processing…" freeze (500 ms) before calling back
      await new Promise<void>((resolve) => setTimeout(resolve, 500));

      // Map the on-screen guide box (85% of screen width, vertically centred,
      // 3.5:2 card aspect ratio) onto the actual captured photo's pixel
      // dimensions -- the preview fills the screen 1:1 with what's captured,
      // so the crop region is the same fraction of the photo as the box is
      // of the screen.
      const cropWidthFrac = boxWidth / screenWidth;
      const cropHeightFrac = boxHeight / screenHeight;
      const cropRegion = {
        width: Math.round(photo.width * cropWidthFrac),
        height: Math.round(photo.height * cropHeightFrac),
        originX: Math.round((photo.width - photo.width * cropWidthFrac) / 2),
        originY: Math.round((photo.height - photo.height * cropHeightFrac) / 2),
      };

      await handleCapture(photo.uri, cropRegion);
    } catch (err) {
      console.warn("[CardScanner] captureCard error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, handleCapture, boxWidth, boxHeight, screenWidth, screenHeight]);

  // No auto-capture — user presses the shutter button to capture.

  // ---------------------------------------------------------------------------
  // Gallery import
  // ---------------------------------------------------------------------------

  const handleGalleryImport = useCallback(async () => {
    const granted = await requestPhotoLibraryPermission();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.92,
    });

    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      await handleCapture(uri);
    }
  }, [handleCapture]);

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else if (navigation) {
      navigation.goBack();
    }
  }, [onCancel, navigation]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={"back" as CameraType}
        enableTorch={torchEnabled}
        onCameraReady={() => setIsCameraReady(true)}
      />

      {/* Dark overlay with transparent card window */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Top dark band */}
        <View style={styles.overlayTop} />

        {/* Middle row: left dark band | card window | right dark band */}
        <View style={[styles.overlayMiddleRow, { height: boxHeight }]}>
          <View style={styles.overlaySide} />
          {/* Card window — transparent, bordered */}
          <View
            style={[
              styles.cardBox,
              { width: boxWidth, height: boxHeight },
            ]}
          />
          <View style={styles.overlaySide} />
        </View>

        {/* Bottom dark band */}
        <View style={styles.overlayBottom} />
      </View>

      {/* Guidance text */}
      <View
        style={[
          styles.guidancePill,
          { top: "50%" as unknown as number, marginTop: boxHeight / 2 + 16 },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.guidanceText}>
          Align card within the frame, then tap the button
        </Text>
      </View>

      {/* Top-left: Cancel */}
      <TouchableOpacity
        style={[styles.topButton, styles.topLeft]}
        onPress={handleCancel}
        accessibilityLabel="Cancel"
      >
        <Text style={styles.iconText}>✕</Text>
      </TouchableOpacity>

      {/* Top-right: Flash toggle */}
      <TouchableOpacity
        style={[styles.topButton, styles.topRight]}
        onPress={() => setTorchEnabled((v) => !v)}
        accessibilityLabel={torchEnabled ? "Flash on" : "Flash off"}
      >
        <Text style={[styles.iconText, torchEnabled && styles.iconActive]}>⚡</Text>
      </TouchableOpacity>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        {/* Gallery import */}
        <TouchableOpacity
          style={styles.galleryButton}
          onPress={handleGalleryImport}
          accessibilityLabel="Import from Photos"
        >
          <Text style={styles.iconText}>🖼</Text>
          <Text style={styles.galleryLabel}>Photos</Text>
        </TouchableOpacity>

        {/* Manual shutter */}
        <TouchableOpacity
          style={styles.shutterOuter}
          onPress={captureCard}
          disabled={isProcessing}
          accessibilityLabel="Capture card"
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        {/* Spacer to balance gallery button */}
        <View style={styles.bottomSpacer} />
      </View>

      {/* Processing overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>Processing…</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const OVERLAY_BG = "rgba(0,0,0,0.55)";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },

  // Overlay bands
  overlayTop: {
    flex: 1,
    backgroundColor: OVERLAY_BG,
  },
  overlayMiddleRow: {
    flexDirection: "row",
  },
  overlaySide: {
    flex: 1,
    backgroundColor: OVERLAY_BG,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: OVERLAY_BG,
  },

  // Card bounding box
  cardBox: {
    borderWidth: 2,
    borderRadius: 8,
    backgroundColor: "transparent",
  },

  // Guidance pill
  guidancePill: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
  },
  guidanceText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },

  // Top buttons
  topButton: {
    position: "absolute",
    top: 52,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  topLeft: {
    left: 20,
  },
  topRight: {
    right: 20,
  },
  iconText: {
    color: "#fff",
    fontSize: 20,
  },
  iconActive: {
    color: "#f1c40f",
  },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  galleryButton: {
    alignItems: "center",
    width: 64,
  },
  galleryLabel: {
    color: "#fff",
    fontSize: 11,
    marginTop: 4,
  },
  bottomSpacer: {
    width: 64,
  },

  // Shutter
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#888",
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },

  // Processing overlay
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  processingText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
