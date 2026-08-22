package com.proxims.app;

import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OAuth")
public class OAuthPlugin extends Plugin {

    private Dialog oauthDialog;

    @PluginMethod
    public void startOAuth(PluginCall call) {
        String authUrl = call.getString("authUrl");
        String redirectUri = call.getString("redirectUri");

        if (authUrl == null || redirectUri == null) {
            call.reject("authUrl and redirectUri are required");
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (oauthDialog != null && oauthDialog.isShowing()) {
                        oauthDialog.dismiss();
                    }

                    oauthDialog = new Dialog(getActivity(), android.R.style.Theme_Black_NoTitleBar_Fullscreen);
                    oauthDialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));

                    FrameLayout rootLayout = new FrameLayout(getActivity());
                    rootLayout.setLayoutParams(new ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                    ));

                    WebView webView = new WebView(getActivity());
                    webView.setLayoutParams(new ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                    ));

                    // Force a completely clean session every time by clearing cache, history, and cookies
                    webView.clearCache(true);
                    webView.clearHistory();
                    CookieManager cookieManager = CookieManager.getInstance();
                    cookieManager.removeAllCookies(null);
                    cookieManager.flush();

                    WebSettings settings = webView.getSettings();
                    settings.setJavaScriptEnabled(true);
                    settings.setDomStorageEnabled(true);
                    settings.setDatabaseEnabled(true);
                    settings.setSupportMultipleWindows(false);
                    // Google OAuth security requires a modern mobile browser user agent to avoid disallowed_useragent
                    settings.setUserAgentString("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36");

                    webView.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                            String url = request.getUrl().toString();
                            if (url.startsWith(redirectUri)) {
                                JSObject ret = new JSObject();
                                ret.put("url", url);
                                call.resolve(ret);
                                oauthDialog.dismiss();
                                return true;
                            }
                            return false;
                        }

                        @Override
                        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                            super.onPageStarted(view, url, favicon);
                            if (url.startsWith(redirectUri)) {
                                JSObject ret = new JSObject();
                                ret.put("url", url);
                                call.resolve(ret);
                                oauthDialog.dismiss();
                            }
                        }
                    });

                    rootLayout.addView(webView);
                    oauthDialog.setContentView(rootLayout);
                    oauthDialog.show();

                    webView.loadUrl(authUrl);

                } catch (Exception e) {
                    call.reject("Failed to open OAuth Dialog: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void openGmailApp(PluginCall call) {
        try {
            Intent intent = getContext().getPackageManager().getLaunchIntentForPackage("com.google.android.gm");
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } else {
                Intent emailIntent = new Intent(Intent.ACTION_MAIN);
                emailIntent.addCategory(Intent.CATEGORY_APP_EMAIL);
                emailIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(emailIntent);
                call.resolve();
            }
        } catch (Exception e) {
            call.reject("Could not open Gmail app: " + e.getMessage());
        }
    }
}
