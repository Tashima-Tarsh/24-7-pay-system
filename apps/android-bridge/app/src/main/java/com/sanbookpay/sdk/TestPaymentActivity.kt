package com.sanbookpay.sdk

import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class TestPaymentActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tv = TextView(this).apply { text = "SanbookPay GPay Test\nClick to Pay ₹1.00"; textSize = 18f; setPadding(48,96,48,48) }
        val btn = Button(this).apply {
            text = "TEST GPAY HANDSHAKE"; textSize = 16f
            setOnClickListener {
                SanbookPaySDK.init(this@TestPaymentActivity)
                SanbookPaySDK.pay(
                    activity = this@TestPaymentActivity,
                    upiId = "YOUR_UPI@okhdfcbank", // REPLACE THIS
                    name = "Test Merchant",
                    paise = 100,
                    oid = "TEST_${System.currentTimeMillis()}",
                    onVerified = { amt, utr -> tv.text = "✅ SUCCESS: ₹${amt/100.0}\nUTR: $utr" },
                    onFailed = { err -> tv.text = "❌ FAILED: $err" }
                )
            }
        }
        val res = TextView(this).apply { id = android.R.id.text1; text = "Status: Waiting..."; setPadding(48,24,48,48) }
        val layout = android.widget.LinearLayout(this).apply { orientation = android.widget.LinearLayout.VERTICAL; addView(tv); addView(btn); addView(res) }
        setContentView(layout)
    }
}
