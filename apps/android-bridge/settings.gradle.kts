pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "DynamoBridge"
include(":app")
include(":upi-intent-sdk")
project(":upi-intent-sdk").projectDir = file("../../packages/android-upi-intent-sdk")
