package expo.modules.boaroutecar

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

/**
 * Dazzzit's Android Auto entry point, declared in the manifest as a navigation
 * car app by plugins/withDazzzit.js (only in the Dazzzit build variant). A
 * navigation car app is what gives Dazzzit the full car Surface for its
 * launcher grid and the parked-only YouTube view; BoarouteLauncherMediaService
 * (reused) gets the sideloaded app listed in the car launcher.
 */
class DazzzitCarAppService : CarAppService() {
  // Every host is accepted, in release too: Dazzzit is sideloaded, not a Play
  // Store car app, so it does not rely on the sample host allowlist.
  override fun createHostValidator(): HostValidator = HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

  override fun onCreateSession(): Session = DazzzitSession()
}

class DazzzitSession : Session() {
  override fun onCreateScreen(intent: Intent): Screen = DazzzitScreen(carContext)
}
