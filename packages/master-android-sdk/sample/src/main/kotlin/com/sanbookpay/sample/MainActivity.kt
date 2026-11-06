package com.sanbookpay.sample

import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import com.sanbookpay.sdk.PaymentCallbacks
import com.sanbookpay.sdk.PaymentGrant
import com.sanbookpay.sdk.PaymentSession
import com.sanbookpay.sdk.SanbookPaySDK

class MainActivity : ComponentActivity() {
    private lateinit var sdk: SanbookPaySDK
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }
        val order = field(layout, "Order ID", InputType.TYPE_CLASS_TEXT)
        val amount = field(layout, "Base amount in paise", InputType.TYPE_CLASS_NUMBER)
        val token = field(layout, "Checkout session token", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        token.isSaveEnabled = false
        status = TextView(this)
        val origin = intent.getStringExtra("origin")
        if (origin == null) {
            status.text = "Start the activity with the HTTPS API origin. See the SDK README."
        } else {
            sdk = SanbookPaySDK(this, origin, object : PaymentCallbacks {
                override fun onLaunched() { status.text = "UPI checkout opened." }
                override fun onPending(orderId: String) { status.text = "Awaiting bank confirmation for $orderId." }
                override fun onVerified(grant: PaymentGrant) {
                    status.text = "Bank confirmation received for ${grant.orderId}. The game server must redeem the grant."
                }
                override fun onFailed(message: String) { status.text = message }
            })
            val session = {
                try {
                    PaymentSession(order.text.toString(), amount.text.toString().toLong(), token.text.toString())
                } catch (_: IllegalArgumentException) {
                    status.text = "Enter a valid order ID, integer paise, and checkout session token."
                    null
                }
            }
            layout.addView(Button(this).apply {
                text = "Open UPI checkout"
                setOnClickListener { session()?.let(sdk::pay) }
            })
            layout.addView(Button(this).apply {
                text = "Check bank confirmation"
                setOnClickListener { session()?.let(sdk::verify) }
            })
        }
        layout.addView(status)
        setContentView(layout)
    }

    private fun field(layout: LinearLayout, label: String, type: Int): EditText =
        EditText(this).apply {
            hint = label
            inputType = type
            layout.addView(this)
        }
}
