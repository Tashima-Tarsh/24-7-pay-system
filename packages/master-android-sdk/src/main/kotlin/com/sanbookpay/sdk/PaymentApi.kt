package com.sanbookpay.sdk

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

internal class PaymentApi(context: Context, baseUrl: String) {
    private val app = context.applicationContext
    private val base = baseUrl.toHttpUrl().also {
        require(it.isHttps && it.username.isEmpty() && it.password.isEmpty() &&
            it.encodedPath == "/" && it.query == null && it.fragment == null) {
            "Provide the Sanbook Pay HTTPS origin"
        }
    }
    private val client = OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    suspend fun allocate(session: PaymentSession): String {
        val result = request("api/upi/next", session, post = false) ?: error("Checkout allocation was empty")
        require(result.getString("orderId") == session.orderId) { "Checkout order mismatch" }
        val amountPaise = result.getLong("amountPaise")
        require(amountPaise > session.baseAmountPaise && amountPaise - session.baseAmountPaise <= 99L) {
            "Checkout amount mismatch"
        }
        return checkoutUri(
            result.getString("paymentUri"), amountPaise, result.getString("upiId"), result.getString("txnRef")
        )
    }

    suspend fun verify(session: PaymentSession): PaymentGrant? {
        val result = request("api/transactions/verify", session, post = true) ?: return null
        val amountPaise = result.getLong("amountPaise")
        val token = result.getString("token")
        require(result.getString("orderId") == session.orderId &&
            amountPaise > session.baseAmountPaise && amountPaise - session.baseAmountPaise <= 99L && token.isNotBlank()) {
            "Payment verification response does not match the checkout"
        }
        return PaymentGrant(session.orderId, amountPaise, token)
    }

    private suspend fun request(path: String, session: PaymentSession, post: Boolean): JSONObject? =
        withContext(Dispatchers.IO) {
            val deviceId = Settings.Secure.getString(app.contentResolver, Settings.Secure.ANDROID_ID)
            require(!deviceId.isNullOrBlank()) { "Android device identity is unavailable" }
            val request = Request.Builder()
                .url(checkNotNull(base.resolve(path)))
                .header("Authorization", "Bearer ${session.sessionToken}")
                .header("Accept", "application/json")
                .header("x-device-id", deviceId)
                .header("x-app-signature", appSignature())
                .header("x-device-model", Build.MODEL.orEmpty().filter { it in ' '..'~' }.ifBlank { "unknown" })
                .header("x-os-version", Build.VERSION.RELEASE.orEmpty().filter { it in ' '..'~' }.ifBlank { "unknown" })
            if (post) request.post(ByteArray(0).toRequestBody())
            client.newCall(request.build()).execute().use { response ->
                if (post && response.code == 402) return@withContext null
                check(response.isSuccessful) { "Sanbook Pay request failed (HTTP ${response.code})" }
                JSONObject(response.body?.string().orEmpty())
            }
        }

    @Suppress("DEPRECATION")
    private fun appSignature(): String {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            app.packageManager.getPackageInfo(app.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                .signingInfo?.apkContentsSigners
        } else {
            app.packageManager.getPackageInfo(app.packageName, PackageManager.GET_SIGNATURES).signatures
        }
        val certificate = signatures?.singleOrNull() ?: error("Exactly one current app signing certificate is required")
        return MessageDigest.getInstance("SHA-256").digest(certificate.toByteArray()).joinToString("") {
            "%02x".format(it.toInt() and 0xff)
        }
    }
}
