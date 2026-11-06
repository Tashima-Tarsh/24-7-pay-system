package com.sanbookpay.sdk

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.util.Locale
import java.util.UUID

object UpiIntentBuilder {
    fun create(context: Context, upiId: String, name: String, basePaise: Int, orderId: String): IntentResult {
        // 1. Paise Offset (Unique Amount)
        val offset = (1..99).random()
        val finalPaise = basePaise + offset
        val rupees = String.format(Locale.US, "%.2f", finalPaise / 100.0)

        // 2. Unique Transaction Ref (Alphanumeric Only)
        val txnRef = "SB${System.currentTimeMillis()}${UUID.randomUUID().toString().replace("-", "").take(6)}".take(35)

        // 3. Build URI
        val uri = Uri.parse("upi://pay").buildUpon().apply {
            appendQueryParameter("pa", upiId)
            appendQueryParameter("pn", name)
            appendQueryParameter("am", rupees)
            appendQueryParameter("cu", "INR")
            appendQueryParameter("tr", txnRef)
            appendQueryParameter("tn", orderId.replace(Regex("[^a-zA-Z0-9]"), "").take(80))
        }.build()

        // 4. Save for Listener Matching
        context.getSharedPreferences("sanbookpay", Context.MODE_PRIVATE).edit().apply {
            putLong("pending_amt_$orderId", finalPaise.toLong())
            putString("pending_ref_$orderId", txnRef)
            apply()
        }

        return IntentResult(Intent(Intent.ACTION_VIEW, uri), finalPaise, offset, txnRef)
    }

    data class IntentResult(val intent: Intent, val finalPaise: Int, val offset: Int, val ref: String)
}
