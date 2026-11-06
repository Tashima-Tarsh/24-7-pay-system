package com.sanbookpay.sdk

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Settings
import android.widget.Toast
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import kotlinx.coroutines.*

object SanbookPaySDK {
    private var overlay: PaymentBlockOverlay? = null
    private var receiver: BroadcastReceiver? = null
    private var job: Job? = null

    fun init(ctx: Context) {
        val cn = android.content.ComponentName(ctx, PaymentConfirmationListener::class.java)
        val flat = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners")
        if (flat?.contains(cn.flattenToString()) != true) {
            Toast.makeText(ctx, "Enable Notification Access for payments", Toast.LENGTH_LONG).show()
            ctx.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    fun pay(act: Activity, upi: String, name: String, paise: Int, oid: String,
            onVerified: (Int, String) -> Unit, onFailed: (String) -> Unit) {

        overlay = PaymentBlockOverlay(act); overlay?.show()
        PaymentConfirmationListener.start(act, oid, paise.toLong())

        receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) {
                if (i?.getStringExtra(PaymentConfirmationListener.EXTRA_ORDER_ID) == oid) {
                    job?.cancel()
                    overlay?.dismiss()
                    cleanup(act)
                    onVerified(i.getLongExtra(PaymentConfirmationListener.EXTRA_AMOUNT, 0).toInt(),
                               i.getStringExtra(PaymentConfirmationListener.EXTRA_UTR) ?: "")
                }
            }
        }
        LocalBroadcastManager.getInstance(act).registerReceiver(receiver!!, IntentFilter(PaymentConfirmationListener.ACTION_CONFIRMED))

        try {
            val res = UpiIntentBuilder.create(act, upi, name, paise, oid)
            act.startActivity(res.intent)
            overlay?.update("UPI Opened\nWaiting for bank confirmation...")
        } catch (e: Exception) {
            overlay?.dismiss(); cleanup(act); onFailed("No UPI app found")
            return
        }

        job = CoroutineScope(Dispatchers.Main).launch {
            delay(4 * 60 * 1000) // 4 Minutes
            if (overlay?.isShowing == true) {
                overlay?.dismiss(); cleanup(act); PaymentConfirmationListener.stop(act)
                onFailed("Timeout: Payment not confirmed in 4 mins")
            }
        }
    }

    private fun cleanup(act: Activity) {
        receiver?.let { LocalBroadcastManager.getInstance(act).unregisterReceiver(it) }
        receiver = null; overlay = null; job = null
    }
}
