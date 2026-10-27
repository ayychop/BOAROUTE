package expo.modules.boaroutecar

import android.graphics.Rect
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer

/**
 * The host gives the car screen one Surface. This hands it to whichever
 * renderer is showing (the map or the parked dash video) and moves it across
 * when that changes, so the host never has to resend it.
 */
class SurfaceRouter(private var active: SurfaceCallback) : SurfaceCallback {
  private var container: SurfaceContainer? = null
  private var visibleArea: Rect? = null

  fun switchTo(next: SurfaceCallback) {
    if (next === active) return
    container?.let { active.onSurfaceDestroyed(it) }
    active = next
    container?.let { next.onSurfaceAvailable(it) }
    visibleArea?.let { next.onVisibleAreaChanged(it) }
  }

  override fun onSurfaceAvailable(surfaceContainer: SurfaceContainer) {
    container = surfaceContainer
    active.onSurfaceAvailable(surfaceContainer)
  }

  override fun onSurfaceDestroyed(surfaceContainer: SurfaceContainer) {
    container = null
    active.onSurfaceDestroyed(surfaceContainer)
  }

  override fun onVisibleAreaChanged(visibleArea: Rect) {
    this.visibleArea = visibleArea
    active.onVisibleAreaChanged(visibleArea)
  }

  override fun onStableAreaChanged(stableArea: Rect) = active.onStableAreaChanged(stableArea)
  override fun onClick(x: Float, y: Float) = active.onClick(x, y)
  override fun onScroll(distanceX: Float, distanceY: Float) = active.onScroll(distanceX, distanceY)
  override fun onFling(velocityX: Float, velocityY: Float) = active.onFling(velocityX, velocityY)
  override fun onScale(focusX: Float, focusY: Float, scaleFactor: Float) = active.onScale(focusX, focusY, scaleFactor)
}
