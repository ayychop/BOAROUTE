package expo.modules.boaroutecar

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

/**
 * Android Auto's entry point, declared in the manifest as a navigation car
 * app by plugins/withAndroidAuto.js. BoarouteLauncherMediaService gets the
 * sideloaded app into the launcher and fills the split-screen side panel
 * when another app (Waze) has the map.
 */
class BoarouteCarAppService : CarAppService() {
  // Every host is accepted, in release too: BOAROUTE is sideloaded, not a
  // Play Store car app, so it doesn't rely on the sample host allowlist.
  override fun createHostValidator(): HostValidator = HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

  override fun onCreateSession(): Session = BoarouteSession()
}

class BoarouteSession : Session() {
  init {
    lifecycle.addObserver(object : DefaultLifecycleObserver {
      override fun onCreate(owner: LifecycleOwner) = CarState.post { CarState.setConnected(true) }
      override fun onDestroy(owner: LifecycleOwner) = CarState.post { CarState.setConnected(false) }
    })
  }

  override fun onCreateScreen(intent: Intent): Screen = NavScreen(carContext)
}
