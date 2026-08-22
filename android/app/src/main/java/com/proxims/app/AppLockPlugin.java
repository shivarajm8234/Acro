package com.proxims.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    private static final String PREF_NAME = "sakle_app_lock_prefs";

    @PluginMethod
    public void isAccessibilityEnabled(PluginCall call) {
        Context context = getContext();
        boolean isEnabled = false;
        
        // Method 1: Check via AccessibilityManager (highly reliable)
        try {
            android.view.accessibility.AccessibilityManager am = (android.view.accessibility.AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (am != null) {
                List<android.accessibilityservice.AccessibilityServiceInfo> runningServices = am.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
                if (runningServices != null) {
                    for (android.accessibilityservice.AccessibilityServiceInfo service : runningServices) {
                        if (service.getId() != null && service.getId().contains(context.getPackageName())) {
                            isEnabled = true;
                            break;
                        }
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Method 2: Fallback via Settings.Secure (string parsing check)
        if (!isEnabled) {
            try {
                String serviceName1 = context.getPackageName() + "/com.proxims.app.AppFocusAccessibilityService";
                String serviceName2 = context.getPackageName() + "/.AppFocusAccessibilityService";
                String enabledServices = Settings.Secure.getString(
                        context.getContentResolver(),
                        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                );
                if (enabledServices != null) {
                    isEnabled = enabledServices.contains(serviceName1) || enabledServices.contains(serviceName2);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        JSObject ret = new JSObject();
        ret.put("enabled", isEnabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        Context context = getContext();
        PackageManager pm = context.getPackageManager();
        Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);

        List<ResolveInfo> resolveInfos = pm.queryIntentActivities(mainIntent, 0);
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        Map<String, ?> allEntries = prefs.getAll();

        long currentTime = System.currentTimeMillis();
        JSArray appsArray = new JSArray();

        List<JSObject> appList = new ArrayList<>();

        for (ResolveInfo resolveInfo : resolveInfos) {
            String packageName = resolveInfo.activityInfo.packageName;
            if (packageName.equals(context.getPackageName())) continue;

            String appName = resolveInfo.loadLabel(pm).toString();
            long endTimeMs = 0L;
            if (allEntries.containsKey(packageName)) {
                Object val = allEntries.get(packageName);
                if (val instanceof Long) {
                    endTimeMs = (Long) val;
                } else if (val instanceof String) {
                    try {
                        endTimeMs = Long.parseLong((String) val);
                    } catch (Exception ignored) {}
                }
            }

            boolean isBlocked = currentTime < endTimeMs;

            JSObject appObj = new JSObject();
            appObj.put("packageName", packageName);
            appObj.put("appName", appName);
            appObj.put("endTimeMs", endTimeMs);
            appObj.put("isBlocked", isBlocked);
            
            // Icon to base64 string
            try {
                Drawable iconDrawable = resolveInfo.loadIcon(pm);
                Bitmap bitmap;
                if (iconDrawable instanceof BitmapDrawable) {
                    bitmap = ((BitmapDrawable) iconDrawable).getBitmap();
                } else {
                    bitmap = Bitmap.createBitmap(iconDrawable.getIntrinsicWidth(), iconDrawable.getIntrinsicHeight(), Bitmap.Config.ARGB_8888);
                    Canvas canvas = new Canvas(bitmap);
                    iconDrawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
                    iconDrawable.draw(canvas);
                }
                ByteArrayOutputStream stream = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream);
                byte[] byteArray = stream.toByteArray();
                String iconBase64 = "data:image/png;base64," + Base64.encodeToString(byteArray, Base64.NO_WRAP);
                appObj.put("icon", iconBase64);
            } catch (Exception e) {
                appObj.put("icon", "");
            }

            appList.add(appObj);
        }

        Collections.sort(appList, new Comparator<JSObject>() {
            @Override
            public int compare(JSObject o1, JSObject o2) {
                return o1.getString("appName", "").compareToIgnoreCase(o2.getString("appName", ""));
            }
        });

        for (JSObject app : appList) {
            appsArray.put(app);
        }

        JSObject ret = new JSObject();
        ret.put("apps", appsArray);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAppLock(PluginCall call) {
        String packageName = call.getString("packageName");
        Double duration = call.getDouble("duration", 0.0);
        String unit = call.getString("unit", "MINUTES");

        if (packageName == null || packageName.isEmpty()) {
            call.reject("packageName is required");
            return;
        }

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);

        long currentTime = System.currentTimeMillis();
        long endTimeMs;

        if ("INFINITE".equalsIgnoreCase(unit)) {
            endTimeMs = Long.MAX_VALUE;
        } else {
            long durationMs;
            if ("DAYS".equalsIgnoreCase(unit)) {
                durationMs = (long) (duration * 24 * 60 * 60 * 1000.0);
            } else if ("HOURS".equalsIgnoreCase(unit)) {
                durationMs = (long) (duration * 60 * 60 * 1000.0);
            } else {
                durationMs = (long) (duration * 60 * 1000.0);
            }
            endTimeMs = currentTime + durationMs;
        }

        prefs.edit().putLong(packageName, endTimeMs).apply();

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("endTimeMs", endTimeMs);
        call.resolve(ret);
    }
}
