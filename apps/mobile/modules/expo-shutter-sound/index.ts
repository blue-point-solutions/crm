import { requireNativeModule } from "expo-modules-core";

// expo-audio's playback path uses Android's FLAG_DEEP_BUFFER mode, which is
// built for power-efficient background audio (podcasts/music) and trades
// startup latency for battery savings -- real-device testing found this
// latency, compounded by an active camera capture session's system load,
// silently swallowed our ~80ms shutter-click clip before any sound reached
// the speaker. SoundPool is Android's purpose-built low-latency API for
// exactly this use case (short UI/game sound effects), so this module wraps
// it directly instead.
interface ExpoShutterSoundModule {
  preload(): Promise<void>;
  play(): void;
}

// The native module only exists in the Android build — on web (RN-Web e2e)
// requireNativeModule throws at import time, which would crash the whole
// bundle. Shutter sound is a nice-to-have there, so degrade to a no-op.
let ExpoShutterSound: ExpoShutterSoundModule | null = null;
try {
  ExpoShutterSound = requireNativeModule<ExpoShutterSoundModule>("ExpoShutterSound");
} catch {
  ExpoShutterSound = null;
}

export function preloadShutterSound(): Promise<void> {
  return ExpoShutterSound ? ExpoShutterSound.preload() : Promise.resolve();
}

export function playShutterSound(): void {
  ExpoShutterSound?.play();
}
