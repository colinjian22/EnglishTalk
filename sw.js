/* Service Worker：离线缓存核心资源，使应用可全屏离线运行
 * ⚠️ 缓存清单必须与 index.html 实际引用的资源一致——任何一项 404 都会导致
 * install 阶段 addAll() 整体失败、SW 永远无法激活，进而让浏览器判定
 * 「不可安装」，菜单里就不会出现「添加到主屏幕/安装应用」。 */
const CACHE = 'estalk-v4';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/partner.js',
  './js/speech.js',
  './js/mic-permission.js',
  './js/llm.js',
  './js/install.js',
  './js/app.js',
  './manifest.json',
  './assets/icon.svg',
  './assets/favicon-32.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
