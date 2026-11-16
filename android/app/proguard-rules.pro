# Methods called from the web page through the MKNative bridge must keep their names.
-keepclassmembers class app.mkcards.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
