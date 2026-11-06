plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sanbookpay.sample"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sanbookpay.sample"
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
    implementation(project(":"))
}
