# Acro — Exam Focus & Gmail Alert Automation

Acro is an autonomous Android utility designed to help students maximize focus during exam periods by automatically blocking distracting applications based on real-time academic calendar sync from Gmail.

## 🚀 Key Features

### 1. Exam-Aware Application Blocker
*   **Enforcement Window**: Calculates a protection lock window starting **5 days before** any detected exam date and ending **4 hours after** the exam start time.
*   **Intelligent Social Categorization**: Runs local and cloud AI models to dynamically identify installed social media apps and packages.
*   **WhatsApp & YouTube Exclusions**: Standard communication and study tools (**YouTube** and **WhatsApp**) are strictly whitelisted and never blocked.
*   **Native Enforcement**: Relies on a native Android Accessibility Service to intercept and block distracting app launches.

### 2. High-Performance Gmail Sync & Ledger
*   **Search Query Optimization (`q=after:TIMESTAMP`)**: Instead of fetching standard mailbox lists, the sync engine queries Gmail using date-filters targeting only new emails arriving after the latest locally stored message.
*   **Permanent Processed Ledger (`acro_gmail_processed_ids`)**: Tracks every email ID that has been screened by the AI, guaranteeing zero redundant API calls and preventing duplicate cloud-billing charges even when logging out or clearing local app cache.

### 3. Background Sync & Override Cycle
*   **3-Hour Polling Rate**: Background sync checks are throttled to run every 3 hours, preserving mobile battery and keeping Google API console metrics at a minimum.
*   **Manual Override**: Clicking the **Sync Now** button performs an immediate sync and automatically resets the 3-hour timer, aligning subsequent checks to run 3 hours post-manual-refresh.

### 4. Robust Accessibility Service Checking
*   **Multi-Tiered Verification**: Checks native `AccessibilityManager` system services and queries the system secure settings database to reliably check permission state across all Android ROMs, eliminating repeating prompt loops.

---

## 📁 Project Directory Structure

```text
Acro/
├── android/                             # Native Android Studio Project
│   └── app/
│       └── src/main/java/com/proxims/app/
│           ├── MainActivity.java        # Main activity launching the Capacitor Web View
│           ├── AppLockPlugin.java       # Capacitor Native Plugin for locks, package info, and accessibility status
│           ├── OAuthPlugin.java         # Capacitor Native Plugin to parse Google OAuth redirects on device
│           └── AppFocusAccessibilityService.java # Android Accessibility Service enforcing app-locking overlays
├── src/                                 # Frontend Web Source Code (React + TypeScript)
│   ├── App.tsx                          # Primary component containing main UI dashboards, timers, and sync handlers
│   ├── App.css                          # Futuristic dashboard styling & custom visual components
│   ├── main.tsx                         # React application entry point
│   └── services/
│       └── gmailService.ts              # Helper utilities for formatting and syncing mailboxes
├── public/                              # Public assets
│   ├── acro-fg.png                      # Crisp foreground emblem for Android launcher
│   └── acro-logo.png                    # Brand typography assets
├── capacitor.config.ts                  # Cross-platform runtime configuration file
├── package.json                         # Node dependencies & project scripts
└── .env                                 # Environment keys configuration (not committed)
```

---

## 🛠️ Environment Configuration

Create a `.env` file in the project root:

```env
VITE_GUEST_GROQ_API_KEY=your_groq_api_key
VITE_HF_TOKEN=your_hugging_face_token
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_CLIENT_SECRET=your_google_client_secret
```

---

## 📦 Build & Deploy Instructions

### Prerequisites
*   Android SDK & ADB configured
*   Java JDK 21+
*   Node.js 18+

### Steps
1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Build the Web Application**:
    ```bash
    npm run build
    ```
3.  **Sync Web Assets to Capacitor**:
    ```bash
    npx cap sync android
    ```
4.  **Assemble Debug APK**:
    ```bash
    cd android && ./gradlew assembleDebug && cd ..
    ```
5.  **Deploy to Device**:
    ```bash
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    ```
