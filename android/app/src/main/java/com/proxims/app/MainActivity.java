package com.proxims.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ModelDownloaderPlugin.class);
        registerPlugin(LlmInferencePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
