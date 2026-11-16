plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
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
        versionCode = 3
        versionName = "1.2.0"
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

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.webkit:webkit:1.14.0")
    // The Play update library pulls in an old Fragment; the Activity Result API needs 1.3.0 or newer.
    implementation("androidx.fragment:fragment:1.8.8")
    implementation("com.google.android.play:app-update-ktx:2.1.0")
}
