package expo.modules.boaroutecar

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/** The JS side of the car screen and the co-pilot voice (modules/boaroute-car/index.ts). */
class BoarouteCarModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not ready" }

  override fun definition() = ModuleDefinition {
    Name("BoarouteCar")

    Events("onStartVisit", "onEndVisit", "onConnectionChange")

    OnCreate {
      CarState.emit = { name, body -> sendEvent(name, body) }
      appContext.reactContext?.let { CoPilotAudio.warmUp(it) }
    }

    OnDestroy {
      CarState.emit = null
    }

    Function("setState") { json: String ->
      val parsed = JSONObject(json)
      CarState.post { CarState.apply(parsed) }
    }

    Function("setPath") { points: List<Double> ->
      CarState.post { CarState.applyPath(points) }
    }

    Function("toast") { text: String ->
      CarState.post { CarState.toast(text) }
    }

    Function("isConnected") {
      CarState.connected
    }

    Function("playCue") { name: String ->
      CoPilotAudio.play(context, name)
      Unit
    }

    Function("speak") { text: String ->
      CoPilotAudio.say(context, text)
      Unit
    }
  }
}
