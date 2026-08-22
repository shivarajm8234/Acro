package com.proxims.app;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.view.accessibility.AccessibilityEvent;

import java.util.Map;

public class AppFocusAccessibilityService extends AccessibilityService {

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;

        CharSequence pkgCharSequence = event.getPackageName();
        if (pkgCharSequence == null) return;
        String packageName = pkgCharSequence.toString();

        if (packageName.equals(getApplicationContext().getPackageName())) return;

        SharedPreferences prefs = getSharedPreferences("sakle_app_lock_prefs", Context.MODE_PRIVATE);
        Map<String, ?> allEntries = prefs.getAll();

        if (!allEntries.containsKey(packageName)) return;

        long endTimeMs = 0L;
        Object val = allEntries.get(packageName);
        if (val instanceof Long) {
            endTimeMs = (Long) val;
        } else if (val instanceof String) {
            try {
                endTimeMs = Long.parseLong((String) val);
            } catch (Exception ignored) {}
        }

        long currentTime = System.currentTimeMillis();

        if (currentTime < endTimeMs) {
            String appLabel = packageName;
            try {
                PackageManager pm = getPackageManager();
                appLabel = pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString();
            } catch (Exception ignored) {}

            Intent intent = new Intent(this, FocusBlockedActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.putExtra("BLOCKED_APP_NAME", appLabel);
            intent.putExtra("FOCUS_END_TIME", endTimeMs);
            startActivity(intent);
        } else {
            prefs.edit().remove(packageName).apply();
        }
    }

    @Override
    public void onInterrupt() {}
}
