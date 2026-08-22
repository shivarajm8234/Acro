package com.proxims.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.mediapipe.tasks.genai.llminference.LlmInference;

import android.os.Environment;
import java.io.File;

/**
 * On-Device LLM Inference Capacitor Plugin using Google MediaPipe.
 *
 * Loads quantized Gemma model weights (.bin) from device storage and executes
 * autoregressive token generation 100% locally on CPU/GPU hardware delegates.
 * Zero network or cloud API dependencies.
 */
@CapacitorPlugin(name = "LlmInference")
public class LlmInferencePlugin extends Plugin {
    private static final String TAG = "LlmInferencePlugin";

    private LlmInference llmInference = null;
    private String loadedModelId = null;
    private boolean isLoading = false;

    /**
     * Load a model from the device file system into RAM.
     * Expects: { modelId: string, fileName: string, useGpu: boolean }
     */
    @PluginMethod()
    public void loadModel(PluginCall call) {
        if (isLoading) {
            call.reject("A model is already being loaded. Please wait.");
            return;
        }

        String modelId = call.getString("modelId");
        String fileName = call.getString("fileName");
        boolean useGpu = call.getBoolean("useGpu", false);

        if (modelId == null || fileName == null) {
            call.reject("modelId and fileName are required.");
            return;
        }

        // If same model is already loaded, return immediately
        if (loadedModelId != null && loadedModelId.equals(modelId) && llmInference != null) {
            JSObject result = new JSObject();
            result.put("loaded", true);
            result.put("modelId", modelId);
            result.put("message", "Model already loaded in RAM.");
            call.resolve(result);
            return;
        }

        isLoading = true;

        new Thread(() -> {
            synchronized (LlmInferencePlugin.this) {
                try {
                    // Unload previous model
                    if (llmInference != null) {
                        try { llmInference.close(); } catch (Exception ignored) {}
                        llmInference = null;
                        loadedModelId = null;
                    }

                    File resolvedModelFile = null;

                    // 1. Try internal "Acro" directory
                    File acroInternalDir = new File(getContext().getFilesDir(), "Acro");
                    File candidate1 = new File(acroInternalDir, fileName);
                    if (candidate1.exists() && candidate1.length() > 0) {
                        resolvedModelFile = candidate1;
                    }

                    // 2. Try internal "models" directory
                    if (resolvedModelFile == null) {
                        File modelsInternalDir = new File(getContext().getFilesDir(), "models");
                        File candidate2 = new File(modelsInternalDir, fileName);
                        if (candidate2.exists() && candidate2.length() > 0) {
                            resolvedModelFile = candidate2;
                        }
                    }

                    // 3. Try public "Acro" directory
                    if (resolvedModelFile == null) {
                        File acroPublicDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Acro");
                        File candidate3 = new File(acroPublicDir, fileName);
                        if (candidate3.exists() && candidate3.length() > 0) {
                            resolvedModelFile = candidate3;
                        }
                    }

                    if (resolvedModelFile == null) {
                        isLoading = false;
                        call.reject("Model file not found in internal storage (Acro/models) or public downloads folder.");
                        return;
                    }

                    File modelFile = resolvedModelFile;

                    Log.d(TAG, "Loading model weights: " + modelFile.getAbsolutePath() +
                            " (" + (modelFile.length() / 1024 / 1024) + " MB)");

                    LlmInference engine = null;

                    // Stage 1: Try requested backend
                    LlmInference.Backend primaryBackend = useGpu ?
                            LlmInference.Backend.GPU : LlmInference.Backend.CPU;

                    try {
                        LlmInference.LlmInferenceOptions options =
                                LlmInference.LlmInferenceOptions.builder()
                                        .setModelPath(modelFile.getAbsolutePath())
                                        .setMaxTokens(1024)
                                        .setMaxTopK(40)
                                        .setPreferredBackend(primaryBackend)
                                        .build();

                        engine = LlmInference.createFromOptions(getContext(), options);
                        Log.d(TAG, "✅ Model loaded with " + primaryBackend + " backend");
                    } catch (Exception primaryErr) {
                        Log.w(TAG, "⚠️ " + primaryBackend + " backend failed: " + primaryErr.getMessage());

                        // Stage 2: Fallback to CPU
                        if (useGpu) {
                            try {
                                LlmInference.LlmInferenceOptions cpuOptions =
                                        LlmInference.LlmInferenceOptions.builder()
                                                .setModelPath(modelFile.getAbsolutePath())
                                                .setMaxTokens(1024)
                                                .setMaxTopK(40)
                                                .setPreferredBackend(LlmInference.Backend.CPU)
                                                .build();

                                engine = LlmInference.createFromOptions(getContext(), cpuOptions);
                                Log.d(TAG, "✅ Model loaded with CPU fallback backend");
                            } catch (Exception cpuErr) {
                                isLoading = false;
                                call.reject("Failed to load model on both GPU and CPU: " + cpuErr.getMessage());
                                return;
                            }
                        } else {
                            isLoading = false;
                            call.reject("Failed to load model on CPU: " + primaryErr.getMessage());
                            return;
                        }
                    }

                    llmInference = engine;
                    loadedModelId = modelId;
                    isLoading = false;

                    JSObject result = new JSObject();
                    result.put("loaded", true);
                    result.put("modelId", modelId);
                    result.put("backend", engine != null ? "ready" : "failed");
                    result.put("message", "Model loaded successfully into device RAM.");
                    call.resolve(result);

                } catch (Exception e) {
                    Log.e(TAG, "Model load error: " + e.getMessage(), e);
                    isLoading = false;
                    call.reject("Model load error: " + e.getMessage());
                }
            }
        }).start();
    }

