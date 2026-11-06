package com.dynamopay.bridge

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import com.sanbookpay.upiintent.UpiCaptureResult
import com.sanbookpay.upiintent.UpiIntentEngine
import com.sanbookpay.upiintent.UpiResponseParser

internal class UpipayManager(context: Context) {
    private val engine = UpiIntentEngine(context)

    fun discoverCompatibleUpiApps() = engine.discoverCompatibleUpiApps()

    fun initiatePayment(launcher: ActivityResultLauncher<Intent>, uri: Uri, packageName: String) {
        launcher.launch(engine.createLaunchIntentForApp(uri, packageName))
    }

    fun handleResult(resultCode: Int, data: Intent?, paymentId: String?, appName: String?): String {
        if (resultCode != Activity.RESULT_OK) return "CANCELLED"
        val id = paymentId ?: return "UNKNOWN"
        val parsed = UpiResponseParser.parseIntentReturn(
            data, id, id, null, "ANDROID", appName, "native-return-$id", emptyMap()
        )
        return (parsed as? UpiCaptureResult.Returned)?.paymentReturn?.parsedStatus ?: "UNKNOWN"
    }
}
