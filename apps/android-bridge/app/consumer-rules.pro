# Keep all public SDK classes
-keep class com.sanbookpay.sdk.** { *; }

# Keep the Listener so Android OS can find it
-keep class com.sanbookpay.sdk.PaymentConfirmationListener { *; }

# Keep Broadcast Receiver actions
-keepclassmembers class com.sanbookpay.sdk.** {
    public <init>();
}
