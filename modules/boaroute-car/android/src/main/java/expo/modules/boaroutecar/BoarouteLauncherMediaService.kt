package expo.modules.boaroutecar

import android.media.browse.MediaBrowser
import android.media.session.MediaSession
import android.os.Bundle
import android.service.media.MediaBrowserService

/**
 * An empty media browser, declared by plugins/withAndroidAuto.js only so that
 * Android Auto lists the sideloaded BOAROUTE in its launcher. It serves no
 * media: the root has no children. The real car screen is
 * BoarouteCarAppService's NavigationTemplate.
 */
class BoarouteLauncherMediaService : MediaBrowserService() {
  private lateinit var session: MediaSession

  override fun onCreate() {
    super.onCreate()
    // Android Auto refuses to connect to a browser without a session token.
    session = MediaSession(this, "BOAROUTE")
    sessionToken = session.sessionToken
  }

  override fun onDestroy() {
    session.release()
    super.onDestroy()
  }

  override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot = BrowserRoot(ROOT, null)

  override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaBrowser.MediaItem>>) = result.sendResult(mutableListOf())

  private companion object {
    const val ROOT = "boaroute"
  }
}
