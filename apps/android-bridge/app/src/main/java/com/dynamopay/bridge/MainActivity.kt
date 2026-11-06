package com.dynamopay.bridge

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import android.widget.*
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import androidx.work.*
import com.dynamopay.bridge.workers.ForwardRetryWorker

class MainActivity : AppCompatActivity() {
    private lateinit var app: BridgeApp
    private lateinit var cryptoHelper: CryptoHelper
    private lateinit var eventQueue: EventQueue
    private lateinit var eventForwarder: EventForwarder
    private lateinit var apiClient: ApiClient
    private lateinit var healthMonitor: HealthMonitor

    private lateinit var tvStatus: TextView
    private lateinit var tvDeviceId: TextView
    private lateinit var tvEventsQueued: TextView
    private lateinit var btnPair: Button
    private lateinit var btnSettings: Button
    private lateinit var btnExportLogs: Button
    private lateinit var btnRevoke: Button
    private lateinit var upiLauncher: UpipayManager
    private lateinit var upiAppContainer: LinearLayout
    private var activePaymentId: String? = null
    private var activeAppName: String? = null

    private val paymentResult = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val paymentId = activePaymentId
        val outcome = upiLauncher.handleResult(result.resultCode, result.data, paymentId, activeAppName)
        Toast.makeText(this, "UPI app returned: $outcome. Waiting for bank confirmation.", Toast.LENGTH_LONG).show()
        if (paymentId != null) {
            apiClient.beginCheckoutVerification(paymentId) { accepted ->
                if (!accepted) Toast.makeText(this, "Return recorded locally; verification will continue when the bridge is connected.", Toast.LENGTH_LONG).show()
            }
        }
        clearUpiApps()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        app = applicationContext as BridgeApp
        cryptoHelper = app.cryptoHelper
        eventQueue = app.eventQueue
        eventForwarder = app.eventForwarder
        healthMonitor = app.healthMonitor
        apiClient = ApiClient(this, cryptoHelper, getSecurePrefs())
        upiLauncher = UpipayManager(this)

        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
        }

        val title = TextView(this).apply {
            text = "Dynamo Bridge"
            textSize = 26f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setPadding(0, 0, 0, 24)
        }
        layout.addView(title)

        tvStatus = TextView(this).apply {
            text = "Status: Checking..."
            textSize = 18f
            setPadding(0, 12, 0, 24)
        }
        layout.addView(tvStatus)

        tvDeviceId = TextView(this).apply {
            text = "Device ID: -"
            textSize = 14f
            setPadding(0, 0, 0, 24)
        }
        layout.addView(tvDeviceId)

        tvEventsQueued = TextView(this).apply {
            text = "Events queued: 0"
            textSize = 14f
            setPadding(0, 0, 0, 24)
        }
        layout.addView(tvEventsQueued)

        btnPair = Button(this).apply {
            text = "Scan Pairing QR"
            setOnClickListener {
                val intent = Intent(this@MainActivity, QrPairingActivity::class.java)
                startActivity(intent)
            }
        }
        layout.addView(btnPair)

        btnSettings = Button(this).apply {
            text = "Device Settings"
            setOnClickListener {
                val intent = Intent(this@MainActivity, DeviceSettingsActivity::class.java)
                startActivity(intent)
            }
        }
        layout.addView(btnSettings)

        btnExportLogs = Button(this).apply {
            text = "Export Logs (Redacted)"
            setOnClickListener {
                exportLogs()
            }
        }
        layout.addView(btnExportLogs)

        btnRevoke = Button(this).apply {
            text = "Revoke Device"
            setVisibility(android.view.View.GONE)
            setOnClickListener {
                revokeDevice()
            }
        }
        layout.addView(btnRevoke)

        upiAppContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = android.view.View.GONE
            setPadding(0, 20, 0, 0)
        }
        layout.addView(upiAppContainer)

        val privacyNotice = TextView(this).apply {
            text = "Dynamo Bridge opens your chosen UPI app for checkout. " +
                "It never collects UPI PINs, passwords, or OTPs."
            textSize = 12f
            setPadding(0, 24, 0, 0)
        }
        layout.addView(privacyNotice)

        setContentView(layout)
        updateStatus()

        if (apiClient.isPaired()) {
            // Event-triggered forwarding: attempt immediate forward when paired and connected.
            attemptImmediateForward()
            // Retain WorkManager-based durable retry + periodic reconciliation (not a 5s poll loop).
            scheduleDurableRetryAndReconciliation()
        }
        handleUpiHandoff(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleUpiHandoff(intent)
    }

    /**
     * Browser handoff is deliberately narrow: only a canonical upi://pay URI and a checkout
     * identifier are accepted. We discover installed UPI handlers before package-specific
     * launch, matching the native Android integration pattern used by established SDKs.
     */
    private fun handleUpiHandoff(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "dynamopay" || data.host != "pay") return
        val paymentId = data.getQueryParameter("paymentId")?.trim().orEmpty()
        val upiUriString = data.getQueryParameter("upiUri")?.trim().orEmpty()
        val upiUri = try { Uri.parse(upiUriString) } catch (_: Exception) { null }
        if (paymentId.isBlank() || !isCanonicalUpiUri(upiUri)) {
            Toast.makeText(this, "Invalid checkout handoff.", Toast.LENGTH_LONG).show()
            return
        }
        activePaymentId = paymentId
        showCompatibleUpiApps(upiUri!!)
    }

    private fun isCanonicalUpiUri(uri: Uri?): Boolean {
        if (uri?.scheme != "upi" || uri.host != "pay") return false
        val amount = uri.getQueryParameter("am")?.toBigDecimalOrNull() ?: return false
        return amount > java.math.BigDecimal.ZERO &&
            !uri.getQueryParameter("pa").isNullOrBlank() &&
            !uri.getQueryParameter("pn").isNullOrBlank() &&
            !uri.getQueryParameter("tn").isNullOrBlank()
    }

    private fun showCompatibleUpiApps(upiUri: Uri) {
        clearUpiApps()
        val heading = TextView(this).apply {
            text = "Choose your installed UPI app"
            textSize = 18f
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        upiAppContainer.addView(heading)
        val apps = upiLauncher.discoverCompatibleUpiApps()
        if (apps.isEmpty()) {
            Toast.makeText(this, "No compatible UPI app is installed on this device.", Toast.LENGTH_LONG).show()
            clearUpiApps()
            return
        }
        apps.forEach { app ->
            upiAppContainer.addView(Button(this).apply {
                text = app.appName ?: app.packageName
                setOnClickListener {
                    activeAppName = app.appName ?: app.packageName
                    try {
                        upiLauncher.initiatePayment(paymentResult, upiUri, app.packageName)
                    } catch (_: Exception) {
                        Toast.makeText(this@MainActivity, "Could not open ${app.appName ?: "this UPI app"}.", Toast.LENGTH_LONG).show()
                    }
                }
            })
        }
        upiAppContainer.visibility = android.view.View.VISIBLE
    }

    private fun clearUpiApps() {
        if (!::upiAppContainer.isInitialized) return
        upiAppContainer.removeAllViews()
        upiAppContainer.visibility = android.view.View.GONE
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
        // Whenever the app comes to the foreground, retry any pending events if connected.
        if (apiClient.isPaired() && hasConnectivity()) {
            attemptImmediateForward()
        }
    }

    private fun updateStatus() {
        if (apiClient.isPaired()) {
            val deviceId = apiClient.getDeviceId() ?: "unknown"
            tvStatus.text = "Status: CONNECTED"
            tvStatus.setTextColor(android.graphics.Color.parseColor("#047857"))
            tvDeviceId.text = "Device ID: $deviceId"
            btnPair.visibility = android.view.View.GONE
            btnRevoke.visibility = android.view.View.VISIBLE
            btnSettings.visibility = android.view.View.VISIBLE
            btnExportLogs.visibility = android.view.View.VISIBLE

            val queueSize = eventQueue.getQueueSize()
            tvEventsQueued.text = "Events queued: $queueSize"

            healthMonitor.reportHealth()
        } else {
            tvStatus.text = "Status: NOT PAIRED"
            tvStatus.setTextColor(android.graphics.Color.parseColor("#b91c1c"))
            tvDeviceId.text = "Device ID: -"
            btnPair.visibility = android.view.View.VISIBLE
            btnRevoke.visibility = android.view.View.GONE
            btnSettings.visibility = android.view.View.GONE
            btnExportLogs.visibility = android.view.View.GONE
            tvEventsQueued.text = "Events queued: 0"
        }
    }

    /**
     * Event-triggered forwarding: forwards pending events immediately when connectivity is
     * available, instead of waiting on a fixed 5-second polling loop. Safe to call frequently;
     * the forwarder is idempotent and deduplicates.
     */
    private fun attemptImmediateForward() {
        if (!hasConnectivity()) {
            // No connectivity: leave events in the encrypted local queue; WorkManager retries
            // when connectivity returns. Do not busy-poll.
            return
        }
        try {
            val baseUrl = apiClient.getBaseUrl()
            val deviceId = apiClient.getDeviceId() ?: return
            val signingKey = cryptoHelper.getHmacSecret() ?: return
            eventForwarder.forwardPendingEvents(baseUrl, deviceId, signingKey)
            tvEventsQueued.text = "Events queued: ${eventQueue.getQueueSize()}"
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Schedules WorkManager-based durable retry (exponential backoff, network-required) and
     * periodic reconciliation. Replaces the avoidable 5-second polling wait.
     */
    private fun scheduleDurableRetryAndReconciliation() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        // Durable retry worker with exponential backoff, survives process death.
        val retryWork = OneTimeWorkRequestBuilder<ForwardRetryWorker>()
            .setConstraints(constraints)
            .setInitialDelay(5, java.util.concurrent.TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(this)
            .enqueueUniqueWork("dynamo_bridge_forward_retry", ExistingWorkPolicy.REPLACE, retryWork)

        // Periodic reconciliation (e.g. every 15 minutes) to sweep any events not yet forwarded.
        val reconcileWork = PeriodicWorkRequestBuilder<ForwardRetryWorker>(
            15, java.util.concurrent.TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this)
            .enqueueUniquePeriodicWork("dynamo_bridge_reconcile", ExistingPeriodicWorkPolicy.REPLACE, reconcileWork)
    }

    private fun hasConnectivity(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        if (Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            val network = cm.activeNetwork
            if (network == null) return false
            val caps = cm.getNetworkCapabilities(network)
            return caps != null && (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
        }
        return cm.activeNetworkInfo?.isConnectedOrConnecting == true
    }

    private fun revokeDevice() {
        val confirmed = android.app.AlertDialog.Builder(this)
            .setTitle("Revoke Device")
            .setMessage("This will unregister this device from Dynamo Bridge. You will need to re-pair to resume observation.")
            .setPositiveButton("Revoke") { _, _ ->
                val success = apiClient.revokeDevice()
                if (success) {
                    Toast.makeText(this@MainActivity, "Device revoked", Toast.LENGTH_SHORT).show()
                    updateStatus()
                } else {
                    Toast.makeText(this@MainActivity, "Revoke failed", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .create()
        confirmed.show()
    }

    private fun exportLogs() {
        val events = eventQueue.getAllEvents()
        val logBuilder = StringBuilder()
        logBuilder.append("Dynamo Bridge Log Export (Redacted)\n")
        logBuilder.append("Generated: ${System.currentTimeMillis()}\n")
        logBuilder.append("Total events: ${events.size}\n\n")

        for (event in events) {
            logBuilder.append("Event ID: ${event.eventId}\n")
            logBuilder.append("Source: ${event.source}\n")
            logBuilder.append("Amount: ${event.amountPaise} ${event.currency}\n")
            logBuilder.append("Reference: ${event.referenceUtr ?: "N/A"}\n")
            logBuilder.append("Timestamp: ${event.deviceObservedTimestamp}\n")
            logBuilder.append("Attempts: ${event.attempts}\n")
            logBuilder.append("---\n")
        }

        val intent = Intent().apply {
            action = Intent.ACTION_SEND
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Dynamo Bridge Log Export")
            putExtra(Intent.EXTRA_TEXT, logBuilder.toString())
        }
        startActivity(Intent.createChooser(intent, "Export Logs"))
    }

    private fun getSecurePrefs(): SharedPreferences {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        return EncryptedSharedPreferences.create(
            "dynamo_bridge_secure_prefs",
            masterKeyAlias,
            this,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
