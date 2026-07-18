package expo.modules.shuttersound

import android.media.AudioAttributes
import android.media.SoundPool
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// SoundPool is Android's purpose-built API for short, low-latency UI sound
// effects (camera shutters, game hits, button taps) -- unlike MediaPlayer/
// ExoPlayer (what expo-audio wraps), which defaults to a large, power-saving
// deep-buffer playback path meant for long-form audio. That deep-buffer
// startup latency, compounded by an active camera session's system load, was
// found to silently swallow a short capture-click clip before any sound
// reached the speaker on real hardware -- see the CRM app's shutter-sound
// investigation notes.
class ExpoShutterSoundModule : Module() {
  private var soundPool: SoundPool? = null
  private var soundId: Int = 0
  private var loaded = false

  private fun getOrCreateSoundPool(): SoundPool {
    return soundPool ?: run {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      SoundPool.Builder()
        .setMaxStreams(1)
        .setAudioAttributes(attributes)
        .build()
        .also { soundPool = it }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoShutterSound")

    AsyncFunction("preload") { promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val pool = getOrCreateSoundPool()

      if (loaded) {
        promise.resolve(null)
        return@AsyncFunction
      }

      pool.setOnLoadCompleteListener { _, sampleId, status ->
        if (sampleId == soundId) {
          loaded = status == 0
          promise.resolve(null)
        }
      }
      soundId = pool.load(context, R.raw.shutter_click, 1)
    }

    Function("play") {
      val pool = soundPool
      if (pool != null && loaded) {
        pool.play(soundId, 1.0f, 1.0f, /* priority */ 1, /* loop */ 0, /* rate */ 1.0f)
      }
    }

    OnDestroy {
      soundPool?.release()
      soundPool = null
      loaded = false
    }
  }
}
