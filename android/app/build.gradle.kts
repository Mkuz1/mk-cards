plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val siteUrl = (project.property("MK_SITE_URL") as String).trimEnd('/')
val siteHost = uri(siteUrl).host ?: error("MK_SITE_URL must be a full https:// address")

android {
    namespace = "app.mkcards"
    compileSdk = 36

    defaultConfig {
        applicationId = project.property("MK_APPLICATION_ID") as String
        minSdk = 24
        targetSdk = 36
        versionCode = 6
        versionName = "2.0.1"
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
        buildConfigField("String", "SITE_HOST", "\"$siteHost\"")
        manifestPlaceholders["siteHost"] = siteHost
    }

    signingConfigs {
        // Release signing reads from environment variables so no secret lives in the project.
        create("release") {
            val store = System.getenv("MK_KEYSTORE")
            if (store != null) {
                storeFile = file(store)
                storePassword = System.getenv("MK_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MK_KEY_ALIAS")
                keyPassword = System.getenv("MK_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (System.getenv("MK_KEYSTORE") != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        // The launch test runs the app in Robolectric, which downloads Android itself from Maven Central.
        unitTests.all { it.systemProperty("robolectric.dependency.repo.url", "https://maven-central.storage-download.googleapis.com/maven2") }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.05.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    // QR codes are drawn on the phone, so sharing works offline.
    implementation("com.google.zxing:core:3.5.3")
    // Google's document scanner, code scanner, and on-device text and QR reading (from Google Play services).
    implementation("com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")
    implementation("com.google.android.gms:play-services-mlkit-barcode-scanning:18.3.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.webkit:webkit:1.14.0")
    // The Play update library pulls in an old Fragment; the Activity Result API needs 1.3.0 or newer.
    implementation("androidx.fragment:fragment:1.8.8")
    implementation("com.google.android.play:app-update-ktx:2.1.0")
}
