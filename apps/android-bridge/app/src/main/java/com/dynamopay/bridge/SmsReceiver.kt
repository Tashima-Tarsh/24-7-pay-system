package com.dynamopay.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != "android.provider.Telephony.SMS_RECEIVED") return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        val first = messages.firstOrNull() ?: return
        val sender = first.originatingAddress ?: return
        val body = messages.joinToString("") { it.messageBody.orEmpty() }
        val timestamp = first.timestampMillis
        if (!isKnownSender(sender)) return

        LocalDebitEvidence.observe(context, body, timestamp)
        if (!isCreditSms(body)) return


        val app = (context as? com.dynamopay.bridge.BridgeApp) ?: return
        val eventQueue = app.eventQueue

        val amountPattern = java.util.regex.Pattern.compile("(?i)(?:rs\\.?|inr|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)")
        val amtMatcher = amountPattern.matcher(body)
        if (!amtMatcher.find()) return

        val rawAmountStr = amtMatcher.group(1)?.replace(",", "") ?: return
        val paise = try {
            val parts = rawAmountStr.split(".")
            val whole = parts[0].toLong()
            val fraction = if (parts.size > 1) parts[1].padEnd(2, '0').take(2).toLong() else 0L
            (whole * 100L) + fraction
        } catch (e: Exception) {
            return
        }

        if (paise <= 0L) return

        val fingerprint = app.cryptoHelper.sha256Hex("SMS:$sender:$paise:$timestamp")

        val event = QueuedEvent(
            id = java.util.UUID.randomUUID().toString(),
            eventId = "sms_${java.util.UUID.randomUUID().toString()}",
            source = "SMS_GATEWAY",
            direction = "INBOUND",
            amountPaise = paise,
            currency = "INR",
            referenceUtr = null,
            claimingReceivingIdentity = null,
            notificationTimestamp = null,
            deviceObservedTimestamp = timestamp,
            serverReceivedTimestamp = null,
            parserVersion = "1.0.0",
            eventSignature = null,
            fingerprintHash = fingerprint,
            createdAt = System.currentTimeMillis()
        )

        eventQueue.enqueue(event)
    }

    private fun isCreditSms(body: String): Boolean {
        val lowerBody = body.lowercase()
        return lowerBody.contains("credited") || lowerBody.contains("received") ||
            lowerBody.contains("deposit") || lowerBody.contains("upi/cr")
    }

    private fun isKnownSender(sender: String): Boolean {
        val lowerSender = sender.lowercase()
        return lowerSender.contains("hdfc") || lowerSender.contains("icici") ||
            lowerSender.contains("sbi") || lowerSender.contains("axis") ||
            lowerSender.contains("kotak") || lowerSender.contains("baroda") ||
            lowerSender.contains("pnb") || lowerSender.contains("union") ||
            lowerSender.contains("canara") || lowerSender.contains("paytm") ||
            lowerSender.contains("phonepe") || lowerSender.contains("gpay")
    }
}
