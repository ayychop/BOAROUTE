package expo.modules.boaroutecar

import android.app.Presentation
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.car.app.CarContext
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * BOAROUTE's idle dash screensaver, drawn on the car Surface the same way as
 * MapRenderer and DashVideo: a Presentation on a private VirtualDisplay over
 * the host's Surface. It shows when there is no active route and no visit in
 * progress, so the car screen is never blank or plain — a dark, cinematic
 * panel with the gold BOA emblem, a softly glowing clock and a one-line status
 * (the next store, or a quiet "Ready when you are"). NavScreen swaps the map in
 * the instant a route or visit starts, so the Start Visit button and the map
 * take over seamlessly.
 */
class IdleScreensaver(private val context: CarContext) : SurfaceCallback {
  private var display: VirtualDisplay? = null
  private var presentation: Presentation? = null
  private var frame: FrameLayout? = null
  private var clock: TextView? = null
  private var status: TextView? = null

  private val handler = Handler(Looper.getMainLooper())
  private val time = SimpleDateFormat("HH:mm", Locale.UK)

  /** Redraws the clock on the minute while the screensaver is on screen. */
  private val tick = object : Runnable {
    override fun run() {
      clock?.text = time.format(Date())
      handler.postDelayed(this, 1_000)
    }
  }

  override fun onSurfaceAvailable(surfaceContainer: SurfaceContainer) {
    release()
    val surface = surfaceContainer.surface ?: return
    try {
      val vd = context.getSystemService(DisplayManager::class.java).createVirtualDisplay(
        "boaroute-idle", surfaceContainer.width, surfaceContainer.height, surfaceContainer.dpi, surface,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_OWN_CONTENT_ONLY,
      ) ?: return
      display = vd
      val p = Presentation(context, vd.display)
      val f = FrameLayout(p.context)
      f.setBackgroundColor(BACKGROUND)
      // A soft radial pool of gold light behind the emblem, for the cinematic depth.
      f.addView(View(p.context).apply {
        background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(GLOW, BACKGROUND)).apply {
          gradientType = GradientDrawable.RADIAL_GRADIENT
          gradientRadius = surfaceContainer.height.toFloat().coerceAtLeast(1f)
        }
      }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      f.addView(buildContent(p), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      p.setContentView(f)
      p.show()
      presentation = p
      frame = f
      update()
      handler.removeCallbacks(tick)
      handler.post(tick)
    } catch (_: Exception) {
      release()
    }
  }

  /** Keeps the panel clear of the host's cards and buttons. */
  override fun onVisibleAreaChanged(visibleArea: Rect) {
    frame?.setPadding(visibleArea.left, visibleArea.top, 0, 0)
  }

  override fun onSurfaceDestroyed(surfaceContainer: SurfaceContainer) = release()

  /** Refreshes the status line from CarState (the next store, or a quiet prompt). */
  fun update() {
    status?.text = CarState.start?.let { "Next · ${it.storeName}" } ?: "Ready when you are"
  }

  private fun buildContent(p: Presentation): View {
    val ctx = p.context
    val column = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(ctx, 40), dp(ctx, 24), dp(ctx, 40), dp(ctx, 24))
    }
    column.addView(ImageView(ctx).apply {
      setImageBitmap(emblem(ctx))
    }, LinearLayout.LayoutParams(dp(ctx, 76), dp(ctx, 76)).apply { bottomMargin = dp(ctx, 18) })
    column.addView(TextView(ctx).apply {
      text = "BOAROUTE"
      setTextColor(GOLD)
      setTypeface(Typeface.DEFAULT_BOLD)
      letterSpacing = 0.42f
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      gravity = Gravity.CENTER
    })
    clock = TextView(ctx).apply {
      text = time.format(Date())
      setTextColor(Color.WHITE)
      setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 72f)
      gravity = Gravity.CENTER
      setPadding(0, dp(ctx, 6), 0, 0)
      // A soft gold glow around the digits; software layer so the blur renders.
      setLayerType(View.LAYER_TYPE_SOFTWARE, null)
      setShadowLayer(dp(ctx, 16).toFloat(), 0f, 0f, GLOW_SOLID)
    }
    column.addView(clock)
    status = TextView(ctx).apply {
      setTextColor(MUTED)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      letterSpacing = 0.08f
      gravity = Gravity.CENTER
      setPadding(0, dp(ctx, 10), 0, 0)
    }
    column.addView(status)
    return column
  }

  /** A gold ring with a "BR" monogram, drawn so the screensaver needs no app asset. */
  private fun emblem(ctx: Context): Bitmap {
    val size = dp(ctx, 76)
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val r = size / 2f
    val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = dp(ctx, 2).toFloat()
      shader = LinearGradient(0f, 0f, size.toFloat(), size.toFloat(), intArrayOf(GOLD_LIGHT, GOLD, GOLD_DARK), null, Shader.TileMode.CLAMP)
    }
    canvas.drawCircle(r, r, r - dp(ctx, 3), ring)
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = GOLD
      typeface = Typeface.DEFAULT_BOLD
      textAlign = Paint.Align.CENTER
      textSize = size * 0.34f
      letterSpacing = 0.04f
    }
    val baseline = r - (text.descent() + text.ascent()) / 2f
    canvas.drawText("BR", r, baseline, text)
    return bmp
  }

  fun release() {
    handler.removeCallbacks(tick)
    presentation?.dismiss()
    display?.release()
    presentation = null
    display = null
    frame = null
    clock = null
    status = null
  }

  private fun dp(ctx: Context, value: Int): Int = (value * ctx.resources.displayMetrics.density).toInt()

  private companion object {
    const val BACKGROUND = 0xFF0B0A09.toInt()
    const val GLOW = 0x33CDA960
    const val GLOW_SOLID = 0x66CDA960
    const val GOLD = 0xFFCDA960.toInt()
    const val GOLD_LIGHT = 0xFFE8CF94.toInt()
    const val GOLD_DARK = 0xFFA27A33.toInt()
    const val MUTED = 0xFF9A938A.toInt()
  }
}
