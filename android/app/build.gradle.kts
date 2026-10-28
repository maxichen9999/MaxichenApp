import java.util.Properties
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 🔑 Release-Signatur: liest keystore.properties (nicht im Repo) oder ENV-Variablen.
//    Ohne Schlüssel baut Gradle trotzdem — dann eben unsigniert (und nicht installierbar).
val keystoreProps = Properties()
run {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) {
        val stream = f.inputStream()
        keystoreProps.load(stream)
        stream.close()
    }
}
fun ks(key: String, env: String): String? =
    keystoreProps.getProperty(key) ?: System.getenv(env)

android {
    namespace = "de.maxichen.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "de.maxichen.app"
        minSdk = 24          // 🌍 V4.13: Android 7.0 — StrongBox bleibt optional (API 28+)
        targetSdk = 36
        versionCode = 19
        versionName = "4.15"
        ndk {
            // nur echte Handy-CPUs (spart ~30 MB)
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
    }

    signingConfigs {
        create("release") {
            val storePath = ks("storeFile", "KEYSTORE_FILE")
            if (storePath != null) {
                storeFile = file(storePath)
                storePassword = ks("storePassword", "KEYSTORE_PASSWORD")
                keyAlias = ks("keyAlias", "KEY_ALIAS")
                keyPassword = ks("keyPassword", "KEY_PASSWORD")
                // v1 + v2 + v3: v1 brauchen alte Geräte, v2/v3 moderne.
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (ks("storeFile", "KEYSTORE_FILE") != null) signingConfigs.getByName("release") else null
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation(platform("androidx.compose:compose-bom:2024.09.03"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    implementation("androidx.navigation:navigation-compose:2.8.9")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // V3: Bilder, Animationen
    implementation("io.coil-kt:coil-compose:2.6.0")
    implementation("com.airbnb.android:lottie-compose:6.4.0")
    // V4: App-Sperre mit Fingerabdruck
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.fragment:fragment-ktx:1.8.2")
    // WebRTC (Re-Publish auf Maven Central, identische org.webrtc.* API)
    implementation("io.github.webrtc-sdk:android:125.6422.07")
    debugImplementation("androidx.compose.ui:ui-tooling")
    // V4.5: echte JVM-Tests für Curve25519 + Doppel-Ratchet
    testImplementation("junit:junit:4.13.2")
}
