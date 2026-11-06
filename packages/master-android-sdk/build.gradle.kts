plugins {
    id("com.android.application") version "8.2.2" apply false
    id("com.android.library") version "8.2.2"
    id("org.jetbrains.kotlin.android") version "1.9.22"
}

android {
    namespace = "com.sanbookpay.sdk"
    compileSdk = 34

    defaultConfig {
        minSdk = 21
        targetSdk = 34
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    api("androidx.activity:activity-ktx:1.8.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
}
