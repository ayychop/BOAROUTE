package expo.modules.boaroutecar

import android.app.Presentation
import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.car.app.CarContext
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer

/**
 * Dazzzit's dark launcher grid, drawn on the car Surface the same way as
 * MapRenderer and DashVideo: a Presentation on a private VirtualDisplay over
 * the host's Surface. It shows the Dazzzit wordmark, a parked status line and
 * two large buttons, YouTube and Launch BOAROUTE. YouTube is dimmed and shows
 * "Park to watch" until the car is parked. Taps on the car screen are
 * dispatched into the view tree so the buttons respond; DazzzitScreen's action
 * strip carries the same two actions for head units that do not forward
 * surface taps.
 */
class DazzzitLauncher(
  private val context: CarContext,
  private val onYouTube: () -> Unit,
  private val onBoaroute: () -> Unit,
) : SurfaceCallback {
  private var display: VirtualDisplay? = null
  private var presentation: Presentation? = null
  private var frame: FrameLayout? = null
  private var youTubeButton: TextView? = null
  private var status: TextView? = null
  private var parked = false

  override fun onSurfaceAvailable(surfaceContainer: SurfaceContainer) {
    release()
    val surface = surfaceContainer.surface ?: return
    try {
      val vd = context.getSystemService(DisplayManager::class.java).createVirtualDisplay(
        "dazzzit-launcher", surfaceContainer.width, surfaceContainer.height, surfaceContainer.dpi, surface,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY,
      ) ?: return
      display = vd
      val p = Presentation(context, vd.display)
      val f = FrameLayout(p.context)
      f.setBackgroundColor(BACKGROUND)
      f.addView(buildContent(p), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      p.setContentView(f)
      p.show()
      presentation = p
      frame = f
      applyParked()
    } catch (_: Exception) {
      release()
    }
  }

  /** Keeps the grid clear of the host's cards and buttons. */
  override fun onVisibleAreaChanged(visibleArea: Rect) {
    frame?.setPadding(visibleArea.left, visibleArea.top, 0, 0)
  }

  override fun onSurfaceDestroyed(surfaceContainer: SurfaceContainer) = release()

  /** Forward the host's tap into the Presentation so the buttons receive it. */
  override fun onClick(x: Float, y: Float) {
    val target = frame ?: return
    val t = SystemClock.uptimeMillis()
    for (action in listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP)) {
      val e = MotionEvent.obtain(t, t, action, x, y, 0)
      target.dispatchTouchEvent(e)
      e.recycle()
    }
  }

  /** Called by DazzzitScreen when ParkedWatch flips; enables/dims YouTube. */
  fun setParked(value: Boolean) {
    parked = value
    applyParked()
  }

  private fun buildContent(p: Presentation): View {
    val ctx = p.context
    val column = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(ctx, SIDE_DP), dp(ctx, 24), dp(ctx, SIDE_DP), dp(ctx, 24))
    }
    column.addView(TextView(ctx).apply {
      text = "DAZZZIT"
      setTextColor(GOLD)
      setTypeface(Typeface.DEFAULT_BOLD)
      letterSpacing = 0.3f
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
      gravity = Gravity.CENTER
    })
    status = TextView(ctx).apply {
      setTextColor(MUTED)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      gravity = Gravity.CENTER
      setPadding(0, dp(ctx, 6), 0, dp(ctx, 28))
    }
    column.addView(status)

    youTubeButton = button(ctx, "YouTube") { if (parked) onYouTube() }
    column.addView(youTubeButton, buttonParams(ctx))
    column.addView(button(ctx, "Launch BOAROUTE") { onBoaroute() }, buttonParams(ctx))
    return column
  }

  private fun button(ctx: android.content.Context, label: String, onClick: () -> Unit): TextView =
    TextView(ctx).apply {
      text = label
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTypeface(Typeface.DEFAULT_BOLD)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      background = GradientDrawable().apply {
        cornerRadius = dp(ctx, 18).toFloat()
        setColor(CARD)
        setStroke(dp(ctx, 1), STROKE)
      }
      setOnClickListener { onClick() }
    }

  private fun buttonParams(ctx: android.content.Context) =
    LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(ctx, 84)).apply {
      topMargin = dp(ctx, 10)
      bottomMargin = dp(ctx, 10)
    }

  private fun applyParked() {
    status?.text = if (parked) "Parked — tap to watch" else "Park to unlock YouTube"
    youTubeButton?.apply {
      isEnabled = parked
      alpha = if (parked) 1f else 0.4f
      text = if (parked) "YouTube" else "YouTube — park to watch"
    }
  }

  fun release() {
    presentation?.dismiss()
    display?.release()
    presentation = null
    display = null
    frame = null
    youTubeButton = null
    status = null
  }

  private fun dp(ctx: android.content.Context, value: Int): Int =
    (value * ctx.resources.displayMetrics.density).toInt()

  private companion object {
    const val BACKGROUND = 0xFF0B0A09.toInt()
    const val CARD = 0xFF161412.toInt()
    const val STROKE = 0xFF2A2724.toInt()
    const val GOLD = 0xFFCDA960.toInt()
    const val MUTED = 0xFF9A938A.toInt()
    const val SIDE_DP = 40
  }
}
