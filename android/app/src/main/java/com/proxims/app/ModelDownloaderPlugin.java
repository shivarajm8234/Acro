package com.proxims.app;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "ModelDownloader")
public class ModelDownloaderPlugin extends Plugin {
    private static final String TAG = "ModelDownloaderPlugin";
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final Map<String, Future<?>> activeDownloads = new ConcurrentHashMap<>();
    private final Map<String, Boolean> cancelledDownloads = new ConcurrentHashMap<>();

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .build();

    @PluginMethod
    public void startDownload(PluginCall call) {
        final String modelId = call.getString("modelId");
        final String downloadUrl = call.getString("url");
        final String hfToken = call.getString("hfToken", "");
        final String fileName = call.getString("fileName");
        final long expectedSize = call.getLong("sizeBytes", 0L);

        if (modelId == null || downloadUrl == null || fileName == null) {
            call.reject("Missing required parameters: modelId, url, or fileName");
            return;
        }

        // Cancel any existing download for this model first
        cancelDownloadInternal(modelId);
        cancelledDownloads.put(modelId, false);

        Future<?> future = executor.submit(new Runnable() {
            @Override
            public void run() {
                File modelsDir = new File(getContext().getFilesDir(), "models");
                if (!modelsDir.exists()) {
                    modelsDir.mkdirs();
                }

                File modelFile = new File(modelsDir, fileName);
                File tempFile = new File(modelsDir, fileName + ".tmp");

                try {
                    long existingBytes = 0;
                    if (tempFile.exists()) {
                        existingBytes = tempFile.length();
                    }

                    // Check if file is already complete before requesting
                    if (expectedSize > 0 && existingBytes >= expectedSize) {
                        sendProgress(modelId, "verifying", existingBytes, expectedSize);
                        if (modelFile.exists()) {
                            modelFile.delete();
                        }
                        if (!tempFile.renameTo(modelFile)) {
                            throw new Exception("Failed to rename temporary file to destination");
                        }
                        sendProgress(modelId, "installed", expectedSize, expectedSize);
                        return;
                    }

                    String currentUrl = downloadUrl;
                    int redirectCount = 0;
                    int maxRedirects = 5;
                    Response response = null;

                    while (redirectCount < maxRedirects) {
                        if (cancelledDownloads.getOrDefault(modelId, false)) {
                            sendProgress(modelId, "cancelled", 0, 0);
                            return;
                        }

                        Request.Builder requestBuilder = new Request.Builder().url(currentUrl);
                        if (existingBytes > 0) {
                            requestBuilder.addHeader("Range", "bytes=" + existingBytes + "-");
                        }

                        if (hfToken != null && !hfToken.isEmpty() && currentUrl.contains("huggingface.co") && !currentUrl.contains("cdn-lfs")) {
                            requestBuilder.addHeader("Authorization", "Bearer " + hfToken);
                        }

                        Request request = requestBuilder.build();
                        Response res = httpClient.newCall(request).execute();

                        int code = res.code();
                        if (code == 301 || code == 302 || code == 307 || code == 308) {
                            String location = res.header("Location");
                            res.close();
                            if (location == null || location.isEmpty()) {
                                throw new Exception("HTTP redirect missing Location header");
                            }
                            currentUrl = location;
                            redirectCount++;
                        } else {
                            response = res;
                            break;
                        }
                    }

                    if (response == null) {
                        throw new Exception("Too many HTTP redirects");
                    }

                    if (!response.isSuccessful() && response.code() != 206) {
                        int code = response.code();
                        response.close();
                        throw new Exception("HTTP server returned error: " + code);
                    }

                    ResponseBody body = response.body();
                    if (body == null) {
                        response.close();
                        throw new Exception("Empty response body");
                    }

                    long contentLength = body.contentLength();
                    long totalBytes = (existingBytes > 0 && response.code() == 206) ? (existingBytes + contentLength) : contentLength;

                    InputStream is = body.byteStream();
                    FileOutputStream fos = new FileOutputStream(tempFile, existingBytes > 0 && response.code() == 206);

                    byte[] buffer = new byte[64 * 1024]; // 64KB buffer
                    int bytesRead;
                    long downloadedBytes = existingBytes;
                    long lastUpdate = System.currentTimeMillis();

                    sendProgress(modelId, "downloading", downloadedBytes, totalBytes);

                    while ((bytesRead = is.read(buffer)) != -1) {
                        if (cancelledDownloads.getOrDefault(modelId, false)) {
                            fos.close();
                            is.close();
                            response.close();
                            sendProgress(modelId, "cancelled", 0, 0);
                            return;
                        }

                        fos.write(buffer, 0, bytesRead);
                        downloadedBytes += bytesRead;

                        long now = System.currentTimeMillis();
                        if (now - lastUpdate > 300) { // Update every 300ms
                            sendProgress(modelId, "downloading", downloadedBytes, totalBytes);
                            lastUpdate = now;
                        }
                    }

                    fos.close();
                    is.close();
                    response.close();

                    // Verification state
                    sendProgress(modelId, "verifying", downloadedBytes, totalBytes);

                    if (modelFile.exists()) {
                        modelFile.delete();
                    }
                    if (!tempFile.renameTo(modelFile)) {
                        throw new Exception("Failed to rename temporary file to destination");
                    }

                    sendProgress(modelId, "installed", totalBytes, totalBytes);

                } catch (Exception e) {
                    Log.e(TAG, "Download error for model " + modelId, e);
                    sendError(modelId, e.getMessage());
                } finally {
                    activeDownloads.remove(modelId);
                }
            }
        });

        activeDownloads.put(modelId, future);
        call.resolve();
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String modelId = call.getString("modelId");
        if (modelId != null) {
            cancelDownloadInternal(modelId);
        }
        call.resolve();
    }

