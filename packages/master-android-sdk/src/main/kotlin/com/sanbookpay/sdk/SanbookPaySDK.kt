package com.sanbookpay.sdk

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** An order and its short-lived checkout token, issued through the game server. */
class PaymentSession(val orderId: String, val baseAmountPaise: Long, val sessionToken: String) {
    init {
        require(orderId.isNotBlank() && baseAmountPaise > 0 && sessionToken.isNotBlank()) { "Invalid checkout session" }
    }
}

/** A grant received from Sanbook Pay that must be redeemed by the game server before crediting. */
class PaymentGrant(val orderId: String, val amountPaise: Long, val token: String)

interface PaymentCallbacks {
    fun onLaunched()
    fun onPending(orderId: String)
    fun onVerified(grant: PaymentGrant)
    fun onFailed(message: String)
}

/** Create once per activity, during onCreate, and invoke its operations on the main thread. */
class SanbookPaySDK(
    private val activity: ComponentActivity,
    baseUrl: String,
    private val callbacks: PaymentCallbacks,
    restoredSession: PaymentSession? = null
) {
    private val api = PaymentApi(activity, baseUrl)
    private var activeSession = restoredSession
    private var running = false

    private val launcher = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val session = activeSession ?: return@registerForActivityResult
        activeSession = null
        verify(session)
    }

    /** Fetches the canonical checkout allocation and opens the Android UPI chooser. */
    fun pay(session: PaymentSession) {
        if (running || activeSession != null) {
            callbacks.onFailed("A checkout is already in progress")
            return
        }
        running = true
        activity.lifecycleScope.launch {
            val failure = try {
                val uri = api.allocate(session)
                val payment = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
                if (payment.resolveActivity(activity.packageManager) == null) throw ActivityNotFoundException()
                activeSession = session
                launcher.launch(Intent.createChooser(payment, "Pay with UPI"))
                null
            } catch (error: CancellationException) {
                activeSession = null
                throw error
            } catch (_: ActivityNotFoundException) {
                activeSession = null
                "No compatible UPI app is installed"
            } catch (_: Exception) {
                activeSession = null
                "Unable to open the UPI checkout"
            } finally {
                running = false
            }
            if (failure == null) callbacks.onLaunched() else callbacks.onFailed(failure)
        }
    }

    /** Checks bank-backed server state. Call again on a user retry after onPending. */
    fun verify(session: PaymentSession) {
        if (running || activeSession != null) {
            callbacks.onFailed("A checkout is already in progress")
            return
        }
        running = true
        activity.lifecycleScope.launch {
            val grant = try {
                api.verify(session)
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                running = false
                callbacks.onFailed("Unable to check the payment. Try again from the same order.")
                return@launch
            } finally {
                running = false
            }
            if (grant == null) callbacks.onPending(session.orderId) else callbacks.onVerified(grant)
        }
    }
}
