package org.chromium.support_lib_boundary;

import android.webkit.WebView;
import java.lang.reflect.InvocationHandler;

// Subset of the boundary interface bundled by androidx.webkit. The WebView glue
// resolves methods by this class name, so the package and signatures must match.
public interface WebViewProviderFactoryBoundaryInterface {
    InvocationHandler createWebView(WebView webview);
    String[] getSupportedFeatures();
}
