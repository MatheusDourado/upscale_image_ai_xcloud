package com.imagefilter.xcloud;

import android.webkit.WebView;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import org.chromium.support_lib_boundary.WebViewProviderBoundaryInterface;
import org.chromium.support_lib_boundary.WebViewProviderFactoryBoundaryInterface;

/**
 * Registers a script that runs before any page script, like a userscript manager's
 * document-start. Same mechanism as androidx.webkit WebViewCompat.addDocumentStartJavaScript,
 * called directly to avoid the AndroidX dependency.
 */
final class DocumentStart {
    private DocumentStart() {}

    static boolean add(WebView webView, String script, String[] origins) {
        try {
            ClassLoader loader = WebView.getWebViewClassLoader();
            Object handler = Class.forName("org.chromium.support_lib_glue.SupportLibReflectionUtil", false, loader)
                    .getDeclaredMethod("createWebViewProviderFactory").invoke(null);
            WebViewProviderFactoryBoundaryInterface factory = proxy(WebViewProviderFactoryBoundaryInterface.class, (InvocationHandler) handler);
            boolean supported = false;
            for (String feature : factory.getSupportedFeatures()) {
                if (feature.startsWith("DOCUMENT_START_SCRIPT")) supported = true;
            }
            if (!supported) return false;
            WebViewProviderBoundaryInterface provider = proxy(WebViewProviderBoundaryInterface.class, factory.createWebView(webView));
            provider.addDocumentStartJavaScript(script, origins);
            return true;
        } catch (Throwable error) {
            android.util.Log.w("XCloudImageFilter", "Document-start script unavailable", error);
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return (T) Proxy.newProxyInstance(DocumentStart.class.getClassLoader(), new Class<?>[]{type}, handler);
    }
}
