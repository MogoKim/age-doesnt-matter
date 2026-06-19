package com.agenotmatter.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onResume() {
        super.onResume();
        // TWA/웹과 동일한 글씨 크기 보정 — Android 시스템 글꼴 배율(접근성)을 무시하고 textZoom 100 고정.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
