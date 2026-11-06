package com.sanbookpay.sdk

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import java.util.regex.Pattern

class PaymentConfirmationListener : NotificationListenerService() {
    companion object {
        const val ACTION_CONFIRMED = "com.sanbookpay.PAYMENT_CONFIRMED"
        const val EXTRA_ORDER_ID = "orderId"
        const val EXTRA_AMOUNT = "amount"
        const val EXTRA_UTR = "utr"

        @Volatile var activeOrderId: String? = null
        @Volatile var activeAmount: Long = 0L
        @Volatile var isActive: Boolean = false

        fun start(ctx: Context, orderId: String, amount: Long) {
            activeOrderId = orderId; activeAmount = amount; isActive = true
            ctx.startForegroundService(Intent(ctx, PaymentConfirmationListener::class.java))
        }
        fun stop(ctx: Context) {
            isActive = false; activeOrderId = null
            ctx.stopService(Intent(ctx, PaymentConfirmationListener::class.java))
        }
    }

    override fun onCreate() { super.onCreate(); startForeground(9999, createNotif()) }
    override fun onStartCommand(i: Intent?, f: Int, id: Int): Int = START_STICKY
    override fun onBind(i: Intent?): IBinder? = null

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (!isActive || sbn == null) return
        val pkg = sbn.packageName ?: return
        if (!pkg.lowercase().contains(Regex("gpay|phonepe|paytm|bhim|bank|upi"))) return

        val extras = sbn.notification.extras ?: return
        val text = "${extras.getString(Notification.EXTRA_TITLE)} ${extras.getCharSequence(Notification.EXTRA_TEXT)}"

        // Check for DEBIT
        if (!text.lowercase().contains(Regex("debited|sent|spent|paid"))) return

        // Extract Amount
        val m = Pattern.compile("(?i)(?:₹|rs\\.?|inr)\\s*([\\d,]+(?:\\.\\d{1,2})?)").matcher(text)
        if (!m.find()) return
        val detected = (m.group(1)?.replace(",", "")?.toDouble() ?: 0.0) * 100

        // Validate Match
        if (activeOrderId != null && Math.abs(detected - activeAmount) <= 99) {
            // Extract UTR
            val utrM = Pattern.compile("(?i)(?:utr|ref|txn)[\\s:#]+([a-zA-Z0-9]{12,35})").matcher(text)
            val utr = if (utrM.find()) utrM.group(1) else "UNKNOWN"

            // Broadcast Success
            LocalBroadcastManager.getInstance(this).sendBroadcast(
                Intent(ACTION_CONFIRMED).apply {
                    putExtra(EXTRA_ORDER_ID, activeOrderId)
                    putExtra(EXTRA_AMOUNT, detected.toLong())
                    putExtra(EXTRA_UTR, utr)
                }
            )
            stop(this)
        }
    }

    private fun createNotif() = NotificationCompat.Builder(this, "ch")
        .setContentTitle("Verifying Payment")
        .setContentText("Complete your UPI payment")
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setOngoing(true).build()
}
