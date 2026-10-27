package expo.modules.boaroutecar

import android.app.Presentation
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import androidx.car.app.CarContext
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.GoogleMapOptions
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.JointType
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.gms.maps.model.Polyline
import com.google.android.gms.maps.model.PolylineOptions

/**
 * Draws BOAROUTE's map on the car display. The host hands us a Surface; a
 * private VirtualDisplay on that Surface hosts a Presentation with a Google
 * MapView, so the map is the same Maps SDK the phone uses (react-native-maps),
 * styled dark, with the gold route line, the car and the camera and police
 * reports. Without a Maps key it paints a plain dark surface instead, because
 * the Maps SDK refuses to start without one.
 */
class MapRenderer(private val context: CarContext) : SurfaceCallback {
  private var display: VirtualDisplay? = null
  private var presentation: Presentation? = null
  private var mapView: MapView? = null
  private var map: GoogleMap? = null
  private var container: SurfaceContainer? = null
  private var visibleArea: Rect? = null

  private var routeLine: Polyline? = null
  private var drawnPath = -1
  private var car: Marker? = null
  private var hazardMarkers: List<Marker> = emptyList()
  private var drawnHazards: List<CarState.Hazard>? = null
  private var framedIdle = false

  override fun onSurfaceAvailable(surfaceContainer: SurfaceContainer) {
    release()
    val surface = surfaceContainer.surface ?: return
    container = surfaceContainer
    if (!hasMapsKey()) return paintPlain(surfaceContainer)

    val manager = context.getSystemService(DisplayManager::class.java)
    val vd = manager.createVirtualDisplay(
      "boaroute-car-map", surfaceContainer.width, surfaceContainer.height, surfaceContainer.dpi, surface,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY,
    )
    display = vd
    val p = Presentation(context, vd.display)
    val mv = MapView(p.context, GoogleMapOptions().compassEnabled(false).mapToolbarEnabled(false).zoomControlsEnabled(false).liteMode(false))
    mv.onCreate(null)
    mv.onStart()
    mv.onResume()
    p.setContentView(mv)
    p.show()
    presentation = p
    mapView = mv
    mv.getMapAsync { m ->
      if (mapView !== mv) return@getMapAsync
      map = m
      m.uiSettings.setAllGesturesEnabled(false)
      m.isBuildingsEnabled = true
      if (context.isDarkMode) m.setMapStyle(MapStyleOptions(NIGHT_STYLE))
      applyPadding()
      render()
    }
  }

  override fun onVisibleAreaChanged(visibleArea: Rect) {
    this.visibleArea = visibleArea
    applyPadding()
  }

  override fun onSurfaceDestroyed(surfaceContainer: SurfaceContainer) = release()

  /** Brings the map in line with CarState. Cheap when nothing changed. */
  fun render() {
    val m = map ?: return
    if (drawnPath != CarState.pathVersion) {
      drawnPath = CarState.pathVersion
      routeLine?.remove()
      routeLine = CarState.path.takeIf { it.size >= 2 }?.let { path ->
        m.addPolyline(
          PolylineOptions().addAll(path.map { LatLng(it.lat, it.lng) }).color(GOLD).width(16f).jointType(JointType.ROUND).geodesic(false),
        )
      }
      framedIdle = false
    }

    if (drawnHazards != CarState.hazards) {
      drawnHazards = CarState.hazards
      hazardMarkers.forEach { it.remove() }
      hazardMarkers = CarState.hazards.mapNotNull { h ->
        val hue = if (h.type == "speed_camera") BitmapDescriptorFactory.HUE_RED else BitmapDescriptorFactory.HUE_AZURE
        m.addMarker(MarkerOptions().position(LatLng(h.lat, h.lng)).icon(BitmapDescriptorFactory.defaultMarker(hue)).anchor(0.5f, 1f))
      }
    }

    val pos = CarState.position
    if (pos == null) {
      car?.remove()
      car = null
      frameWithoutPosition(m)
      return
    }
    val here = LatLng(pos.lat, pos.lng)
    val heading = pos.heading?.takeIf { it >= 0 }?.toFloat()
    val marker = car ?: m.addMarker(MarkerOptions().position(here).icon(carIcon()).anchor(0.5f, 0.5f).flat(true).zIndex(10f))
    car = marker
    marker?.position = here
    if (heading != null) marker?.rotation = heading
    // Follow the car, tilted and turned with it like a sat nav, while a route runs.
    val camera = CameraPosition.Builder().target(here).zoom(if (CarState.route != null) 16.5f else 15f).tilt(if (CarState.route != null) 45f else 0f).bearing(heading ?: m.cameraPosition.bearing).build()
    m.animateCamera(CameraUpdateFactory.newCameraPosition(camera), 900, null)
  }

