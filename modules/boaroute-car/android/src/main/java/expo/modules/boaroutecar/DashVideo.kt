package expo.modules.boaroutecar

import android.annotation.SuppressLint
import android.app.Presentation
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.car.app.CarContext
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer

/**
 * Parked-only YouTube on the car display, drawn the same way as MapRenderer:
 * a WebView with m.youtube.com in a Presentation on a private VirtualDisplay
 * over the host's Surface. Taps on the car screen are passed to the page and
 * pan-mode drags scroll it.
 *
 * Anything that goes wrong (no WebView, the display refused, the page failing
 * or not loading within 12 seconds, the renderer dying) calls onFail once and
 * clears the surface. A head unit that simply hides our surface throws
 * nothing, so that case still shows black.
 */
class DashVideo(private val context: CarContext, private val onFail: (String) -> Unit) : SurfaceCallback {
  private val handler = Handler(Looper.getMainLooper())
  private var display: VirtualDisplay? = null
  private var presentation: Presentation? = null
  private var web: WebView? = null
  private var container: SurfaceContainer? = null
  private var loaded = false
  private var failed = false

  private val timeout = Runnable { if (!loaded) fail("page did not load") }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onSurfaceAvailable(surfaceContainer: SurfaceContainer) {
    release()
    failed = false
    loaded = false
    val surface = surfaceContainer.surface ?: return fail("no car surface")
    container = surfaceContainer
    try {
      val vd = context.getSystemService(DisplayManager::class.java).createVirtualDisplay(
        "boaroute-car-video", surfaceContainer.width, surfaceContainer.height, surfaceContainer.dpi, surface,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY,
      ) ?: return fail("car display refused")
      display = vd
      val p = Presentation(context, vd.display)
      val wv = WebView(p.context)
      wv.settings.javaScriptEnabled = true
      wv.settings.domStorageEnabled = true
      wv.settings.mediaPlaybackRequiresUserGesture = false
      wv.webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String) {
          loaded = true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
          if (request.isForMainFrame) fail("page error ${error.errorCode}")
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
          fail("video renderer stopped")
          return true
        }
      }
      val frame = FrameLayout(p.context)
      frame.setBackgroundColor(android.graphics.Color.BLACK)
      frame.addView(wv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      p.setContentView(frame)
      p.show()
      presentation = p
      web = wv
      wv.loadUrl(URL)
      handler.postDelayed(timeout, LOAD_TIMEOUT_MS)
    } catch (e: Exception) {
      fail(e.message ?: e.javaClass.simpleName)
    }
  }

  /** Keeps the page clear of the host's cards and buttons. */
  override fun onVisibleAreaChanged(visibleArea: Rect) {
    val wv = web ?: return
    val c = container ?: return
    val lp = wv.layoutParams as? FrameLayout.LayoutParams ?: return
    lp.setMargins(visibleArea.left, visibleArea.top, (c.width - visibleArea.right).coerceAtLeast(0), (c.height - visibleArea.bottom).coerceAtLeast(0))
    wv.layoutParams = lp
  }

  override fun onSurfaceDestroyed(surfaceContainer: SurfaceContainer) = release()

  override fun onClick(x: Float, y: Float) {
    val wv = web ?: return
    val lp = wv.layoutParams as? FrameLayout.LayoutParams
    val px = x - (lp?.leftMargin ?: 0)
    val py = y - (lp?.topMargin ?: 0)
    val t = SystemClock.uptimeMillis()
    for (action in listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP)) {
      val e = MotionEvent.obtain(t, t, action, px, py, 0)
      wv.dispatchTouchEvent(e)
      e.recycle()
    }
  }

  override fun onScroll(distanceX: Float, distanceY: Float) {
    web?.scrollBy(distanceX.toInt(), distanceY.toInt())
  }

  fun release() {
    handler.removeCallbacks(timeout)
    web?.let {
      it.stopLoading()
      it.destroy()
    }
    presentation?.dismiss()
    display?.release()
    web = null
    presentation = null
    display = null
    container = null
  }

  private fun fail(reason: String) {
    if (failed) return
    failed = true
    release()
    handler.post { onFail(reason) }
  }

  private companion object {
    const val URL = "https://m.youtube.com"
    const val LOAD_TIMEOUT_MS = 12_000L
  }
}
