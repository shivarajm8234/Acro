package com.proxims.app;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.util.Locale;

public class FocusBlockedActivity extends AppCompatActivity {

    private String blockedAppName = "App";
    private long focusEndTimeMs = 0L;
    private TextView timerTextView;
    private TextView descriptionTextView;
    private Handler handler = new Handler(Looper.getMainLooper());
    private Runnable timerRunnable;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        updateFromIntent(getIntent());
        setupUI();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        updateFromIntent(intent);
        if (descriptionTextView != null) {
            descriptionTextView.setText(blockedAppName + " is currently blocked for your focus period.");
        }
    }

    private void updateFromIntent(Intent intent) {
        if (intent != null) {
            blockedAppName = intent.getStringExtra("BLOCKED_APP_NAME");
            if (blockedAppName == null) blockedAppName = "App";
            focusEndTimeMs = intent.getLongExtra("FOCUS_END_TIME", 0L);
        }
    }

    private void setupUI() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(64, 64, 64, 64);
        layout.setBackgroundColor(0xFFFFFFFF); // Sleek modern light white background

        // Title
        TextView title = new TextView(this);
        title.setText("App Blocked");
        title.setTextSize(26);
        title.setTextColor(0xFF0F172A); // Dark slate text
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 0, 0, 16);
        layout.addView(title);

        // Description
        descriptionTextView = new TextView(this);
        descriptionTextView.setText(blockedAppName + " is currently blocked for your focus period.");
        descriptionTextView.setTextSize(15);
        descriptionTextView.setTextColor(0xFF64748B); // Slate secondary
        descriptionTextView.setGravity(Gravity.CENTER);
        descriptionTextView.setPadding(0, 0, 0, 48);
        layout.addView(descriptionTextView);

        // Timer Card Container
        LinearLayout timerCard = new LinearLayout(this);
        timerCard.setOrientation(LinearLayout.VERTICAL);
        timerCard.setGravity(Gravity.CENTER);
        timerCard.setPadding(40, 36, 40, 36);
        timerCard.setBackgroundColor(0xFFF8FAFC); // Soft light grey card background

        TextView timerLabel = new TextView(this);
        timerLabel.setText("FOCUS TIMER REMAINING");
        timerLabel.setTextSize(11);
        timerLabel.setTextColor(0xFF4F46E5); // Indigo accent
        timerLabel.setTypeface(null, android.graphics.Typeface.BOLD);
        timerCard.addView(timerLabel);

        timerTextView = new TextView(this);
        timerTextView.setText("00:00:00");
        timerTextView.setTextSize(34);
        timerTextView.setTextColor(0xFF0F172A); // Clean primary text
        timerTextView.setTypeface(null, android.graphics.Typeface.BOLD);
        timerTextView.setPadding(0, 12, 0, 0);
        timerCard.addView(timerTextView);

        layout.addView(timerCard);

        // Spacer
        View spacer = new View(this);
        LinearLayout.LayoutParams spacerParams = new LinearLayout.LayoutParams(1, 64);
        layout.addView(spacer, spacerParams);

        // Home Button
        Button homeButton = new Button(this);
        homeButton.setText("Return to Home");
        homeButton.setTextColor(0xFFFFFFFF);
        homeButton.setBackgroundColor(0xFF4F46E5); // Indigo button
        homeButton.setPadding(32, 16, 32, 16);
        homeButton.setOnClickListener(v -> goToHomeAndFinish());
        layout.addView(homeButton);

        setContentView(layout);

        startTimerUpdate();
    }

    private void startTimerUpdate() {
        timerRunnable = new Runnable() {
            @Override
            public void run() {
                long currentTime = System.currentTimeMillis();
                if (focusEndTimeMs == Long.MAX_VALUE || (focusEndTimeMs > currentTime && focusEndTimeMs - currentTime > 365L * 24 * 60 * 60 * 1000L)) {
                    timerTextView.setText("Infinite");
                } else {
                    long remainingMs = focusEndTimeMs - currentTime;
                    if (remainingMs <= 0) {
                        goToHomeAndFinish();
                        return;
                    }
                    long days = remainingMs / (1000 * 60 * 60 * 24);
                    long hours = (remainingMs / (1000 * 60 * 60)) % 24;
                    long minutes = (remainingMs / (1000 * 60)) % 60;
                    long seconds = (remainingMs / 1000) % 60;

                    if (days > 0) {
                        timerTextView.setText(String.format(Locale.US, "%dd %02d:%02d:%02d", days, hours, minutes, seconds));
                    } else {
                        timerTextView.setText(String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds));
                    }
                }
                handler.postDelayed(this, 1000);
            }
        };
        handler.post(timerRunnable);
    }

    @Override
    public void onBackPressed() {
        super.onBackPressed();
        goToHomeAndFinish();
    }

    private void goToHomeAndFinish() {
        if (timerRunnable != null) {
            handler.removeCallbacks(timerRunnable);
        }
        Intent homeIntent = new Intent(Intent.ACTION_MAIN);
        homeIntent.addCategory(Intent.CATEGORY_HOME);
        homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(homeIntent);
        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (timerRunnable != null) {
            handler.removeCallbacks(timerRunnable);
        }
    }
}