    private void cancelDownloadInternal(String modelId) {
        cancelledDownloads.put(modelId, true);
        Future<?> future = activeDownloads.remove(modelId);
        if (future != null) {
            future.cancel(true);
        }
    }

    @PluginMethod
    public void getModelStatus(PluginCall call) {
        String modelId = call.getString("modelId");
        String fileName = call.getString("fileName");

        if (modelId == null || fileName == null) {
            call.reject("Missing required parameters: modelId or fileName");
            return;
        }

        File modelsDir = new File(getContext().getFilesDir(), "models");
        File modelFile = new File(modelsDir, fileName);
        File tempFile = new File(modelsDir, fileName + ".tmp");

        JSObject result = new JSObject();
        if (modelFile.exists() && modelFile.length() > 0) {
            result.put("status", "installed");
            result.put("size", modelFile.length());
        } else if (tempFile.exists()) {
            result.put("status", "downloading");
            result.put("size", tempFile.length());
        } else {
            result.put("status", "idle");
            result.put("size", 0);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        String modelId = call.getString("modelId");
        String fileName = call.getString("fileName");

        if (modelId == null || fileName == null) {
            call.reject("Missing required parameters");
            return;
        }

        cancelDownloadInternal(modelId);

        File modelsDir = new File(getContext().getFilesDir(), "models");
        File modelFile = new File(modelsDir, fileName);
        File tempFile = new File(modelsDir, fileName + ".tmp");

        boolean deleted = false;
        if (modelFile.exists()) {
            deleted = modelFile.delete();
        }
        if (tempFile.exists()) {
            deleted = tempFile.delete() || deleted;
        }

        JSObject result = new JSObject();
        result.put("deleted", deleted);
        call.resolve(result);
    }

    private void sendProgress(String modelId, String status, long downloaded, long total) {
        JSObject data = new JSObject();
        data.put("modelId", modelId);
        data.put("status", status);
        data.put("downloadedBytes", downloaded);
        data.put("totalBytes", total);
        double progress = total > 0 ? ((double) downloaded / total) * 100 : 0;
        data.put("progress", (int) progress);
        notifyListeners("downloadProgress", data);
    }

    private void sendError(String modelId, String error) {
        JSObject data = new JSObject();
        data.put("modelId", modelId);
        data.put("status", "error");
        data.put("error", error);
        notifyListeners("downloadProgress", data);
    }
}
