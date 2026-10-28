package expo.modules.boaroutecar

import android.content.Intent
import android.net.Uri
import androidx.car.app.AppManager
import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.Template
import androidx.car.app.navigation.model.MessageInfo
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.versioning.CarAppApiLevels
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

/**
 * Dazzzit's single car screen: a dark launcher grid on the car display
 * (DazzzitLauncher) with two buttons, YouTube and Launch BOAROUTE.
 *
 * YouTube is gated by ParkedWatch exactly as BOAROUTE's dash video is: it only
 * opens once the car has been parked, swaps the launcher for DashVideo on the
 * car display, and closes the instant the car moves. Launch BOAROUTE fires the
 * phone intent for the BOAROUTE app and is always available. If the car
 * refuses the web view, YouTube opens on the phone instead, still only while
 * parked.
 */
class DazzzitScreen(carContext: CarContext) : Screen(carContext), DefaultLifecycleObserver {
  private val youtube = DashVideo(carContext, "https://m.youtube.com", "YouTube") { d, reason -> onDashFailed(d, reason) }
  private val launcher = DazzzitLauncher(carContext, { openYouTube() }, { launchBoaroute() })
  private val surface = SurfaceRouter(launcher)
  private val parkedWatch = ParkedWatch(carContext) { onParkedChange() }

  /** YouTube is on the car display instead of the launcher. */
  private var playing = false

  init {
    lifecycle.addObserver(this)
  }

  override fun onCreate(owner: LifecycleOwner) {
    carContext.getCarService(AppManager::class.java).setSurfaceCallback(surface)
    parkedWatch.start()
  }

  override fun onDestroy(owner: LifecycleOwner) {
    parkedWatch.stop()
    carContext.getCarService(AppManager::class.java).setSurfaceCallback(null)
    youtube.release()
    launcher.release()
  }

  override fun onGetTemplate(): Template {
    val strip = ActionStrip.Builder()
    if (playing) {
      strip.addAction(Action.Builder().setTitle("Close YouTube").setOnClickListener { closeYouTube() }.build())
    } else {
      // YouTube only appears in the strip while parked; the launcher shows it dimmed otherwise.
      if (parkedWatch.parked) strip.addAction(bigButton("YouTube", CarColor.RED) { openYouTube() })
      strip.addAction(Action.Builder().setTitle("Launch BOAROUTE").setOnClickListener { launchBoaroute() }.build())
    }

    val builder = NavigationTemplate.Builder()
      .setActionStrip(strip.build())
      .setNavigationInfo(info())
    // Pan mode is what lets drags on the car screen scroll the YouTube page.
    if (playing && carContext.carAppApiLevel >= CarAppApiLevels.LEVEL_2) {
      builder.setMapActionStrip(ActionStrip.Builder().addAction(Action.PAN).build())
    }
    return builder.build()
  }

  private fun info(): MessageInfo = when {
    playing -> message("Parked · YouTube", "Closes as soon as the car moves.")
    parkedWatch.parked -> message("Dazzzit", "Parked. Tap YouTube to watch, or Launch BOAROUTE.")
    else -> message("Dazzzit", "Park to unlock YouTube. Launch BOAROUTE any time.")
  }

  private fun openYouTube() {
    if (!parkedWatch.parked) return toast("YouTube is only for when you are parked.")
    playing = true
    surface.switchTo(youtube)
    invalidate()
  }

  private fun closeYouTube() {
    if (!playing) return
    playing = false
    surface.switchTo(launcher)
    invalidate()
  }

  private fun onParkedChange() {
    launcher.setParked(parkedWatch.parked)
    if (!parkedWatch.parked && playing) {
      closeYouTube()
      toast("Closed: the car is moving.")
    }
    invalidate()
  }

  /** Open the BOAROUTE app on the phone; it carries its own driving-safe car screen. */
  private fun launchBoaroute() {
    val intent = carContext.packageManager.getLaunchIntentForPackage(BOAROUTE_PACKAGE)
    if (intent == null) return toast("BOAROUTE is not installed on this phone.")
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      carContext.applicationContext.startActivity(intent)
      toast("Opening BOAROUTE on your phone.")
    } catch (e: Exception) {
      toast("Could not open BOAROUTE.")
    }
  }

  /** The car would not show the page, so open it on the phone, still only while parked. */
  private fun onDashFailed(which: DashVideo, reason: String) {
    closeYouTube()
    if (!parkedWatch.parked) return
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(which.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      carContext.applicationContext.startActivity(intent)
      toast("The car blocked ${which.label} ($reason). Opening it on your phone.")
    } catch (e: Exception) {
      toast("The car blocked ${which.label} and the phone could not open it.")
    }
  }

  /**
   * The primary action is the only one the host draws in a solid colour, so
   * YouTube (red) stands out. Older head units (car API < 4) show the same
   * button without the colour.
   */
  private fun bigButton(title: String, color: CarColor, onClick: () -> Unit): Action {
    val b = Action.Builder().setTitle(title).setOnClickListener { onClick() }
    if (carContext.carAppApiLevel >= CarAppApiLevels.LEVEL_4) b.setFlags(Action.FLAG_PRIMARY).setBackgroundColor(color)
    return b.build()
  }

  private fun toast(text: String) = CarToast.makeText(carContext, text, CarToast.LENGTH_LONG).show()

  private fun message(title: String, text: String) = MessageInfo.Builder(title).setText(text).build()

  private companion object {
    const val BOAROUTE_PACKAGE = "com.boanets.boaroute"
  }
}
