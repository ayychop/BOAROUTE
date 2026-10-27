package expo.modules.boaroutecar

import android.os.Handler
import android.os.Looper
import androidx.car.app.AppManager
import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.DateTimeWithZone
import androidx.car.app.model.Distance
import androidx.car.app.model.Template
import androidx.car.app.navigation.NavigationManager
import androidx.car.app.navigation.NavigationManagerCallback
import androidx.car.app.navigation.model.MessageInfo
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.navigation.model.NavigationTemplate.NavigationInfo
import androidx.car.app.navigation.model.RoutingInfo
import androidx.car.app.navigation.model.Step
import androidx.car.app.navigation.model.TravelEstimate
import androidx.car.app.versioning.CarAppApiLevels
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import java.util.TimeZone
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * The one BOAROUTE car screen: our own map on the car display (MapRenderer),
 * the next turn or the visit countdown on top of it, and one big Start Visit
 * or End Visit button. Presses go to JS, which starts the 25-minute timer or
 * logs the visit to Supabase exactly as the phone's own buttons do.
 */
class NavScreen(carContext: CarContext) : Screen(carContext), DefaultLifecycleObserver {
  private val map = MapRenderer(carContext)
  private val navigation = carContext.getCarService(NavigationManager::class.java)
  private val handler = Handler(Looper.getMainLooper())

  /** navigationStarted() was called and the host has not taken it back. */
  private var navigating = false
  /** Another navigation app (Waze, Google Maps) took over until this route ends. */
  private var handedOver = false
  private var shownKey = ""

  private val onState: () -> Unit = { refresh() }

  /** Redraws the countdown once a second while the 25 minutes are running. */
  private val tick = object : Runnable {
    override fun run() {
      invalidateIfChanged()
      if ((CarState.visit?.lockRemainingMs() ?: 0) > 0) handler.postDelayed(this, 1_000)
    }
  }

  init {
    lifecycle.addObserver(this)
    navigation.setNavigationManagerCallback(object : NavigationManagerCallback {
      override fun onStopNavigation() {
        navigating = false
        handedOver = true
        invalidate()
      }
    })
  }

  override fun onCreate(owner: LifecycleOwner) {
    carContext.getCarService(AppManager::class.java).setSurfaceCallback(map)
    CarState.toaster = { text -> CarToast.makeText(carContext, text, CarToast.LENGTH_LONG).show() }
    CarState.addListener(onState)
    refresh()
  }

  override fun onDestroy(owner: LifecycleOwner) {
    CarState.removeListener(onState)
    CarState.toaster = null
    handler.removeCallbacks(tick)
    carContext.getCarService(AppManager::class.java).setSurfaceCallback(null)
    map.release()
    if (navigating) navigation.navigationEnded()
    navigating = false
  }

  private fun refresh() {
    val route = CarState.route
    if (route == null || route.arrived) {
      if (navigating) navigation.navigationEnded()
      navigating = false
      // A new route on the phone takes the car back from the other app.
      if (route == null) handedOver = false
    } else if (!navigating && !handedOver) {
      navigation.navigationStarted()
      navigating = true
    }
    map.render()
    handler.removeCallbacks(tick)
    if ((CarState.visit?.lockRemainingMs() ?: 0) > 0) handler.post(tick)
    invalidateIfChanged()
  }

  /** GPS fixes arrive every second; only ask the host for a new template when the text changes. */
  private fun invalidateIfChanged() {
    val key = listOf(infoKey(), CarState.visit?.let { "end" } ?: CarState.start?.storeId, navigating, handedOver).joinToString("|")
    if (key == shownKey) return
    shownKey = key
    invalidate()
  }

  override fun onGetTemplate(): Template {
    val builder = NavigationTemplate.Builder()
      .setActionStrip(actionStrip())
      .setNavigationInfo(navigationInfo())
    val route = CarState.route
    if (route != null && navigating && !route.rerouting) {
      builder.setDestinationTravelEstimate(
        TravelEstimate.Builder(distance(route.remainingM), DateTimeWithZone.create(route.arrivalMs.coerceAtLeast(0), TimeZone.getDefault()))
          .setRemainingTimeSeconds(route.remainingS.toLong().coerceAtLeast(0))
          .build(),
      )
    }
    return builder.build()
  }

