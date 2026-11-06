package com.dynamopay.bridge

import android.content.Context

internal object LocalDebitEvidence {
    private const val MATCH_WINDOW_MS = 5 * 60 * 1000L
    private val debit = Regex("""\b(?:debited|sent|spent|paid)\b""", RegexOption.IGNORE_CASE)
    private val nonDebit = Regex(
        """\b(?:failed|declined|pending|reversed|refunded|credited|received|unsuccessful|not)\b""",
        RegexOption.IGNORE_CASE
    )
    private val amount = Regex(
        """(?:₹|\b(?:rs\.?|inr))\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)(?![\d,]|\.\d)""",
        RegexOption.IGNORE_CASE
    )
    private val decimal = Regex("""[0-9]+(?:\.[0-9]{1,2})?""")

    fun preferences(context: Context) =
        context.getSharedPreferences("local_debit_evidence", Context.MODE_PRIVATE)

    fun toPaise(value: String?): Long? {
        if (value == null || !decimal.matches(value)) return null
        return try {
            value.toBigDecimal().movePointRight(2).longValueExact().takeIf { it > 0L }
        } catch (_: ArithmeticException) {
            null
        }
    }

    @Synchronized
    fun start(context: Context, paymentId: String, paise: Long, packageName: String) {
        preferences(context).edit().clear()
            .putString("paymentId", paymentId)
            .putLong("paise", paise)
            .putString("packageName", packageName)
            .putLong("startedAt", System.currentTimeMillis())
            .apply()
    }

    @Synchronized
    fun clearPending(context: Context, paymentId: String) {
        val prefs = preferences(context)
        if (prefs.getString("paymentId", null) == paymentId && !prefs.contains("source")) {
            prefs.edit().clear().apply()
        }
    }

    @Synchronized
    fun observe(context: Context, message: String, timestamp: Long, packageName: String? = null) {
        val prefs = preferences(context)
        if (!prefs.contains("paymentId") || prefs.contains("source")) return
        if (packageName != null && packageName != prefs.getString("packageName", null)) return
        val startedAt = prefs.getLong("startedAt", 0L)
        val deadline = startedAt + MATCH_WINDOW_MS
        if (timestamp !in startedAt..deadline || System.currentTimeMillis() > deadline) return
        if (!debit.containsMatchIn(message) || nonDebit.containsMatchIn(message)) return
        val rawAmount = amount.find(message)?.groupValues?.get(1) ?: return
        val paise = toPaise(rawAmount.replace(",", "")) ?: return
        if (paise != prefs.getLong("paise", 0L)) return
        prefs.edit().putString("source", if (packageName == null) "SMS" else "UPI notification").apply()
    }

    fun matchedSource(context: Context, paymentId: String?): String? {
        val prefs = preferences(context)
        if (paymentId == null || prefs.getString("paymentId", null) != paymentId) return null
        return prefs.getString("source", null)
    }
}