    /**
     * Run inference on the loaded model.
     * Expects: { prompt: string }
     * Returns: { response: string, tokenCount: int, timeMs: long }
     */
    @PluginMethod()
    public void generateResponse(PluginCall call) {
        String prompt = call.getString("prompt");

        if (prompt == null || prompt.trim().isEmpty()) {
            call.reject("prompt is required.");
            return;
        }

        if (llmInference == null || loadedModelId == null) {
            call.reject("No model is loaded. Call loadModel() first.");
            return;
        }

        new Thread(() -> {
            synchronized (LlmInferencePlugin.this) {
                try {
                    long startTime = System.currentTimeMillis();

                    // Format prompt using Gemma instruct template only if not pre-formatted
                    String formattedPrompt = prompt.trim();
                    if (!formattedPrompt.contains("<start_of_turn>")) {
                        formattedPrompt = "<start_of_turn>user\n" + formattedPrompt + "\n<end_of_turn>\n<start_of_turn>model\n";
                    }

                    Log.d(TAG, "Running on-device inference for prompt length: " + formattedPrompt.length());

                    String response = null;
                    try {
                        response = llmInference.generateResponse(formattedPrompt);
                    } catch (Throwable t) {
                        Log.e(TAG, "MediaPipe C++ native inference exception: " + t.getMessage(), t);
                        call.reject("Native C++ inference error: " + t.getMessage());
                        return;
                    }

                    long elapsed = System.currentTimeMillis() - startTime;
                    int estimatedTokens = (response != null && !response.isEmpty()) ? (int) (response.split("\\s+").length * 1.3) : 0;

                    Log.d(TAG, "✅ Inference complete in " + elapsed + "ms (" + estimatedTokens + " tokens)");

                    JSObject result = new JSObject();
                    result.put("response", response != null ? response.trim() : "");
                    result.put("tokenCount", estimatedTokens);
                    result.put("timeMs", elapsed);
                    result.put("modelId", loadedModelId);
                    call.resolve(result);

                } catch (Exception e) {
                    Log.e(TAG, "Inference error: " + e.getMessage(), e);
                    call.reject("Inference failed: " + e.getMessage());
                }
            }
        }).start();
    }

    /**
     * Unload model from RAM.
     */
    @PluginMethod()
    public void unloadModel(PluginCall call) {
        synchronized (LlmInferencePlugin.this) {
            try {
                if (llmInference != null) {
                    llmInference.close();
                }
            } catch (Exception e) {
                Log.w(TAG, "Error during unload: " + e.getMessage());
            }
            llmInference = null;
            loadedModelId = null;

            JSObject result = new JSObject();
            result.put("unloaded", true);
            call.resolve(result);
        }
    }

    /**
     * Get current model status.
     */
    @PluginMethod()
    public void getStatus(PluginCall call) {
        synchronized (LlmInferencePlugin.this) {
            JSObject result = new JSObject();
            result.put("isLoaded", llmInference != null && loadedModelId != null);
            result.put("loadedModelId", loadedModelId != null ? loadedModelId : "");
            result.put("isLoading", isLoading);
            call.resolve(result);
        }
    }
}