  private fun navigationInfo(): NavigationInfo {
    val visit = CarState.visit
    val route = CarState.route
    return when {
      visit != null -> message("Visiting ${visit.storeName}", visitText(visit))
      route != null && route.arrived -> message("Arrived${route.nextStop?.let { " at $it" } ?: ""}", "Tap Start Visit when you are in store.")
      route != null && handedOver -> message("Another app is navigating", "BOAROUTE speed camera alerts stay on.")
      route != null && navigating && route.rerouting -> RoutingInfo.Builder().setLoading(true).build()
      route != null && navigating -> {
        val cue = route.instruction ?: "Continue to ${route.nextStop ?: "your destination"}"
        RoutingInfo.Builder().setCurrentStep(Step.Builder(cue).build(), distance(route.distanceToNextM ?: route.remainingM)).build()
      }
      else -> message("No active route", "Open BOAROUTE on your phone." + (CarState.start?.let { "\nNext store: ${it.storeName}" } ?: ""))
    }
  }

  /** The text the template shows, without the parts that change every fix. */
  private fun infoKey(): String {
    val visit = CarState.visit
    val route = CarState.route
    return when {
      visit != null -> "v:${visit.storeName}:${visitText(visit)}"
      route != null -> "r:${route.instruction}:${route.distanceToNextM?.let { distanceLabel(it) }}:${route.arrived}:${route.rerouting}:${route.nextStop}:${(route.remainingS / 60).roundToInt()}"
      else -> "idle:${CarState.start?.storeName}"
    }
  }

  private fun actionStrip(): ActionStrip {
    val strip = ActionStrip.Builder()
    val visit = CarState.visit
    val start = CarState.start
    when {
      visit != null -> strip.addAction(bigButton("End Visit", CarColor.RED) { endVisit(visit) })
      start != null -> strip.addAction(bigButton("Start Visit", CarColor.GREEN) { send("onStartVisit", mapOf("storeId" to start.storeId)) })
      // The strip may not be empty; with nothing to start, point the driver at the phone.
      else -> strip.addAction(Action.Builder().setTitle("BOAROUTE").setOnClickListener { toast("Open BOAROUTE on your phone.") }.build())
    }
    return strip.build()
  }

  /**
   * The primary action is the only one the host draws in a solid colour, so
   * Start Visit (green) and End Visit (red) stand out against the map. Older
   * head units (car API < 4) show the same button without the colour.
   */
  private fun bigButton(title: String, color: CarColor, onClick: () -> Unit): Action {
    val b = Action.Builder().setTitle(title).setOnClickListener { onClick() }
    if (carContext.carAppApiLevel >= CarAppApiLevels.LEVEL_4) b.setFlags(Action.FLAG_PRIMARY).setBackgroundColor(color)
    return b.build()
  }

  private fun endVisit(visit: CarState.Visit) {
    val left = visit.lockRemainingMs()
    if (left > 0) return toast("You can end the visit in ${countdown(left)}.")
    send("onEndVisit", emptyMap())
  }

  private fun send(event: String, body: Map<String, Any?>) {
    val emit = CarState.emit ?: return toast("Open BOAROUTE on your phone first.")
    emit(event, body)
  }

  private fun toast(text: String) = CarToast.makeText(carContext, text, CarToast.LENGTH_LONG).show()

  private fun message(title: String, text: String) = MessageInfo.Builder(title).setText(text).build()

  private fun visitText(visit: CarState.Visit): String {
    val left = visit.lockRemainingMs()
    val minutes = visit.lockMs / 60_000
    return if (left > 0) "${countdown(left)} left of $minutes min" else "$minutes min done. Tap End Visit to log it."
  }

  /** "24:59", "0:05": whole seconds rounded up, like formatCountdown on the phone. */
  private fun countdown(ms: Long): String {
    val total = ceil(ms / 1000.0).toLong()
    return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
  }

  /** In the driver's units: metres or km, yards or miles (UK style). */
  private fun distance(metres: Double): Distance {
    if (CarState.metric) {
      return if (metres < 1_000) Distance.create(((metres / 10).roundToInt() * 10).toDouble(), Distance.UNIT_METERS)
      else Distance.create(metres / 1_000, Distance.UNIT_KILOMETERS_P1)
    }
    val yards = metres * 1.0936
    return if (yards < 500) Distance.create(((yards / 10).roundToInt() * 10).toDouble(), Distance.UNIT_YARDS)
    else Distance.create(metres / 1_609.344, Distance.UNIT_MILES_P1)
  }

  private fun distanceLabel(metres: Double): String {
    val d = distance(metres)
    return "${d.displayDistance}:${d.displayUnit}"
  }
}
