package expo.modules.boaroutecar

import android.os.Handler
import android.os.Looper
import org.json.JSONObject

/**
 * What the phone last told the car: the live route, the visit in progress and
 * the store Start Visit would open, the stores ahead, plus the driver's
 * position for the map.
 * JS writes it through BoarouteCarModule; the car screen and map read it.
 * Every read and write happens on the main thread.
 */
object CarState {
  data class LatLng(val lat: Double, val lng: Double)

  data class Route(
    val title: String,
    val instruction: String?,
    val distanceToNextM: Double?,
    val arrivalMs: Long,
    val remainingM: Double,
    val remainingS: Double,
    val nextStop: String?,
    val arrived: Boolean,
    val rerouting: Boolean,
  )

  data class Visit(val storeName: String, val startedAtMs: Long, val lockMs: Long) {
    fun lockRemainingMs(now: Long = System.currentTimeMillis()) = (startedAtMs + lockMs - now).coerceAtLeast(0)
  }

  data class StartTarget(val storeId: String, val storeName: String)
  data class Position(val lat: Double, val lng: Double, val heading: Double?)
  data class Hazard(val lat: Double, val lng: Double, val type: String)
  /** A stop or store ahead; storeId is null for a route stop that is not a store. */
  data class Upcoming(val storeId: String?, val name: String)

  private val main = Handler(Looper.getMainLooper())
  private val listeners = mutableSetOf<() -> Unit>()

  var route: Route? = null
    private set
  var visit: Visit? = null
    private set
  var start: StartTarget? = null
    private set
  var metric = false
    private set
  var position: Position? = null
    private set
  var hazards: List<Hazard> = emptyList()
    private set
  var lunch: String? = null
    private set
  var upcoming: List<Upcoming> = emptyList()
    private set
  var path: List<LatLng> = emptyList()
    private set
  /** Bumped when the path changes, so the map redraws the line only then. */
  var pathVersion = 0
    private set

  /** True while Android Auto has a BOAROUTE session open. */
  var connected = false
    private set

  /** Sends an event to JS; null while the React app is not running. */
  @Volatile var emit: ((String, Map<String, Any?>) -> Unit)? = null

  /** Shows a short message on the car screen; set while the car screen exists. */
  var toaster: ((String) -> Unit)? = null

  /** Shows it on the split-screen side panel (BoarouteLauncherMediaService) too, while that is connected. */
  var panelToaster: ((String) -> Unit)? = null

  fun toast(text: String) {
    toaster?.invoke(text)
    panelToaster?.invoke(text)
  }

  fun addListener(l: () -> Unit) { listeners.add(l) }
  fun removeListener(l: () -> Unit) { listeners.remove(l) }

  fun post(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
  }

  fun setConnected(value: Boolean) {
    if (connected == value) return
    connected = value
    emit?.invoke("onConnectionChange", mapOf("connected" to value))
  }

  /** Applies the JSON from JS (shape: CarDisplayState in src/car/car-state.ts). */
  fun apply(json: JSONObject) {
    route = json.optJSONObject("route")?.let {
      Route(
        title = it.optString("title"),
        instruction = it.optStringOrNull("instruction"),
        distanceToNextM = it.optDoubleOrNull("distanceToNextM"),
        arrivalMs = it.optLong("arrivalMs"),
        remainingM = it.optDouble("remainingM", 0.0),
        remainingS = it.optDouble("remainingS", 0.0),
        nextStop = it.optStringOrNull("nextStop"),
        arrived = it.optBoolean("arrived"),
        rerouting = it.optBoolean("rerouting"),
      )
    }
    visit = json.optJSONObject("visit")?.let { Visit(it.optString("storeName"), it.optLong("startedAtMs"), it.optLong("lockMs")) }
    start = json.optJSONObject("start")?.let { StartTarget(it.optString("storeId"), it.optString("storeName")) }
    metric = json.optBoolean("metric")
    position = json.optJSONObject("position")?.let { Position(it.optDouble("lat"), it.optDouble("lng"), it.optDoubleOrNull("heading")) }
    val list = json.optJSONArray("hazards")
    hazards = if (list == null) emptyList() else List(list.length()) { i ->
      val h = list.getJSONObject(i)
      Hazard(h.optDouble("lat"), h.optDouble("lng"), h.optString("type"))
    }
    lunch = json.optStringOrNull("lunch")
    val stores = json.optJSONArray("upcoming")
    upcoming = if (stores == null) emptyList() else List(stores.length()) { i ->
      val u = stores.getJSONObject(i)
      Upcoming(u.optStringOrNull("storeId"), u.optString("name"))
    }
    notifyListeners()
  }

  /** Route line as [lat, lng, lat, lng, ...]. */
  fun applyPath(flat: List<Double>) {
    path = List(flat.size / 2) { i -> LatLng(flat[i * 2], flat[i * 2 + 1]) }
    pathVersion++
    notifyListeners()
  }

  private fun notifyListeners() = listeners.toList().forEach { it() }

  private fun JSONObject.optStringOrNull(key: String): String? = if (isNull(key)) null else optString(key).ifEmpty { null }
  private fun JSONObject.optDoubleOrNull(key: String): Double? = if (isNull(key)) null else optDouble(key).takeIf { !it.isNaN() }
}
