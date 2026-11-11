#!/usr/bin/env bash
set -euo pipefail
# Native Android URI transport only. Not GPay/PhonePe, and no money moves.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
sdk="$ANDROID_HOME"
platform="$sdk/platforms/android-34/android.jar"
build_tools="$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
mkdir -p "$work/src/test/upi/receiver" "$work/classes" "$work/dex"
cat > "$work/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="test.upi.receiver">
 <uses-sdk android:minSdkVersion="23" android:targetSdkVersion="28"/>
 <application android:label="UPI smoke">
  <activity android:name=".UpiReceiver" android:exported="true">
   <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="upi" android:host="pay"/>
   </intent-filter>
  </activity>
 </application>
</manifest>
XML
cat > "$work/src/test/upi/receiver/UpiReceiver.java" <<'JAVA'
package test.upi.receiver;
import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
public final class UpiReceiver extends Activity {
 @Override protected void onCreate(Bundle saved) {
  super.onCreate(saved);
  Log.i("UPI_SMOKE","received=" + String.valueOf(getIntent().getData()));
  finish();
 }
}
JAVA
javac -source 8 -target 8 -cp "$platform" -d "$work/classes" "$work/src/test/upi/receiver/UpiReceiver.java"
"$build_tools/d8" --lib "$platform" --output "$work/dex" "$work/classes/test/upi/receiver/UpiReceiver.class"
"$build_tools/aapt" package -f -M "$work/AndroidManifest.xml" -I "$platform" -F "$work/unsigned.apk"
(cd "$work/dex" && "$build_tools/aapt" add "$work/unsigned.apk" classes.dex)
keytool -genkeypair -alias smoke -keyalg RSA -keysize 2048 -validity 1 -keystore "$work/smoke.jks" -storepass test1234 -keypass test1234 -dname "CN=UPI smoke" -noprompt >/dev/null 2>&1
"$build_tools/apksigner" sign --ks "$work/smoke.jks" --ks-key-alias smoke --ks-pass pass:test1234 --key-pass pass:test1234 --out "$work/smoke.apk" "$work/unsigned.apk"
adb install -r "$work/smoke.apk"
uri="$(node --input-type=module -e "import {buildUpiPaymentUri} from './packages/common/src/upi-qr.js'; console.log(buildUpiPaymentUri({vpa:'testuser@okaxis',name:'Test Payee',amount:10,orderId:'TEST100',note:'Payment',mode:'fixed'}))")"
echo "Generated P2P URI: $uri"
case "$uri" in
 *"mode="*|*"tid="*|*"mc="*|*"url="*) echo "FAIL: unexpected merchant field"; exit 1 ;;
esac
adb logcat -c
adb shell "am start -W -a android.intent.action.VIEW -d '$uri' -p test.upi.receiver"
sleep 2
adb logcat -d -s UPI_SMOKE:I '*:S' > "$work/receiver.log"
cat "$work/receiver.log"
grep -F "received=upi://pay?" "$work/receiver.log"
grep -F "pa=testuser%40okaxis" "$work/receiver.log"
grep -F "am=10.00" "$work/receiver.log"
echo "PASS: URI delivered to dummy receiver; not a payment success test."
