package com.agenotmatter.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.agenotmatter.app.nativead.AdMobNativePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱-로컬 커스텀 플러그인 등록(반드시 super.onCreate 이전) — AdMob Native Advanced 인라인 광고.
        registerPlugin(AdMobNativePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // TWA/웹과 동일한 글씨 크기 보정 — Android 시스템 글꼴 배율(접근성)을 무시하고 textZoom 100 고정.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
