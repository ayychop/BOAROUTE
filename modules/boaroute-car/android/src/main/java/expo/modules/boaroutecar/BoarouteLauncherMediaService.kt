package expo.modules.boaroutecar

import android.media.MediaDescription
import android.media.MediaMetadata
import android.media.browse.MediaBrowser
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.media.MediaBrowserService
import java.text.DateFormat
import java.util.Date
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * BOAROUTE's media entry, declared by plugins/withAndroidAuto.js. It first got
 * the sideloaded app into the Android Auto launcher, but it is also what a
 * split-screen car (BMW) draws in its side panel while another app (Waze) has
 * the map, so it serves the same status as NavScreen as a browse list:
 *
 * - one action row: Start Visit, End Visit, or "Open phone to start route";
 * - the next turn while BOAROUTE is routing;
 * - the stores ahead (tap one to start a visit there);
 * - the running group lunch order.
 *
 * The now-playing card mirrors the action row and carries Start Visit / End
 * Visit as custom actions. Presses go to JS through CarState.emit exactly as
 * the car screen's buttons do.
 */
class BoarouteLauncherMediaService : MediaBrowserService() {
  private lateinit var session: MediaSession
  private val handler = Handler(Looper.getMainLooper())
  private var shownKey = ""
  /** A short reply to a press ("Visit started at ..."), shown on the card for a few seconds. */
  private var notice: String? = null

  private val onState: () -> Unit = { refresh() }
  private val clearNotice = Runnable { notice = null; refresh() }

  /** The visit countdown is shown in whole minutes; check it a few times a minute. */
  private val tick = object : Runnable {
    override fun run() {
      refresh()
      if ((CarState.visit?.lockRemainingMs() ?: 0) > 0) handler.postDelayed(this, 15_000)
    }
  }

  override fun onCreate() {
    super.onCreate()
    // Android Auto refuses to connect to a browser without a session token.
    session = MediaSession(this, "BOAROUTE")
    session.setCallback(object : MediaSession.Callback() {
      override fun onPlayFromMediaId(mediaId: String, extras: Bundle?) = onPress(mediaId)
      override fun onPlay() = onPress(primary().id)
      override fun onCustomAction(action: String, extras: Bundle?) = onPress(action)
    })
    session.isActive = true
    sessionToken = session.sessionToken
    CarState.addListener(onState)
    CarState.panelToaster = { text -> showNotice(text) }
    refresh()
  }

  override fun onDestroy() {
    CarState.removeListener(onState)
    CarState.panelToaster = null
    handler.removeCallbacksAndMessages(null)
    session.release()
    super.onDestroy()
  }

  override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot =
    BrowserRoot(ROOT, Bundle().apply { putInt(CONTENT_STYLE_PLAYABLE, CONTENT_STYLE_LIST) })

