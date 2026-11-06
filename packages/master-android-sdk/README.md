# Sanbook Pay Android Game SDK

This Android library opens the server-issued UPI intent and checks the result against the payment API. It supports API level 21 and later. Build it using JDK 17, Android platform 34 and Android build tools 34.0.0.

```sh
./gradlew :testDebugUnitTest :assembleRelease :sample:assembleDebug
```

On Windows use `gradlew.bat`. The AAR is in `build/outputs/aar`. When consuming a standalone AAR file, declare the Activity KTX, Lifecycle Runtime KTX and OkHttp dependencies from this project's build file in the game app. An included Gradle module resolves these dependencies automatically.

## Integrate a game

1. Keep the merchant key on the game server. After authorizing the player and creating an order in integer paise, call `POST /api/payment-sessions` with the order ID, amount and SHA-256 fingerprint of the game's signing certificate. Give the resulting checkout session token, order ID and base amount to that player.
2. In the game's `ComponentActivity.onCreate`, construct `SanbookPaySDK(activity, "https://pay.example.com", callbacks)` before the activity starts. Call `pay(PaymentSession(orderId, baseAmountPaise, sessionToken))` on the main thread when the player selects UPI.
3. When a UPI activity returns, the SDK checks the payment API using the session. It ignores the UPI app's reported success or failure. If the server is still waiting for bank confirmation, use `onPending` and let the player retry `verify(session)` from the same order.
4. In `onVerified`, forward the grant to your game server over the game's authenticated API. The game server uses its merchant credential to redeem the grant with `POST /api/transactions/redeem`. Bind the order to the authenticated player and apply game credit once in a durable transaction keyed by the order ID.
5. To recover after activity recreation, pass a restored pending session to the constructor in the same place you first registered the SDK. Recover the session from the authenticated game server if needed. After process death, your UI can also retry verification directly for the pending order. Avoid saving bearer tokens in unencrypted state or logging them.

The SDK uses the exact server allocation in paise. The verification grant arrives from the authenticated HTTPS API. Grant signature validation and redemption happen on the server. The merged SDK manifest provides internet permission and package visibility for popular and generic UPI handlers.

## Run the sample

1. Build and install `sample/build/outputs/apk/debug/sample-debug.apk` on a phone with a UPI handler. Run `./gradlew :sample:signingReport` to get the debug signing fingerprint. Use the fingerprint without colons for the server's app registration.
2. Start the sample with the API origin.

   ```sh
   adb shell am start -n com.sanbookpay.sample/.MainActivity --es origin https://pay.example.com
   ```

3. Create a session through a development game server and enter the order ID, base paise and session token into the sample. Open the UPI chooser, or check bank confirmation for that order. The sample displays callback status and leaves redemption to the game server.
