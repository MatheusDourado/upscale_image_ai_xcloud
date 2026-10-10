package org.chromium.support_lib_boundary;

import java.lang.reflect.InvocationHandler;

// Subset of the boundary interface bundled by androidx.webkit (see factory interface).
public interface WebViewProviderBoundaryInterface {
    InvocationHandler addDocumentStartJavaScript(String script, String[] allowedOriginRules);
}
