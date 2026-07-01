import { registerPlugin } from '@capacitor/core'

/**
 * AdMob Native Advanced 커스텀 Capacitor 플러그인 브리지 (Android 전용).
 * 웹/미지원 플랫폼에서는 registerPlugin 프록시가 호출 시 reject → 호출부에서 catch로 no-op.
 */
export interface AdMobNativePlugin {
  /** 광고 로드. loaded=false면 no-fill(공간 제거) */
  load(options: { slotId: string; adUnitId: string }): Promise<{ loaded: boolean; error?: string }>
  /** placeholder 화면 좌표(CSS px)로 네이티브 뷰 위치/크기 갱신 + 표시 */
  setRect(options: { slotId: string; x: number; y: number; width: number; height: number }): Promise<void>
  /** 화면 밖 등에서 숨김(파괴 아님) */
  hide(options: { slotId: string }): Promise<void>
  /** 네이티브 광고/뷰 파괴(라우트 이탈·언마운트 시) */
  destroy(options: { slotId: string }): Promise<void>
}

export const AdMobNative = registerPlugin<AdMobNativePlugin>('AdMobNative')
