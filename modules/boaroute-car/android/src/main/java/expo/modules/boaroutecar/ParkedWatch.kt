package expo.modules.boaroutecar

import android.Manifest
import android.content.pm.PackageManager
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.car.app.CarContext
import androidx.car.app.hardware.CarHardwareManager
import androidx.car.app.hardware.common.CarValue
import androidx.car.app.hardware.common.OnCarDataAvailableListener
import androidx.car.app.hardware.info.Speed
import java.util.concurrent.Executor

/**
 * Decides whether the car is parked, for the dash video. Speed comes from the
 * car (CarInfo, where the head unit shares it) and from the phone's GPS.
 * Parked means a fresh reading under 0.5 m/s for 30 seconds straight; any
 * reading over 1.5 m/s, or no reading for 5 seconds, means not parked. With
 * no speed source at all the car never counts as parked.
 */
class ParkedWatch(private val context: CarContext, private val onChange: () -> Unit) {
  var parked = false
    private set

  private val handler = Handler(Looper.getMainLooper())
  private val main = Executor { handler.post(it) }
  private var running = false
  private var stillSinceMs: Long? = null
  private var lastReadingMs = 0L

  private val carSpeed = OnCarDataAvailableListener<Speed> { speed ->
    val raw = speed.rawSpeedMetersPerSecond
    if (raw.status == CarValue.STATUS_SUCCESS) raw.value?.let { reading(it) }
  }
  private val gps = LocationListener { loc -> if (loc.hasSpeed()) reading(loc.speed) }

  private val check = object : Runnable {
    override fun run() {
      val now = SystemClock.elapsedRealtime()
      if (now - lastReadingMs > STALE_MS) stillSinceMs = null
      set(stillSinceMs?.let { now - it >= PARKED_AFTER_MS } ?: false)
      if (running) handler.postDelayed(this, 1_000)
    }
  }

  fun start() {
    if (running) return
    running = true
    try {
      context.getCarService(CarHardwareManager::class.java).carInfo.addSpeedListener(main, carSpeed)
    } catch (_: Exception) {
      // Head unit or host without speed: the phone's GPS still counts.
    }
    if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
      try {
        context.getSystemService(LocationManager::class.java)
          .requestLocationUpdates(LocationManager.GPS_PROVIDER, 1_000L, 0f, gps, Looper.getMainLooper())
      } catch (_: Exception) {
      }
    }
    handler.post(check)
  }

  fun stop() {
    running = false
    handler.removeCallbacks(check)
    try {
      context.getCarService(CarHardwareManager::class.java).carInfo.removeSpeedListener(carSpeed)
    } catch (_: Exception) {
    }
    context.getSystemService(LocationManager::class.java).removeUpdates(gps)
    stillSinceMs = null
    parked = false
  }

  private fun reading(metresPerSecond: Float) {
    val now = SystemClock.elapsedRealtime()
    lastReadingMs = now
    when {
      metresPerSecond > MOVING_MPS -> {
        stillSinceMs = null
        set(false)
      }
      metresPerSecond < STILL_MPS -> if (stillSinceMs == null) stillSinceMs = now
    }
  }

  private fun set(value: Boolean) {
    if (parked == value) return
    parked = value
    onChange()
  }

  private companion object {
    const val STILL_MPS = 0.5f
    const val MOVING_MPS = 1.5f
    const val PARKED_AFTER_MS = 30_000L
    const val STALE_MS = 5_000L
  }
}
