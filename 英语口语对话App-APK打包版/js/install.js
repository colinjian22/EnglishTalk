/* =========================================================================
 * install.js — 「添加到主屏幕」安装引导（PWA 安装入口的兜底方案）
 *
 * 为什么需要它：
 *   即便 manifest / Service Worker / 图标全部达标，各浏览器对「安装应用 /
 *   添加到主屏幕」菜单项的露出策略也不一致（有的藏在二级菜单，有的要求
 *   用户访问次数，iOS 更是完全没有该菜单项）。所以应用内自己提供安装入口：
 *
 *   - Android/桌面 Chromium：捕获 beforeinstallprompt，点按钮直接弹官方
 *     安装弹窗（与菜单里那个入口等价）。
 *   - iOS Safari：没有安装事件，显示「分享 → 添加到主屏幕」的操作指引。
 *   - 其他/未达标：显示对应浏览器的手动添加路径。
 *
 * 用法（app.js）：
 *   AppInstall.mount($('#view'), 'banner');  // 首页顶部横幅（可关闭）
 *   AppInstall.mount($('#view'), 'card');    // 说明页里的完整安装卡片
 * ========================================================================= */
(function (global) {
  'use strict';

  var DISMISS_KEY = 'estalk-install-dismissed';
  var deferred = null;          // beforeinstallprompt 事件
  var installed = false;        // appinstalled 已触发 / 已处于 standalone
  var onChange = [];

  function isStandalone() {
    try {
      if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) return true;
      if (global.matchMedia && global.matchMedia('(display-mode: fullscreen)').matches) return true;
    } catch (e) {}
    // iOS Safari 加入主屏幕后 standalone 标志
    if (global.navigator && global.navigator.standalone === true) return true;
    return false;
  }

  function isIOS() {
    var ua = global.navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua)) return true;
    // iPadOS 13+ 桌面 UA 伪装：Macintosh + 多点触控
    if (/Macintosh/i.test(ua) && global.navigator.maxTouchPoints > 1) return true;
    return false;
  }

  function isAndroid() { return /android/i.test(global.navigator.userAgent || ''); }

  function notify() { onChange.forEach(function (f) { try { f(); } catch (e) {} }); }

  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // 阻止浏览器自动弹横幅，改由应用内按钮触发
    deferred = e;
    notify();
  });

  global.addEventListener('appinstalled', function () {
    deferred = null;
    installed = true;
    dismiss();                   // 装好了，永久收起引导
    removeBanners();
    notify();
  });

  function dismissed() {
    try { return !!global.localStorage.getItem(DISMISS_KEY); } catch (e) { return false; }
  }
  function dismiss() {
    try { global.localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  }

  /* 当前引导状态 */
  function state() {
    if (installed || isStandalone()) return 'installed';
    if (deferred) return 'prompt';   // 可直接弹官方安装框
    if (isIOS()) return 'ios';       // iOS 走分享菜单
    return 'manual';                 // 其余：浏览器菜单手动添加
  }

  /* 触发官方安装弹窗，返回 Promise<boolean>（true = 用户接受） */
  function promptInstall() {
    return new Promise(function (resolve) {
      if (!deferred) { resolve(false); return; }
      var ev = deferred;
      deferred = null;
      ev.prompt();
      ev.userChoice.then(function (res) {
        if (res && res.outcome === 'accepted') dismiss();
        notify();
        resolve(!!(res && res.outcome === 'accepted'));
      }).catch(function () { resolve(false); });
    });
  }

  function removeBanners() {
    var els = document.querySelectorAll('.install-banner');
    for (var i = 0; i < els.length; i++) els[i].parentNode && els[i].parentNode.removeChild(els[i]);
  }

  /* ---------- 视图模板 ---------- */

  var MANUAL_TIP = isAndroid()
    ? '点击浏览器右上角 <b>⋮</b> 菜单，选择「<b>安装应用</b>」或「<b>添加到主屏幕</b>」。'
    : '点击浏览器地址栏右侧的「<b>安装</b>」图标，或打开浏览器菜单选择「安装应用 / 添加到主屏幕」。';

  function bannerHTML() {
    var st = state();
    if (st === 'installed' || dismissed()) return '';
    var action = '';
    if (st === 'prompt') {
      action = '<button class="btn primary ib-btn" id="ibGo">添加</button>';
    }
    var text = (st === 'prompt')
      ? '<b>把口语练习装进手机</b><span>全屏运行 · 离线可用 · 无广告</span>'
      : (st === 'ios')
        ? '<b>添加到主屏幕</b><span>点 Safari 底部<b>分享 ⬆</b> → 「添加到主屏幕」</span>'
        : '<b>添加到主屏幕</b><span>' + MANUAL_TIP + '</span>';
    return '<div class="install-banner" id="installBanner" role="region" aria-label="添加到主屏幕">' +
      '<div class="ib-icon">📱</div>' +
      '<div class="ib-text">' + text + '</div>' + action +
      '<button class="ib-close" id="ibClose" aria-label="关闭">×</button></div>';
  }

  function cardHTML() {
    var st = state();
    if (st === 'installed') {
      return '<section class="block install-card"><h3>📲 已安装</h3>' +
        '<p>本应用已添加到主屏幕，正在以独立 App 模式运行。</p></section>';
    }
    var body;
    if (st === 'prompt') {
      body = '<p>已满足安装条件，点击下方按钮即可像原生 App 一样安装：</p>' +
        '<div class="row"><button class="btn primary" id="icGo">📲 添加到主屏幕</button></div>';
    } else if (st === 'ios') {
      body = '<p>iOS Safari 请按以下步骤添加（iOS 不提供一键安装按钮）：</p>' +
        '<ol><li>点 Safari 底部工具栏的「<b>分享</b>」按钮 <b>⬆️</b></li>' +
        '<li>在菜单中找到「<b>添加到主屏幕</b>」</li>' +
        '<li>点「<b>添加</b>」，图标即出现在主屏幕</li></ol>';
    } else {
      body = '<p>请按所用浏览器的路径手动添加：</p><p>' + MANUAL_TIP + '</p>';
    }
    return '<section class="block install-card"><h3>📲 添加到主屏幕</h3>' + body +
      '<p class="hint" style="margin-top:10px">添加后从主屏幕图标打开即为全屏独立窗口，' +
      '且首次联网后所有内容可离线使用。若菜单里没有安装项，通常是浏览器还在「熟悉期」' +
      '（部分浏览器需访问 1~2 次后才出现），或manifest 图标/Service Worker 未通过校验——本页按钮会自动检测。</p></section>';
  }

  /* ---------- 挂载 + 事件绑定 ---------- */
  function bindOne(container) {
    var go = container.querySelector('#ibGo') || container.querySelector('#icGo');
    if (go) go.addEventListener('click', function () { promptInstall(); });
    var close = container.querySelector('#ibClose');
    if (close) close.addEventListener('click', function () {
      dismiss();
      var b = container.querySelector('#installBanner');
      if (b && b.parentNode) b.parentNode.removeChild(b);
    });
  }

  /**
   * 把引导挂到某个容器里。
   * mode = 'banner'：首页顶部横幅（可关闭，永久记住关闭状态）
   * mode = 'card'  ：说明页完整卡片
   */
  function mount(container, mode) {
    if (!container) return '';
    var html = (mode === 'card') ? cardHTML() : bannerHTML();
    if (!html) return '';
    container.insertAdjacentHTML('afterbegin', html);
    bindOne(container);
    return html;
  }

  /* 状态变化时同步移除已挂载的横幅（卡片无需移除） */
  onChange.push(function () {
    if (state() === 'installed') removeBanners();
  });

  global.AppInstall = {
    mount: mount,
    state: state,
    promptInstall: promptInstall,
    isStandalone: isStandalone,
    isIOS: isIOS,
    onUpdate: function (f) { onChange.push(f); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { AppInstall: global.AppInstall };
})(typeof window !== 'undefined' ? window : globalThis);
