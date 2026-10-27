package expo.modules.boaroutecar

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/**
 * The co-pilot voice: the recorded speed camera notes (res/raw, copied there
 * by plugins/withAndroidAuto.js) and short spoken police warnings.
 *
 * Each warning takes transient, duckable audio focus as navigation guidance,
 * so Spotify or BOA Radio drops in volume, the warning plays clearly (Android
 * Auto routes guidance to the car speakers over whichever app is on screen,
 * Waze and Google Maps included), and focus is given back when the queue is
 * empty so the music comes back up. Warnings that arrive together queue
 * rather than talk over each other. Main thread only.
 */
object CoPilotAudio {
  private sealed interface Cue
  private data class Clip(val name: String) : Cue
  private data class Say(val text: String) : Cue

  private val main = Handler(Looper.getMainLooper())
  private val queue = ArrayDeque<Cue>()
  private var busy = false
  private var player: MediaPlayer? = null
  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var focusRequest: AudioFocusRequest? = null
  private var holdingFocus = false

  private val attributes: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()

  /** Starts the speech engine early so the first police warning is not lost to its start-up. */
  fun warmUp(context: Context) = main.post { ensureTts(context.applicationContext) }

  /** Plays res/raw/<name> (e.g. camera_approaching). */
  fun play(context: Context, name: String) = main.post { enqueue(context.applicationContext, Clip(name)) }

  fun say(context: Context, text: String) = main.post { enqueue(context.applicationContext, Say(text)) }

  private fun enqueue(ctx: Context, cue: Cue) {
    queue.addLast(cue)
    if (!busy) next(ctx)
  }

  private fun next(ctx: Context) {
    val cue = queue.removeFirstOrNull()
    if (cue == null) {
      busy = false
      abandonFocus(ctx)
      return
    }
    busy = true
    // Refused during a phone call: drop the backlog rather than talk over the call.
    if (!holdingFocus && !requestFocus(ctx)) {
      queue.clear()
      busy = false
      return
    }
    when (cue) {
      is Clip -> playClip(ctx, cue.name)
      is Say -> speak(ctx, cue.text)
    }
  }

  private fun playClip(ctx: Context, name: String) {
    val id = ctx.resources.getIdentifier(name, "raw", ctx.packageName)
    val audio = ctx.getSystemService(AudioManager::class.java)
    val mp = if (id == 0) null else MediaPlayer.create(ctx, id, attributes, audio.generateAudioSessionId())
    if (mp == null) return next(ctx)
    player = mp
    mp.setOnCompletionListener {
      it.release()
      player = null
      next(ctx)
    }
    mp.setOnErrorListener { p, _, _ ->
      p.release()
      player = null
      next(ctx)
      true
    }
    mp.start()
  }

  private fun speak(ctx: Context, text: String) {
    val engine = tts
    if (engine == null || !ttsReady) {
      ensureTts(ctx)
      return next(ctx)
    }
    engine.speak(text, TextToSpeech.QUEUE_ADD, null, "boaroute-${System.nanoTime()}")
  }

  private fun ensureTts(ctx: Context) {
    if (tts != null) return
    lateinit var engine: TextToSpeech
    engine = TextToSpeech(ctx) { status ->
      ttsReady = status == TextToSpeech.SUCCESS
      if (!ttsReady) return@TextToSpeech
      engine.setLanguage(Locale.UK)
      engine.setAudioAttributes(attributes)
      engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {}
        override fun onDone(utteranceId: String?) { main.post { next(ctx) } }
        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) { main.post { next(ctx) } }
      })
    }
    tts = engine
  }

  private fun requestFocus(ctx: Context): Boolean {
    val audio = ctx.getSystemService(AudioManager::class.java)
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributes)
        .setWillPauseWhenDucked(false)
        .setOnAudioFocusChangeListener { }
        .build()
      focusRequest = request
      audio.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audio.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    }
    holdingFocus = granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    return holdingFocus
  }

  private fun abandonFocus(ctx: Context) {
    if (!holdingFocus) return
    val audio = ctx.getSystemService(AudioManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { audio.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      audio.abandonAudioFocus(null)
    }
    focusRequest = null
    holdingFocus = false
  }
}
