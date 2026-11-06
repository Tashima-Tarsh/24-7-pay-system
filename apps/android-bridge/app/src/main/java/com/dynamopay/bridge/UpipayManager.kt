package com.dynamopay.bridge

import android.app.Activity
import android.content.Intent
import android.net.Uri
import java.util.Locale
import java.util.UUID

object UpipayManager {

    private const val UPI_REQUEST_CODE = 1001

    fun initiatePayment(
        activity: Activity,
        merchantUpiId: String,
        merchantName: String,
        amount: Double,
        orderId: String
    ) {
        // Clean Order ID (Alphanumeric only)
        val cleanOrderId = orderId.replace(Regex("[^a-zA-Z0-9]"), "")

        // Generate Unique TR (Strictly alphanumeric, max 35 chars)
        val uniqueTr = "TXN${System.currentTimeMillis()}${UUID.randomUUID().toString().replace("-", "").substring(0, 4)}"

        // Build Bulletproof URI
        val uri = Uri.parse("upi://pay").buildUpon().apply {
            appendQueryParameter("pa", merchantUpiId)
            appendQueryParameter("pn", merchantName)
            appendQueryParameter("am", String.format(Locale.US, "%.2f", amount))
            appendQueryParameter("cu", "INR")
            appendQueryParameter("tr", uniqueTr)
            appendQueryParameter("tn", cleanOrderId)
        }.build()

        val intent = Intent(Intent.ACTION_VIEW, uri)

        try {
            activity.startActivityForResult(intent, UPI_REQUEST_CODE)
        } catch (e: Exception) {
            println("No UPI app found on device")
        }
    }

    fun handleResult(resultCode: Int, data: Intent?): Pair<Boolean, String> {
        if (resultCode == Activity.RESULT_OK && data != null) {
            val response = data.getStringExtra("response")

            if (response != null) {
                if (response.contains("Status=SUCCESS", ignoreCase = true)) {
                    val txnRef = response.substringAfter("txnRef=", "UNKNOWN")
                    return Pair(true, "Success: $txnRef")
                } else if (response.contains("Status=FAILURE", ignoreCase = true)) {
                    return Pair(false, "Payment Failed")
                }
            }
        }
        return Pair(false, "Payment Cancelled or Failed")
    }
}
