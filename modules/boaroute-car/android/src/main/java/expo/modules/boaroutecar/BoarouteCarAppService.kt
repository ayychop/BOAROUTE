package expo.modules.boaroutecar

import android.content.Intent
import android.content.pm.ApplicationInfo
import androidx.car.app.CarAppService
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

/**
 * Android Auto's entry point, declared in the manifest as a navigation car
 * app by plugins/withAndroidAuto.js. There is no MediaBrowserService anywhere
 * in the app, so Android Auto never opens a media player for BOAROUTE.
 */
class BoarouteCarAppService : CarAppService() {
  override fun createHostValidator(): HostValidator =
    if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
      // Debug builds also talk to the Desktop Head Unit.
      HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    } else {
      HostValidator.Builder(applicationContext).addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build()
    }

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
