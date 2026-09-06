/* =========================================================================
 * speech.js — 语音封装（Web Speech API）
 * 朗读(TTS) / 识别(STT)，带能力检测与降级提示。
 * 在 Android Chrome / 微信内置浏览器 / 桌面 Chrome 上体验最佳。
 * ========================================================================= */

(function (global) {
  'use strict';

  const TTS = global.speechSynthesis || null;
  const SR = global.SpeechRecognition || global.webkitSpeechRecognition || null;

  const Speech = {
    ttsAvailable: !!TTS,
    sttAvailable: !!SR,

    /* 朗读英文（或指定语言） */
    speak(text, opts) {
      opts = opts || {};
      if (!TTS) { console.warn('TTS 不可用'); return false; }
      try {
        TTS.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = opts.lang || 'en-US';
        u.rate = opts.rate || 0.95;
        u.pitch = opts.pitch || 1;
        TTS.speak(u);
        return true;
      } catch (e) { console.warn('speak error', e); return false; }
    },

    cancel() { if (TTS) try { TTS.cancel(); } catch (e) {} },

    /* 开始听写，回调 {onResult, onError, onEnd}
     * 若运行环境提供了 MicPermission（Cordova APK），会先申请麦克风权限，
     * 授权成功才启动识别；非 Cordova 环境（浏览器 / 单文件版）直接启动。 */
    listen(callbacks) {
      callbacks = callbacks || {};
      const start = () => {
        if (!SR) { callbacks.onError && callbacks.onError('STT 不可用：当前浏览器不支持语音识别。可改用键盘输入。'); return null; }
        try {
          const rec = new SR();
          rec.lang = 'en-US';
          rec.interimResults = false;
          rec.maxAlternatives = 1;
          rec.continuous = false;
          rec.onresult = (ev) => {
            const txt = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
            callbacks.onResult && callbacks.onResult(txt);
          };
          rec.onerror = (ev) => { callbacks.onError && callbacks.onError(ev.error || '识别错误'); };
          rec.onend = () => { callbacks.onEnd && callbacks.onEnd(); };
          rec.start();
          return rec;
        } catch (e) { callbacks.onError && callbacks.onError(e.message || '启动识别失败'); return null; }
      };

      const mp = global.MicPermission;
      if (mp && typeof mp.ensure === 'function') {
        mp.ensure().then((ok) => {
          if (ok) { start(); }
          else { callbacks.onError && callbacks.onError('麦克风权限未授权：请在系统设置中允许本应用使用麦克风，或改用键盘输入。'); }
        });
        return null; // 异步启动
      }
      return start();
    },
  };

  global.Speech = Speech;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Speech };
})(typeof window !== 'undefined' ? window : globalThis);