  override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaBrowser.MediaItem>>) {
    if (parentId != ROOT) return result.sendResult(mutableListOf())
    result.sendResult(rows().map { it.item() }.toMutableList())
  }

  /** One row of the side panel. The id says what tapping it does. */
  private data class Row(val id: String, val title: String, val subtitle: String?) {
    fun item() = MediaBrowser.MediaItem(
      MediaDescription.Builder().setMediaId(id).setTitle(title).setSubtitle(subtitle).build(),
      MediaBrowser.MediaItem.FLAG_PLAYABLE,
    )
  }

  /** Start Visit, End Visit, or the pointer to the phone; never empty, so the panel never says "No items". */
  private fun primary(): Row {
    val visit = CarState.visit
    val start = CarState.start
    return when {
      CarState.emit == null -> Row(OPEN_PHONE, "Open phone to start route", "Open BOAROUTE on your phone to load your stores.")
      visit != null -> Row(END, "End Visit", "Visiting ${visit.storeName} · ${visitText(visit)}")
      start != null -> Row(START + start.storeId, "Start Visit", start.storeName)
      CarState.route == null -> Row(OPEN_PHONE, "Open phone to start route", "No active route. Open BOAROUTE on your phone to load your stores.")
      else -> Row(OPEN_PHONE, "Open phone to start a visit", "No store to start on this route.")
    }
  }

  private fun rows(): List<Row> {
    val rows = mutableListOf(primary())
    val route = CarState.route
    if (route != null) {
      val title = when {
        route.arrived -> "Arrived${route.nextStop?.let { " at $it" } ?: ""}"
        route.rerouting -> "Rerouting…"
        else -> route.instruction ?: "Continue to ${route.nextStop ?: "your destination"}"
      }
      rows.add(Row(INFO + "route", title, if (route.arrived) "Tap Start Visit when you are in store." else eta(route)))
    }
    val canStart = CarState.emit != null && CarState.visit == null
    CarState.upcoming.forEachIndexed { i, s ->
      val sub = when {
        s.storeId != null && canStart -> "Tap to start visit"
        i == 0 && route != null -> "Next stop"
        else -> "Stop ${i + 1}"
      }
      rows.add(Row(if (s.storeId != null) STORE + s.storeId else INFO + "stop$i", s.name, sub))
    }
    CarState.lunch?.let { rows.add(Row(INFO + "lunch", it, "Group lunch order")) }
    return rows
  }

  private fun onPress(id: String) {
    val visit = CarState.visit
    when {
      id == OPEN_PHONE || CarState.emit == null -> showNotice("Open BOAROUTE on your phone to load your stores.")
      id == END && visit != null -> {
        val left = visit.lockRemainingMs()
        if (left > 0) showNotice("You can end the visit in ${countdown(left)}.") else CarState.emit?.invoke("onEndVisit", emptyMap())
      }
      id.startsWith(START) || id.startsWith(STORE) -> {
        if (visit != null) return showNotice("Visiting ${visit.storeName}. End that visit first.")
        val storeId = id.removePrefix(START).removePrefix(STORE)
        CarState.emit?.invoke("onStartVisit", mapOf("storeId" to storeId))
      }
      // Route and lunch rows are information only.
    }
  }

  private fun showNotice(text: String) {
    notice = text
    handler.removeCallbacks(clearNotice)
    handler.postDelayed(clearNotice, 6_000)
    refresh()
  }

  /** Re-sends the list and the card only when what they show has changed. */
  private fun refresh() {
    handler.removeCallbacks(tick)
    if ((CarState.visit?.lockRemainingMs() ?: 0) > 0) handler.postDelayed(tick, 15_000)
    val rows = rows()
    val key = rows.joinToString("|") { "${it.id}:${it.title}:${it.subtitle}" } + "|" + notice
    if (key == shownKey) return
    shownKey = key
    updateSession(rows.first())
    notifyChildrenChanged(ROOT)
  }

  private fun updateSession(primary: Row) {
    session.setMetadata(
      MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_MEDIA_ID, primary.id)
        .putString(MediaMetadata.METADATA_KEY_TITLE, notice ?: primary.title)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, primary.subtitle ?: "BOAROUTE")
        .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, notice ?: primary.title)
        .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, primary.subtitle ?: "BOAROUTE")
        .build(),
    )
    val state = PlaybackState.Builder()
      .setState(PlaybackState.STATE_STOPPED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 0f)
      .setActions(PlaybackState.ACTION_PLAY_FROM_MEDIA_ID)
    when {
      primary.id == END -> state.addCustomAction(PlaybackState.CustomAction.Builder(END, "End Visit", R.drawable.ic_car_visit_end).build())
      primary.id.startsWith(START) -> state.addCustomAction(PlaybackState.CustomAction.Builder(primary.id, "Start Visit", R.drawable.ic_car_visit_start).build())
    }
    session.setPlaybackState(state.build())
  }

  private fun eta(route: CarState.Route): String {
    val mins = (route.remainingS / 60).roundToInt().coerceAtLeast(0)
    val at = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(route.arrivalMs))
    return "$mins min · arrive $at"
  }

  private fun visitText(visit: CarState.Visit): String {
    val left = visit.lockRemainingMs()
    val minutes = visit.lockMs / 60_000
    return if (left > 0) "${ceil(left / 60_000.0).toLong()} min left of $minutes" else "$minutes min done, tap to log it"
  }

  /** "24:59", "0:05", like NavScreen. */
  private fun countdown(ms: Long): String {
    val total = ceil(ms / 1000.0).toLong()
    return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
  }

  private companion object {
    const val ROOT = "boaroute"
    const val OPEN_PHONE = "phone"
    const val END = "end"
    const val START = "start:"
    const val STORE = "store:"
    const val INFO = "info:"
    // Android Auto's content style hints: draw playable items as a list.
    const val CONTENT_STYLE_PLAYABLE = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
    const val CONTENT_STYLE_LIST = 1
  }
}
