# Acro — Exam Focus, Native App Blocker & On-Device AI/RAG Engine

Acro is an autonomous, privacy-focused Android utility designed to help students maximize academic focus. It automatically blocks distracting social media apps based on real-time academic calendar sync from Gmail, and features a completely local, on-device AI generation and vector search (RAG) system.

---

## 🚀 Key Feature Breakdown

### 1. Exam-Aware Application Blocker & Accessibility Service
*   **Focus Block Window**: Computes a lock period starting **5 days before** any detected exam date and ending **4 hours after** the exam start time.
*   **Dynamic Social App Detection**: Leverages local/cloud AI models to identify and categorize distracting social applications installed on the device.
*   **WhatsApp & YouTube Whitelist Exclusions**: YouTube and WhatsApp are explicitly whitelisted from all block lists to maintain study/communication accessibility.
*   **Multi-Tiered Accessibility Status Check**: Queries the Android native `AccessibilityManager` and checks the secure system settings database to guarantee status checks are instant and ROM-independent, preventing looped permission prompts.
*   **Native Enforcement Overlay**: Uses a custom background accessibility service to intercept app-launch intents and overlay a secure block screen.

### 2. High-Performance Gmail Sync & Processed Ledger
*   **API Search Query Optimization (`q=after:TIMESTAMP`)**: Drastically cuts down list request calls by asking Google to return only emails received after the latest locally cached message's timestamp.
*   **Permanent Processed Ledger (`acro_gmail_processed_ids`)**: Logs processed email IDs in a permanent cache to prevent re-processing and eliminate redundant AI cloud billing costs.

### 3. Background Sync & Override Cycle
*   **3-Hour Polling Rate**: Background sync tasks are throttled to poll once every 3 hours, preserving mobile battery and Google Cloud quota.
*   **Sync Now Override**: Triggering a manual sync immediately fetches new messages and automatically resets/reschedules the 3-hour timer to run exactly 3 hours post-refresh.

### 4. Local Vector DB & RAG Service (Transformers.js)
*   **On-Device Embeddings**: Uses `@xenova/transformers` to run the ONNX `Xenova/all-MiniLM-L6-v2` feature-extraction model directly in the browser/Web View.
*   **Lightweight Vector Fallback**: Includes a local hash-based deterministic vectorizer to ensure instant vector search even while the ONNX binaries are initializing.
*   **Semantic Chunking & Cosine Similarity Search**: Vectorizes student resumes, academic notes, and notes content, performing semantic vector comparisons to supply local context (RAG) to the AI chat interface.

### 5. Native Local LLM Inference (MediaPipe / Gemma)
*   **Local AI execution**: Integrates a native MediaPipe LLM plugin for offline AI chat capability on the phone.
*   **Native Model Downloader**: Downloads local weights (such as Gemma/Llama) directly into the app's persistent storage.

---

## 📁 Repository Directory Structure

```text
Acro/
├── android/                             # Android Studio Native Project Wrapper
│   └── app/
│       └── src/main/java/com/proxims/app/
│           ├── MainActivity.java        # Entry activity booting up the Capacitor Web View
│           ├── AppLockPlugin.java       # Native bridge managing block lists, query packages, and accessibility checks
│           ├── OAuthPlugin.java         # Intercepts and parses OAuth redirect codes on native devices
│           ├── LlmInferencePlugin.java  # Native MediaPipe LLM inference interface for on-device models
│           ├── ModelDownloaderPlugin.java# Downloads offline model binaries to the phone's cache
│           ├── FocusBlockedActivity.java# Visual native overlay launched when access to a blocked app is denied
│           └── AppFocusAccessibilityService.java # Accessibility Service checking active window package names
├── src/                                 # Web Application Source (React + TypeScript)
│   ├── App.tsx                          # Primary file containing app dashboards, calendar feeds, and sync triggers
│   ├── App.css                          # Futuristic dark-theme dashboard UI styling
│   ├── main.tsx                         # React bootloader script
│   └── services/
│       ├── gmailService.ts              # Syncing and parsing utilities for Google APIs
│       └── ragService.ts                # Transformers.js ONNX local vector DB and semantic cosine similarity engine
├── public/                              # Shared public static web assets
│   ├── acro-fg.png                      # Foreground icon launcher for Android
│   └── acro-logo.png                    # Brand assets
├── capacitor.config.ts                  # Cross-platform runtime configuration file
├── package.json                         # Node dependencies & project scripts
└── .env                                 # Local secret configuration keys (git-ignored)
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:

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

### Development Deployment Steps
1.  **Install project dependencies**:
    ```bash
    npm install
    ```
2.  **Build the Web Application bundle**:
    ```bash
    npm run build
    ```
3.  **Sync Web Assets to Android project assets**:
    ```bash
    npx cap sync android
    ```
4.  **Assemble Android Debug package**:
    ```bash
    cd android && ./gradlew assembleDebug && cd ..
    ```
5.  **Deploy package to your testing device via ADB**:
    ```bash
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    ```
