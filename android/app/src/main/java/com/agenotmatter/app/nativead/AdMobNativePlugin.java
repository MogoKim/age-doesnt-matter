package com.agenotmatter.app.nativead;

import android.app.Activity;
import android.util.DisplayMetrics;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;

import com.agenotmatter.app.R;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.nativead.MediaView;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdView;

import java.util.HashMap;
import java.util.Map;

/**
 * AdMob Native Advanced (PoC) — 웹 placeholder 좌표에 네이티브 광고 뷰를 WebView 위 오버레이로 표시.
 *
 * JS API:
 *   load({ slotId, adUnitId })            → { loaded: boolean }
 *   setRect({ slotId, x, y, width, height })  (CSS px 기준, 밀도 변환은 네이티브에서)
 *   hide({ slotId })
 *   destroy({ slotId })
 *
 * 오버레이는 android.R.id.content(FrameLayout) 위에 절대좌표로 배치한다. WebView는 그 아래에 있고,
 * 웹은 동일 좌표에 빈 placeholder(높이 예약)를 두어 콘텐츠가 광고 자리를 비워 준다.
 */
@CapacitorPlugin(name = "AdMobNative")
public class AdMobNativePlugin extends Plugin {

    private static class Slot {
        NativeAd nativeAd;
        NativeAdView adView;
    }

    private final Map<String, Slot> slots = new HashMap<>();

    private FrameLayout overlayRoot() {
        Activity activity = getActivity();
        return activity.findViewById(android.R.id.content);
    }

    private float density() {
        DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
        return dm.density;
    }

    @PluginMethod
    public void load(final PluginCall call) {
        final String slotId = call.getString("slotId");
        final String adUnitId = call.getString("adUnitId");
        if (slotId == null || adUnitId == null) {
            call.reject("slotId와 adUnitId가 필요합니다");
            return;
        }
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            // 기존 슬롯 정리(중복 load 방지)
            destroySlot(slotId);

            AdLoader adLoader = new AdLoader.Builder(getContext(), adUnitId)
                .forNativeAd(nativeAd -> {
                    Slot slot = new Slot();
                    slot.nativeAd = nativeAd;
                    NativeAdView adView = (NativeAdView) LayoutInflater
                        .from(getContext())
                        .inflate(R.layout.native_ad_view, overlayRoot(), false);
                    bind(nativeAd, adView);
                    // 초기엔 화면 밖(숨김 상태)으로 배치 — setRect 호출 시 위치 잡힘
                    adView.setVisibility(View.INVISIBLE);
                    FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(0, 0);
                    overlayRoot().addView(adView, lp);
                    slot.adView = adView;
                    slots.put(slotId, slot);

                    JSObject ret = new JSObject();
                    ret.put("loaded", true);
                    call.resolve(ret);
                })
                .withAdListener(new AdListener() {
                    @Override
                    public void onAdFailedToLoad(LoadAdError error) {
                        JSObject ret = new JSObject();
                        ret.put("loaded", false);
                        ret.put("error", error.getMessage());
                        call.resolve(ret);
                    }
                })
                .build();

            adLoader.loadAd(new AdRequest.Builder().build());
        });
    }

    @PluginMethod
    public void setRect(final PluginCall call) {
        final String slotId = call.getString("slotId");
        final Double x = call.getDouble("x");
        final Double y = call.getDouble("y");
        final Double w = call.getDouble("width");
        final Double h = call.getDouble("height");
        if (slotId == null || x == null || y == null || w == null || h == null) {
            call.reject("slotId, x, y, width, height가 필요합니다");
            return;
        }
        final float d = density();
        getActivity().runOnUiThread(() -> {
            Slot slot = slots.get(slotId);
            if (slot == null || slot.adView == null) {
                call.resolve();
                return;
            }
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                Math.round(w.floatValue() * d),
                Math.round(h.floatValue() * d));
            lp.leftMargin = Math.round(x.floatValue() * d);
            lp.topMargin = Math.round(y.floatValue() * d);
            slot.adView.setLayoutParams(lp);
            slot.adView.setVisibility(View.VISIBLE);
            call.resolve();
        });
    }

    @PluginMethod
    public void hide(final PluginCall call) {
        final String slotId = call.getString("slotId");
        getActivity().runOnUiThread(() -> {
            Slot slot = slotId == null ? null : slots.get(slotId);
            if (slot != null && slot.adView != null) {
                slot.adView.setVisibility(View.INVISIBLE);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void destroy(final PluginCall call) {
        final String slotId = call.getString("slotId");
        getActivity().runOnUiThread(() -> {
            if (slotId != null) destroySlot(slotId);
            call.resolve();
        });
    }

    private void destroySlot(String slotId) {
        Slot slot = slots.remove(slotId);
        if (slot == null) return;
        if (slot.adView != null) {
            ViewGroup parent = (ViewGroup) slot.adView.getParent();
            if (parent != null) parent.removeView(slot.adView);
            slot.adView.destroy();
        }
        if (slot.nativeAd != null) {
            slot.nativeAd.destroy();
        }
    }

    private void bind(NativeAd nativeAd, NativeAdView adView) {
        TextView headline = adView.findViewById(R.id.ad_headline);
        TextView body = adView.findViewById(R.id.ad_body);
        Button cta = adView.findViewById(R.id.ad_call_to_action);
        ImageView icon = adView.findViewById(R.id.ad_app_icon);
        MediaView media = adView.findViewById(R.id.ad_media);

        adView.setHeadlineView(headline);
        adView.setBodyView(body);
        adView.setCallToActionView(cta);
        adView.setIconView(icon);
        adView.setMediaView(media);

        headline.setText(nativeAd.getHeadline());

        if (nativeAd.getBody() == null) {
            body.setVisibility(View.INVISIBLE);
        } else {
            body.setVisibility(View.VISIBLE);
            body.setText(nativeAd.getBody());
        }
        if (nativeAd.getCallToAction() == null) {
            cta.setVisibility(View.INVISIBLE);
        } else {
            cta.setVisibility(View.VISIBLE);
            cta.setText(nativeAd.getCallToAction());
        }
        if (nativeAd.getIcon() == null) {
            icon.setVisibility(View.GONE);
        } else {
            icon.setVisibility(View.VISIBLE);
            icon.setImageDrawable(nativeAd.getIcon().getDrawable());
        }

        adView.setNativeAd(nativeAd);
    }

    @Override
    protected void handleOnDestroy() {
        for (String key : new java.util.ArrayList<>(slots.keySet())) {
            destroySlot(key);
        }
        super.handleOnDestroy();
    }
}
