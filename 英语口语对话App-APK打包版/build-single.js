/* =========================================================================
 * build-single.js — 生成「单文件版」HTML
 * 把 css / 全部 js / 图标 内联进一个 .html，方便直接拷到手机上用浏览器打开
 * （file:// 协议下也能跑，不需要服务器、不需要打包 APK）。
 *
 * 用法：node build-single.js
 * ========================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'EnglishTalkApp-单文件版.html');

const JS_FILES = ['js/data.js', 'js/partner.js', 'js/speech.js', 'js/mic-permission.js', 'js/llm.js', 'js/install.js', 'js/app.js'];

function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

/* 防止脚本内容里出现 </script> 提前闭合标签 */
function safeScript(code) {
  return code.replace(/<\/script>/gi, '<\\/script>');
}

let html = read('index.html');

/* ⚠️ 重要：String.prototype.replace 的「替换字符串」中 `$$` 是转义序列，
 * 会被解释成单个 `$`。本项目的 app.js 里有 `const $$ = ...`，
 * 若用字符串形式替换会被静默改写成 `const $ = ...` 从而重复声明报错。
 * 因此下面所有替换一律使用「返回字符串的函数」形式，函数返回值不做 $ 转义。 */
function lit(s) { return () => s; }

/* 1) 内联样式 */
const css = read('css/styles.css');
html = html.replace(/<link rel="stylesheet"[^>]*>/i, lit(`<style>\n${css}\n</style>`));

/* 2) 内联图标（data URI，避免相对路径失效） */
let iconDataUri = '';
try {
  const svg = read('assets/icon.svg');
  iconDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ').trim());
} catch (e) { /* 图标缺失则跳过 */ }

/* 3) 移除 manifest（file:// 下加载必失败，只会污染控制台） */
html = html.replace(/\s*<link rel="manifest"[^>]*>/i, '');

/* 4) 替换图标链接 */
if (iconDataUri) {
  html = html.replace(/<link rel="icon"[^>]*>/i, lit(`<link rel="icon" type="image/svg+xml" href="${iconDataUri}" />`));
  html = html.replace(/<link rel="apple-touch-icon"[^>]*>/i, lit(`<link rel="apple-touch-icon" href="${iconDataUri}" />`));
} else {
  html = html.replace(/\s*<link rel="icon"[^>]*>/i, '');
  html = html.replace(/\s*<link rel="apple-touch-icon"[^>]*>/i, '');
}

/* 5) 内联全部脚本
 * ⚠️ 正则文件名部分用 [^"]+ 而非 [a-z]+，否则含连字符的文件名
 * （如 js/mic-permission.js）无法匹配，会导致该标签及之后的脚本
 * 没有被内联、仍作为外部 <script src> 残留（file:// 下会 404）。 */
const jsBundle = JS_FILES.map(f => `/* ===== ${f} ===== */\n${safeScript(read(f))}`).join('\n\n');
html = html.replace(
  /(\s*<script src="js\/[^"]+\.js"><\/script>\s*)+/i,
  lit(`\n<script>\n${jsBundle}\n</script>\n`)
);

/* 6) Service Worker 在 file:// 下无法注册，改成静默检测，避免控制台报错 */
html = html.replace(
  /if \('serviceWorker' in navigator\)[\s\S]*?\n  <\/script>/,
  lit(`// file:// 协议下 Service Worker 无法注册，这里直接跳过（不影响任何功能）\n  </script>`)
);

/* 7) 标题标注 */
html = html.replace(/<title>([^<]*)<\/title>/, (m, t) => `<title>${t} · 单文件版</title>`);

/* 8) 自检：确保 $$ 没有被 replace 吞掉 */
if (!html.includes('const $$ =')) {
  console.error('✗ 自检失败：未找到 `const $$`，可能被 $$ 转义破坏');
  process.exit(1);
}

fs.writeFileSync(OUT, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`✓ 已生成：${path.basename(OUT)}（${kb} KB）`);
console.log(`  位置：${OUT}`);
