package com.imagefilter.xcloud;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends Activity {
    private static final String START_URL = "https://www.xbox.com/play";
    private WebView webView;
    private String userscript;
    private boolean documentStart;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView.setWebContentsDebuggingEnabled(true);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        setContentView(webView);
        hideSystemBars();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setOffscreenPreRaster(true);
        // xCloud treats the WebView token ("; wv") as an unsupported browser: present as Chrome.
        settings.setUserAgentString(settings.getUserAgentString().replace("; wv", "").replace("Version/4.0 ", ""));
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        userscript = wrap(readAsset("userscript.js"));
        documentStart = DocumentStart.add(webView, userscript, new String[]{"https://www.xbox.com"});
        if (!documentStart) {
            Toast.makeText(this, "WebView sem document-start: injeção tardia (atualize o Android System WebView)", Toast.LENGTH_LONG).show();
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                // Fallback for old WebView builds; the wrapper ignores a second run.
                if (!documentStart && url != null && url.startsWith("https://www.xbox.com/")) {
                    view.evaluateJavascript(userscript, null);
                }
            }
        });

        webView.requestFocus();
        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    /** Applies the userscript @match/@exclude rules, top frame only, once per document. */
    private static String wrap(String script) {
        return "(function(){var p=location.pathname,s=location.search;"
                + "if(window.top!==window||window.__bxImageFilter)return;"
                + "if(!(/^\\/[^\\/]+\\/play/.test(p)||(/^\\/[^\\/]+\\/auth\\/msa/.test(p)&&/loggedIn/.test(s))))return;"
                + "if(/\\/xbox-game-pass\\/play-day-one/.test(p))return;"
                + "window.__bxImageFilter=true;"
                + "window.BX_FLAGS=Object.assign({DeviceInfo:{deviceType:'android'}},window.BX_FLAGS||{});"
                // xCloud picks the stream size from the reported OS: Android gets 720p. Unless the
                // user already chose a target resolution, start at Better xCloud's 1080p (HQ).
                + "try{var k='BetterXcloud',g=JSON.parse(localStorage.getItem(k)||'{}');"
                + "if(!('stream.video.resolution' in g)){g['stream.video.resolution']='1080p-hq';localStorage.setItem(k,JSON.stringify(g));}}catch(e){}\n"
                + script
                + "\n})();";
    }

    private String readAsset(String name) {
        try (InputStream input = getAssets().open(name)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[65536];
            int read;
            while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);
            return output.toString("UTF-8");
        } catch (Exception error) {
            throw new IllegalStateException("Missing asset " + name, error);
        }
    }

    private void hideSystemBars() {
        WindowInsetsController controller = Build.VERSION.SDK_INT >= 30 ? getWindow().getInsetsController() : null;
        if (controller != null) {
            controller.hide(WindowInsets.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // An unhandled gamepad B is turned into BACK by Android; it must not leave the game.
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK
                && (event.getSource() & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD) {
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
