package expo.modules.boaroutedrive

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val WAZE = "com.waze"

/**
 * Driving helpers for BOAROUTE:
 * - Voice notes (speed camera / police) played as navigation guidance with a
 *   transient "may duck" audio focus request, so Waze and Spotify dip under
 *   the note and come straight back. Playback works while another app is in
 *   front because the hazard foreground service keeps the process alive.
 * - Instant hand-off to Waze and the Screen Saver shortcuts (Spotify, email).
 */
class BoaRouteDriveModule : Module() {
  private var player: MediaPlayer? = null
  private var pending: Promise? = null
  private var focusRequest: AudioFocusRequest? = null
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    // A phone call or another nav prompt takes over: drop this note rather than talk over it.
    if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) finish(false)
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val audioManager: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  override fun definition() = ModuleDefinition {
    Name("BoaRouteDrive")

    Function("isAppInstalled") { packageName: String -> isInstalled(packageName) }

    Function("launchApp") { packageName: String ->
      val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return@Function false
      start(intent)
    }

    Function("launchEmail") {
      val inbox = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_EMAIL)
      start(inbox) || start(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:")))
    }

    // Opens Waze straight into navigation. Without Waze, its Play Store page.
    Function("launchWaze") { lat: Double, lng: Double ->
      val link = Uri.parse("https://waze.com/ul?ll=$lat,$lng&navigate=yes&zoom=17")
      if (isInstalled(WAZE)) {
        start(Intent(Intent.ACTION_VIEW, link).setPackage(WAZE)) || start(Intent(Intent.ACTION_VIEW, link))
      } else {
        start(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$WAZE"))) || start(Intent(Intent.ACTION_VIEW, link))
      }
    }

    // Resolves true when the note finished, false when it was replaced or interrupted.
    AsyncFunction("playVoiceNote") { uri: String, volume: Double, promise: Promise ->
      finish(false)
      val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
      if (!requestFocus(attrs)) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val level = volume.coerceIn(0.0, 1.0).toFloat()
      val mp = MediaPlayer()
      player = mp
      pending = promise
      try {
        mp.setAudioAttributes(attrs)
        mp.setDataSource(context, Uri.parse(uri))
        mp.setVolume(level, level)
        mp.setOnPreparedListener { if (player === it) it.start() }
        mp.setOnCompletionListener { if (player === it) finish(true) }
        mp.setOnErrorListener { p, what, extra ->
          if (player === p) fail("E_VOICE_NOTE", "Playback failed ($what/$extra)")
          true
        }
        mp.prepareAsync()
      } catch (e: Exception) {
        fail("E_VOICE_NOTE", e.message ?: "Could not play the voice note")
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopVoiceNote") { finish(false) }.runOnQueue(Queues.MAIN)

    OnDestroy { finish(false) }
  }

  private fun isInstalled(packageName: String): Boolean = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
    } else {
      @Suppress("DEPRECATION")
      context.packageManager.getPackageInfo(packageName, 0)
    }
    true
  } catch (_: PackageManager.NameNotFoundException) {
    false
  }

  private fun start(intent: Intent): Boolean {
    val activity = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (_: ActivityNotFoundException) {
      false
    } catch (_: SecurityException) {
      false
    }
  }

  private fun requestFocus(attrs: AudioAttributes): Boolean {
    val am = audioManager
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attrs)
        .setOnAudioFocusChangeListener(focusListener)
        .build()
      focusRequest = req
      am.requestAudioFocus(req)
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    }
    return granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun abandonFocus() {
    val am = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(focusListener)
    }
  }

  private fun release() {
    player?.let {
      it.setOnCompletionListener(null)
      it.setOnErrorListener(null)
      it.setOnPreparedListener(null)
      try {
        it.stop()
      } catch (_: IllegalStateException) {
        // Not started yet.
      }
      it.release()
    }
    player = null
    abandonFocus()
  }

  private fun finish(completed: Boolean) {
    val p = pending
    pending = null
    release()
    p?.resolve(completed)
  }

  private fun fail(code: String, message: String) {
    val p = pending
    pending = null
    release()
    p?.reject(code, message, null)
  }
}
