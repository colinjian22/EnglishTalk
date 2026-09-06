/* =========================================================================
 * mic-permission.js — 运行时麦克风权限申请（Cordova APK 专用）
 *
 * 为什么需要它：
 *   Android 6+（本项目 targetSdk 34）把 RECORD_AUDIO 列为「危险权限」，
 *   仅写在 AndroidManifest 里不够，必须在运行时弹窗向用户申请。
 *   在 Cordova WebView 中，Web Speech API 的语音识别不会自动触发原生
 *   权限弹窗（部分 ROM 会，但不可靠），所以需要显式用原生插件申请。
 *
 * 行为：
 *   - 普通浏览器 / file:// 单文件版：浏览器自己管权限，直接放行（resolve true）。
 *   - Cordova Android：用 cordova-plugin-android-permissions 动态申请 RECORD_AUDIO。
 *   - Cordova iOS：用同一插件的 MICROPHONE 常量，配合 Info.plist 的
 *     NSMicrophoneUsageDescription 描述触发系统授权。
 * ========================================================================= */
(function (global) {
  'use strict';

  function hasCordovaPerm() {
    return !!(global.cordova && global.cordova.plugins && global.cordova.plugins.permissions);
  }

  function platformIsIOS() {
    try {
      if (global.cordova && global.cordova.platformId === 'ios') return true;
      if (global.device && /iPhone|iPad|iPod/i.test(global.device.platform || '')) return true;
    } catch (e) {}
    return false;
  }

  /* 申请麦克风权限，返回 Promise<boolean>（true = 已授权）。
   * 非 Cordova 环境直接 resolve(true)，不影响任何功能。 */
  function ensure() {
    return new Promise((resolve) => {
      if (!hasCordovaPerm()) { resolve(true); return; }

      const perms = global.cordova.plugins.permissions;
      let perm;
      try {
        perm = platformIsIOS() ? perms.MICROPHONE : perms.RECORD_AUDIO;
      } catch (e) { perm = perms.RECORD_AUDIO; }
      if (!perm) { resolve(true); return; }

      // 先查是否已授权
      perms.checkPermission(perm, (status) => {
        if (status && status.hasPermission) { resolve(true); return; }
        // 未授权 → 弹窗申请
        perms.requestPermission(perm,
          (s2) => resolve(!!(s2 && s2.hasPermission)),
          (err) => {
            // 部分 ROM 申请被拒或走系统设置，视为未授权，交给上层引导
            console.warn('[MicPermission] 申请失败/被拒：', err);
            resolve(false);
          }
        );
      }, (err) => {
        console.warn('[MicPermission] 检查失败：', err);
        resolve(false);
      });
    });
  }

  /* 跳转到系统设置页（插件支持时），否则用 alert 引导手动开启。 */
  function openSettings() {
    try {
      if (hasCordovaPerm()) {
        const perms = global.cordova.plugins.permissions;
        if (typeof perms.switchToSettings === 'function') {
          perms.switchToSettings(() => {}, () => {});
          return;
        }
      }
    } catch (e) {}
    if (global.alert) {
      global.alert('请在系统「设置 → 应用 → 英语口语情景对话 → 权限」中开启麦克风（录音）权限，即可使用语音输入。');
    }
  }

  const MicPermission = { ensure, openSettings, hasCordovaPerm, platformIsIOS };
  global.MicPermission = MicPermission;
  if (typeof module !== 'undefined' && module.exports) module.exports = { MicPermission };
})(typeof window !== 'undefined' ? window : globalThis);
