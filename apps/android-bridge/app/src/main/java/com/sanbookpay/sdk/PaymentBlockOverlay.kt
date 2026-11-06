package com.sanbookpay.sdk

import android.app.Activity
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*

class PaymentBlockOverlay(private val act: Activity) {
    private var view: FrameLayout? = null

    fun show(msg: String = "Processing Payment...\nDo not close this screen") {
        if (view != null) return
        view = FrameLayout(act).apply {
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setBackgroundColor(Color.parseColor("#E6000000"))
            elevation = 999f
            setOnTouchListener { _, _ -> true } // Block Touches

            val c = LinearLayout(act).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
                layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
            }
            c.addView(ProgressBar(act).apply { isIndeterminate = true; layoutParams = LinearLayout.LayoutParams(120, 120).apply { bottomMargin = 32; gravity = Gravity.CENTER_HORIZONTAL } })
            c.addView(TextView(act).apply { text = msg; setTextColor(Color.WHITE); textSize = 16f; gravity = Gravity.CENTER })
            addView(c)
        }
        (act.window.decorView.rootView as? ViewGroup)?.addView(view)
    }

    fun update(msg: String) { view?.let { (it.getChildAt(0) as? LinearLayout)?.getChildAt(1)?.let { (it as? TextView)?.text = msg } } }
    fun dismiss() { view?.let { (it.parent as? ViewGroup)?.removeView(it) }; view = null }
    val isShowing: Boolean get() = view != null
}