  /** No GPS fix yet: show the whole route, or the patch around High Wycombe. */
  private fun frameWithoutPosition(m: GoogleMap) {
    if (framedIdle) return
    val c = container ?: return
    framedIdle = true
    val path = CarState.path
    if (path.size >= 2) {
      val bounds = LatLngBounds.builder().apply { path.forEach { include(LatLng(it.lat, it.lng)) } }.build()
      // The size-aware overload works before the MapView has been laid out.
      m.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds, c.width, c.height, 96))
    } else {
      m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(51.63, -0.75), 9f))
    }
  }

  /** Keeps the car and the route clear of the host's cards and buttons. */
  private fun applyPadding() {
    val m = map ?: return
    val c = container ?: return
    val v = visibleArea ?: return
    m.setPadding(v.left, v.top, (c.width - v.right).coerceAtLeast(0), (c.height - v.bottom).coerceAtLeast(0))
  }

  fun release() {
    mapView?.let {
      it.onPause()
      it.onStop()
      it.onDestroy()
    }
    presentation?.dismiss()
    display?.release()
    mapView = null
    presentation = null
    display = null
    map = null
    routeLine = null
    car = null
    hazardMarkers = emptyList()
    drawnHazards = null
    drawnPath = -1
    framedIdle = false
  }

  private fun hasMapsKey(): Boolean = try {
    val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
    !info.metaData?.getString("com.google.android.geo.API_KEY").isNullOrBlank()
  } catch (_: Exception) {
    false
  }

  private fun paintPlain(c: SurfaceContainer) {
    val surface = c.surface ?: return
    val canvas = surface.lockCanvas(null) ?: return
    canvas.drawColor(Color.parseColor("#0B0A09"))
    surface.unlockCanvasAndPost(canvas)
  }

  /** Gold puck with a white ring, matching the phone's car indicator. */
  private fun carIcon(): BitmapDescriptor {
    val size = (context.resources.displayMetrics.density * 28).toInt().coerceAtLeast(28)
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val r = size / 2f
    paint.color = Color.WHITE
    canvas.drawCircle(r, r, r, paint)
    paint.color = GOLD
    canvas.drawCircle(r, r, r * 0.74f, paint)
    paint.color = Color.parseColor("#121212")
    val arrow = android.graphics.Path().apply {
      moveTo(r, r * 0.45f)
      lineTo(r * 1.4f, r * 1.4f)
      lineTo(r, r * 1.15f)
      lineTo(r * 0.6f, r * 1.4f)
      close()
    }
    canvas.drawPath(arrow, paint)
    return BitmapDescriptorFactory.fromBitmap(bmp)
  }

  private companion object {
    val GOLD = Color.parseColor("#CDA960")

    const val NIGHT_STYLE = """[
      {"elementType":"geometry","stylers":[{"color":"#1b1b1d"}]},
      {"elementType":"labels.text.fill","stylers":[{"color":"#b9b4aa"}]},
      {"elementType":"labels.text.stroke","stylers":[{"color":"#111111"}]},
      {"featureType":"road","elementType":"geometry","stylers":[{"color":"#38383c"}]},
      {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#5a4f3a"}]},
      {"featureType":"water","elementType":"geometry","stylers":[{"color":"#0d1820"}]},
      {"featureType":"poi","stylers":[{"visibility":"off"}]},
      {"featureType":"transit","stylers":[{"visibility":"off"}]}
    ]"""
  }
}
