/* =========================================================================
 * app.js — 英语口语情景对话 APK（PWA）主控制器
 * 纯原生 JS，无第三方依赖，可离线运行 / 打包为 Android APK。
 * ========================================================================= */

(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* 深填充：把对象内所有字符串里的 {slot} 用 slots 替换 */
  function deepFill(obj, slots) {
    if (typeof obj === 'string') return fillSlots(obj, slots);
    if (Array.isArray(obj)) return obj.map(x => deepFill(x, slots));
    if (obj && typeof obj === 'object') {
      const o = {};
      for (const k in obj) o[k] = deepFill(obj[k], slots);
      return o;
    }
    return obj;
  }

  const state = { sc: null, partner: null, filterCat: 'all', filterGrade: 'all', rec: null };

  /* ---------------- 年级匹配 ----------------
   * 新情景带精确 grade 字段（如 g3）；早期情景只标了区间文本
   * （如“小学三、四年级”），这里解析区间，保证三年级不漏掉
   * 标注为“三、四年级”的适用情景。 */
  function scenGradeSet(s) {
    if (s.grade) return [s.grade];
    const t = s.grades || '';
    const set = [];
    if (t.indexOf('三') >= 0) set.push('g3');
    if (t.indexOf('四') >= 0) set.push('g4');
    if (t.indexOf('五') >= 0) set.push('g5');
    if (t.indexOf('六') >= 0) set.push('g6');
    return set.length ? set : null;
  }

  function matchGrade(s, g) {
    if (g === 'all') return true;
    const set = scenGradeSet(s);
    if (g === 'other') return !set;
    return !!set && set.indexOf(g) >= 0;
  }

  function countByGrade(g) {
    return SCENARIOS.filter(s => matchGrade(s, g)).length;
  }

  const GRADE_OPTS = [
    { id: 'all', zh: '全部年级' }, { id: 'g3', zh: '三年级' },
    { id: 'g4', zh: '四年级' }, { id: 'g5', zh: '五年级' },
    { id: 'g6', zh: '六年级' }, { id: 'other', zh: '未标注' },
  ];

  /* ---------------- 渲染骨架 ---------------- */
  function shell() {
    $('#app').innerHTML = `
      <header class="topbar">
        <button class="iconbtn" id="navBack" hidden>‹ 返回</button>
        <div class="brand">
          <span class="logo">🎤</span>
          <div>
            <div class="t1">英语口语情景对话</div>
            <div class="t2">English Speaking Scenarios · 离线可用</div>
          </div>
        </div>
      </header>
      <nav class="tabbar" id="tabbar">
        <button data-view="home" class="tab active">首页</button>
        <button data-view="library" class="tab">情景库</button>
        <button data-view="gen" class="tab">智能生成</button>
        <button data-view="about" class="tab">说明</button>
      </nav>
      <main id="view" class="view"></main>
      <footer class="statusbar" id="statusbar"></footer>`;
    $('#navBack').addEventListener('click', () => { if (history.length > 1) history.back(); else go('home'); });
    $$('#tabbar .tab').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
    setStatus();
  }

  /* 是否以「本地文件」方式打开（直接双击 html 的 file:// 协议，非 APK）。
   * 该协议下浏览器会禁用麦克风语音识别与 Service Worker，需要给出不同引导。
   * 注意：Cordova APK 内 WebView 也以 file:// 加载，但它由原生层承载，
   *      麦克风权限走原生申请，不应算作受限的「本地文件模式」，故排除 cordova。 */
  function isFileMode() {
    try {
      if (window.cordova) return false;
      return String(location.protocol || '').indexOf('file') === 0;
    }
    catch (e) { return false; }
  }

  function setStatus() {
    const sb = $('#statusbar');
    if (!sb) return;
    const tts = window.Speech && Speech.ttsAvailable ? '🔊 朗读可用' : '🔇 朗读不可用';
    const stt = window.Speech && Speech.sttAvailable ? '🎙 语音识别可用' : '⌨ 仅键盘输入';
    sb.textContent = `${tts} ｜ ${stt} ｜ ${isFileMode() ? '本地文件模式' : '离线优先 · 可选云端'}`;
  }

  function setActiveTab(view) {
    $$('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  }

  function showBack(show) { const b = $('#navBack'); if (b) b.hidden = !show; }

  /* ---------------- 视图：首页 ---------------- */
  function renderHome() {
    setActiveTab('home'); showBack(false);
    const catCards = CATEGORIES.map(c =>
      `<button class="catcard" data-cat="${c.id}">
         <div class="cat-zh">${esc(c.zh)}</div><div class="cat-en">${esc(c.en)}</div>
         <div class="cat-n">${SCENARIOS.filter(s => s.category === c.id).length} 个情景</div>
       </button>`).join('');
    $('#view').innerHTML = `
      <section class="hero">
        <h1>把“背对话”变成“真会话”</h1>
        <p>信息差 · 角色目标 · 限制条件 —— 学生必须听懂对方、做出选择并完成任务。</p>
        <div class="hero-actions">
          <button class="btn primary" data-go="library">浏览情景库</button>
          <button class="btn" data-go="gen">智能生成情景</button>
        </div>
      </section>
      <h2 class="sec">按年级进入</h2>
      <div class="gradegrid">${gradeCards()}</div>
      <h2 class="sec">按类别进入</h2>
      <div class="catgrid">${catCards}</div>
      ${isFileMode()
        ? `<div class="tip warn">📱 <b>本地文件模式</b>：情景库、独立练习、朗读均可正常使用；
             受浏览器安全限制，<b>麦克风语音识别</b>与<b>云端大模型生成</b>需要 https 环境，
             这里请用键盘输入 —— 不影响任何练习功能。</div>`
        : ''}`;
    /* 「添加到主屏幕」引导横幅：可一键弹官方安装框 / 显示 iOS、菜单手动路径 */
    if (window.AppInstall) window.AppInstall.mount($('#view'), 'banner');
    $$('#view [data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    $$('#view .catcard').forEach(b => b.addEventListener('click', () => { state.filterCat = b.dataset.cat; state.filterGrade = 'all'; renderLibrary(); }));
    $$('#view .gradecard').forEach(b => b.addEventListener('click', () => { state.filterGrade = b.dataset.grade; state.filterCat = 'all'; renderLibrary(); }));
  }

  /* 首页年级卡片：三年级优先展示 */
  function gradeCards() {
    return GRADE_OPTS.filter(g => g.id !== 'all' && g.id !== 'other').map(g => {
      const G = GRADES[g.id];
      const n = countByGrade(g.id);
      return `<button class="gradecard ${g.id === 'g3' ? 'feat' : ''}" data-grade="${g.id}">
          <div class="gd-name">${esc(G.zh)}${g.id === 'g3' ? '<span class="gd-new">刚起步</span>' : ''}</div>
          <div class="gd-en">${esc(G.en)} · ${esc(G.age)}</div>
          <div class="gd-n">${n} 个情景 · ${esc(G.levels.join(' / '))}</div>
          <div class="gd-topic">${esc((G.topics || []).slice(0, 4).join(' · '))}</div>
        </button>`;
    }).join('');
  }

  /* ---------------- 视图：情景库 ---------------- */
  function renderLibrary() {
    setActiveTab('library'); showBack(false);
    const cats = [{ id: 'all', zh: '全部' }].concat(CATEGORIES);
    const chips = cats.map(c => `<button class="chip ${state.filterCat === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.zh)}</button>`).join('');
    const gchips = GRADE_OPTS.map(g =>
      `<button class="chip gchip ${state.filterGrade === g.id ? 'on' : ''}" data-grade="${g.id}">${esc(g.zh)} ${countByGrade(g.id)}</button>`).join('');
    const list = SCENARIOS.filter(s =>
      (state.filterCat === 'all' || s.category === state.filterCat) && matchGrade(s, state.filterGrade));
    const cards = list.map(s => `
      <button class="scard ${s.grade === 'g3' ? 'is-g3' : ''}" data-id="${s.id}">
        <div class="sc-top"><span class="tag">${esc(s.func)}</span><span class="lvl">${esc(s.level)}</span></div>
        <div class="sc-title">${esc(s.title)}${s.grade === 'g3' ? '<span class="g3badge">三年级</span>' : ''}</div>
        <div class="sc-en">${esc(s.titleEn)}</div>
        <div class="sc-meta">${esc(s.grades)} · ${esc(s.duration)}</div>
        ${s.grade === 'g3' && s.textbook ? `<div class="sc-book">${esc(s.textbook)}</div>` : ''}
      </button>`).join('') || `<div class="empty">当前筛选下暂无情景，试试切换类别或年级。</div>`;
    const g3 = state.filterGrade === 'g3' ? GRADES.g3 : null;
    $('#view').innerHTML = `
      <h2 class="sec">情景库</h2>
      ${g3 ? `<div class="grade-note">
        <b>小学三年级</b>（${esc(g3.age)}）：${esc(g3.start)}。
        语言上限 —— 每句 ${esc(g3.sentence)}，生词 ${esc(g3.newWords)}，${esc(g3.rounds)}。
      </div>` : ''}
      <div class="chips">${chips}</div>
      <div class="chips gchips">${gchips}</div>
      <div class="sclist">${cards}</div>`;
    $$('#view .chip[data-cat]').forEach(b => b.addEventListener('click', () => { state.filterCat = b.dataset.cat; renderLibrary(); }));
    $$('#view .chip[data-grade]').forEach(b => b.addEventListener('click', () => { state.filterGrade = b.dataset.grade; renderLibrary(); }));
    $$('#view .scard').forEach(b => b.addEventListener('click', () => openScenario(b.dataset.id, 'library')));
  }

  /* ---------------- 打开情景（填充插槽后渲染详情） ---------------- */
  function openScenario(id, from) {
    const base = SCENARIOS.find(s => s.id === id);
    if (!base) return;
    const sc = deepFill(JSON.parse(JSON.stringify(base)), base.slots || {});
    state.sc = sc;
    renderDetail(sc, from);
  }

  function renderDetail(sc, from) {
    setActiveTab(''); showBack(true);
    const coreRows = (sc.core || []).map(c =>
      `<tr><td>${esc(c.func)}</td><td><code>${esc(c.expr)}</code></td><td class="zh">${esc(c.zh)}</td></tr>`).join('');
    const demoRows = (sc.demo || []).map(d =>
      `<div class="demo-line"><span class="who ${d.who === 'B' ? 'b' : 'a'}">${esc(d.who)}</span><span class="en">${esc(d.en)}</span><button class="mini-speak" data-t="${esc(d.en)}">🔊</button><div class="zh">${esc(d.zh)}</div></div>`).join('');
    const roles = (sc.roles && Object.values(sc.roles)) || [];
    const roleCards = roles.map(r => `
      <div class="rolecard">
        <div class="role-name">${esc(r.name)}</div>
        <ul>
          <li><b>你是：</b>${esc(r.youAre)}</li>
          <li><b>你知道：</b>${esc(r.youKnow)}</li>
          <li><b>你需要知道：</b>${esc(r.youNeed)}</li>
          <li><b>你的目标：</b>${esc(r.yourGoal)}</li>
          <li><b>你不能：</b>${esc(r.cannot)}</li>
          <li><b>结束时要：</b>${esc(r.endWith)}</li>
        </ul>
      </div>`).join('');
    const fu = sc.followup || {};
    const stuck = (sc.stuck || []).map((s, i) => `<li>${i + 1}. ${esc(s)}</li>`).join('');
    const rubric = (sc.rubric || []).map(r => `<tr><td>${esc(r.dim)}</td><td class="ok">${esc(r.ok)}</td><td class="need">${esc(r.need)}</td></tr>`).join('');
    const transfer = (sc.transfer || []).map(t => `<li>${esc(t)}</li>`).join('');

    $('#view').innerHTML = `
      <div class="detail">
        <div class="d-head">
          <h1>${esc(sc.title)}</h1>
          <div class="d-en">${esc(sc.titleEn)}</div>
          <div class="d-tags"><span class="tag">${esc(sc.func)}</span><span class="lvl">${esc(sc.level)}</span><span class="tag2">${esc(sc.duration)}</span></div>
        </div>

        <div class="actions">
          <button class="btn primary" id="btnPractice">▶ 开始独立练习（和 AI 对话）</button>
          <button class="btn" id="btnTeacher">外教执行卡</button>
          <button class="btn" id="btnRubric">评价标准</button>
        </div>

        <section class="block">
          <h3>一、教学定位</h3>
          <div class="kv"><span>年级与起点</span><b>${esc(sc.grades)}</b></div>
          <div class="kv"><span>教材对应</span><b>${esc(sc.textbook || '通用')}</b></div>
          <div class="kv"><span>交际功能</span><b>${esc(sc.func)}</b></div>
          <div class="kv"><span>最终成果</span><b>${esc(sc.outcome)}</b></div>
          <div class="kv"><span>建议时长</span><b>${esc(sc.duration)}</b></div>
        </section>

        <section class="block">
          <h3>二、核心语言</h3>
          <table class="tbl"><thead><tr><th>功能</th><th>核心表达</th><th>中文提示</th></tr></thead><tbody>${coreRows}</tbody></table>
        </section>

        <section class="block">
          <h3>三、情景设定</h3>
          <div class="kv"><span>地点</span><b>${esc(sc.setting.place)}</b></div>
          <div class="kv"><span>共同任务</span><b>${esc(sc.setting.task)}</b></div>
          <div class="kv"><span>限制条件</span><b>${esc(sc.setting.constraints)}</b></div>
          <div class="kv"><span>完成标志</span><b>${esc(sc.setting.done)}</b></div>
        </section>

        <section class="block">
          <h3>四、角色卡</h3>
          <div class="rolewrap">${roleCards}</div>
        </section>

        <section class="block">
          <h3>五、短示范</h3>
          <div class="demo">${demoRows}</div>
        </section>

        <section class="block">
          <h3>六、三级任务</h3>
          <div class="tabs3">
            <button class="t3 on" data-t="basic">保底版</button>
            <button class="t3" data-t="standard">标准版</button>
            <button class="t3" data-t="challenge">挑战版</button>
          </div>
          <div class="t3body" id="t3body">${esc(sc.tasks.basic)}</div>
        </section>

        <section class="block">
          <h3>七、追问与回应</h3>
          <div class="kv"><span>追问</span><b>${esc(fu.ask || '')}</b></div>
          <div class="kv"><span>同意</span><b>${esc(fu.agree || '')}</b></div>
          <div class="kv"><span>不同意</span><b>${esc(fu.disagree || '')}</b></div>
          <div class="kv"><span>请求澄清</span><b>${esc(fu.clarify || '')}</b></div>
        </section>

        <section class="block">
          <h3>八、卡壳支持</h3>
          <ol class="stuck">${stuck}</ol>
        </section>

        <section class="block">
          <h3>十、独立练习版</h3>
          <ul class="solo">${(sc.solo || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        </section>

        <section class="block">
          <h3>十二、迁移任务</h3>
          <ul>${transfer}</ul>
        </section>

        <div class="actions">
          <button class="btn primary" id="btnPractice2">▶ 开始独立练习（和 AI 对话）</button>
        </div>
      </div>`;

    $('#btnPractice').addEventListener('click', () => renderPractice(sc));
    const bp2 = $('#btnPractice2'); if (bp2) bp2.addEventListener('click', () => renderPractice(sc));
    $('#btnTeacher').addEventListener('click', () => renderTeacher(sc));
    $('#btnRubric').addEventListener('click', () => renderRubric(sc));
    $$('#view .t3').forEach(b => b.addEventListener('click', () => {
      $$('#view .t3').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      $('#t3body').textContent = sc.tasks[b.dataset.t];
    }));
    $$('#view .mini-speak').forEach(b => b.addEventListener('click', () => window.Speech && Speech.speak(b.dataset.t)));
  }

  /* ---------------- 视图：智能生成 ---------------- */
  function renderGenerator() {
    setActiveTab('gen'); showBack(false);
    const catOpts = [{ id: 'all', zh: '随机类别' }].concat(CATEGORIES).map(c => `<option value="${c.id}">${esc(c.zh)}</option>`).join('');
    const funcOpts = FUNCTIONS.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
    const lvlOpts = Object.keys(LEVELS).map(k => `<option value="${k}">${esc(LEVELS[k].zh)}（${esc(LEVELS[k].rounds)}）</option>`).join('');
    const funcOptsC = `<option value="">不限</option>` + funcOpts;
    const lvlOptsC = `<option value="">不限</option>` + lvlOpts;
    const gradeOpts = GRADE_OPTS.filter(g => g.id !== 'other')
      .map(g => `<option value="${g.id}">${g.id === 'all' ? '不限年级' : esc(GRADES[g.id].zh)}</option>`).join('');
    const gradeOptsC = GRADE_OPTS.filter(g => g.id !== 'other')
      .map(g => `<option value="${g.id === 'all' ? '' : g.id}">${g.id === 'all' ? '不限年级' : esc(GRADES[g.id].zh)}</option>`).join('');
    const provOpts = Object.keys(LLM.PROVIDERS).map(k => `<option value="${k}">${esc(LLM.PROVIDERS[k].label)}</option>`).join('');
    $('#view').innerHTML = `
      <h2 class="sec">智能生成情景</h2>
      <div class="genmode">
        <button class="gm on" data-m="offline">离线模板生成</button>
        <button class="gm" data-m="cloud">云端大模型生成</button>
      </div>
      <div id="genOffline">
        <p class="hint">选择参数，离线生成一份全新情景包（随机替换活动/角色，并按年级与难度调整三级任务）。</p>
        <div class="form">
          <label>年级<select id="gGrade">${gradeOpts}</select></label>
          <label>类别<select id="gCat">${catOpts}</select></label>
          <label>交际功能<select id="gFunc">${funcOpts}</select></label>
          <label>难度等级<select id="gLvl">${lvlOpts}</select></label>
          <div class="full hint" id="gGradeTip"></div>
          <label>加入情境变化（挑战）<input type="checkbox" id="gTwist"></label>
          <button class="btn primary" id="gGo">⚡ 生成情景包</button>
        </div>
      </div>
      <div id="genCloud" hidden>
        <p class="hint">用云端大模型「真正的自由生成」：描述你想要的主题 / 年级 / 交际功能，模型现场创作情景包。需先在「⚙ 设置」中填入 API Key。</p>
        <div class="form">
          <label>大模型供应商<select id="cProv">${provOpts}</select></label>
          <label>年级<select id="cGrade">${gradeOptsC}</select></label>
          <label>类别（可选）<select id="cCat">${catOpts}</select></label>
          <label>交际功能（可选）<select id="cFunc">${funcOptsC}</select></label>
          <label>难度等级（可选）<select id="cLvl">${lvlOptsC}</select></label>
          <label class="full">自由描述（主题 / 年级 / 场景 / 想练的句型等）
            <textarea id="cPrompt" rows="3" placeholder="例如：给三年级孩子做一个在动物园问动物在哪里的情景，重点练 Where is the ...?"></textarea></label>
          <div class="row">
            <button class="btn primary" id="cGo">🤖 用大模型生成</button>
            <button class="btn" id="cSet">⚙ 设置密钥/接口</button>
          </div>
        </div>
      </div>
      <div id="genOut"></div>`;

    // 模式切换
    $$('#view .gm').forEach(b => b.addEventListener('click', () => {
      $$('#view .gm').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const m = b.dataset.m;
      $('#genOffline').hidden = (m !== 'offline');
      $('#genCloud').hidden = (m !== 'cloud');
    }));

    // 年级 → 难度联动：把可选难度钳制在该年级区间内，并给出语言上限提示
    function syncLevelToGrade() {
      const g = $('#gGrade').value;
      const sel = $('#gLvl');
      const tip = $('#gGradeTip');
      const G = GRADES[g];
      // 年级为空或未知（“不限年级”）时放开全部难度
      if (!G || !sel) {
        if (sel) Array.from(sel.options).forEach(o => { o.disabled = false; });
        if (tip) tip.textContent = '';
        return;
      }
      Array.from(sel.options).forEach(o => { o.disabled = G.levels.indexOf(o.value) < 0; });
      if (G.levels.indexOf(sel.value) < 0) sel.value = G.defaultLevel;
      if (tip) tip.innerHTML = `<b>${esc(G.zh)}</b>（${esc(G.age)}）语言上限：${esc(G.sentence)}；${esc(G.rounds)}；生词 ${esc(G.newWords)}。<br>教材：${esc(G.textbook)}`;
    }
    $('#gGrade').addEventListener('change', syncLevelToGrade);
    syncLevelToGrade();

    // 离线生成
    $('#gGo').addEventListener('click', () => {
      const sc = generateScenario({
        category: $('#gCat').value, func: $('#gFunc').value,
        level: $('#gLvl').value, twist: $('#gTwist').checked,
        grade: $('#gGrade').value,
      });
      showGenerated(sc, 'gen');
    });

    // 云端生成入口
    const cSet = $('#cSet'); if (cSet) cSet.addEventListener('click', () => renderSettings('gen'));
    const cGo = $('#cGo'); if (cGo) cGo.addEventListener('click', () => onCloudGenerate());

    const saved = LLM.loadSettings();
    if (saved.provider && $(`#cProv option[value="${saved.provider}"]`)) $('#cProv').value = saved.provider;
  }

  function showGenerated(sc, from) {
    state.sc = sc;
    $('#genOut').innerHTML = `<div class="gen-banner">已生成：<b>${esc(sc.title)}</b> <button class="btn small" id="gOpen">查看并练习 ›</button></div>`;
    $('#gOpen').addEventListener('click', () => renderDetail(sc, from));
  }

  function onCloudGenerate() {
    const out = $('#genOut');
    const s = LLM.loadSettings();
    if (!s.apiKey) {
      out.innerHTML = `<div class="gen-err">⚠️ 尚未配置 API Key。请先点「⚙ 设置密钥/接口」填入你的密钥。</div>`;
      return;
    }
    out.innerHTML = `<div class="gen-loading">🤖 大模型创作中…（可能需要十几秒，请稍候）</div>`;
    const opts = {
      category: $('#cCat').value,
      func: $('#cFunc').value,
      level: $('#cLvl').value,
      grade: $('#cGrade').value,
      prompt: $('#cPrompt').value,
    };
    LLM.generate(opts).then(sc => {
      showGenerated(sc, 'gen');
      if (window.Speech && Speech.speak) Speech.speak('Scenario generated.');
    }).catch(err => {
      const code = err && err.code;
      let msg = esc(err.message || String(err));
      if (code === 'NO_KEY') msg = '尚未配置 API Key，请先设置。';
      else if (code === 'NETWORK') msg = '网络请求失败：请确认设备已联网，且接口地址允许浏览器跨域（CORS）。打包成 APK 时本工程已放开网络权限。';
      else if (code && code.indexOf('HTTP_') === 0) msg = '接口返回错误：' + msg + '（请检查 API Key / 模型名 / 账户额度）';
      out.innerHTML = `<div class="gen-err">⚠️ 生成失败：${msg}</div>`;
    });
  }

  function generateScenario(opts) {
    /* 年级约束：① 优先从该年级情景中挑模板 ② 难度钳制在该年级区间 */
    const g = (opts.grade && opts.grade !== 'all') ? opts.grade : null;
    const G = g ? GRADES[g] : null;
    let level = opts.level;
    if (G && G.levels.indexOf(level) < 0) level = G.defaultLevel;

    let pool = SCENARIOS.filter(s => opts.category === 'all' || s.category === opts.category);
    if (g) {
      const gp = pool.filter(s => matchGrade(s, g));
      if (gp.length) pool = gp;      // 该年级有可用模板就用它，否则退回全池
    }
    // 优先选同功能的 base，否则随机
    let base = pool.find(s => s.func === opts.func) || pick(pool);
    // 先构造一份带随机化的 slots，再整体填充（确保随机值真正落到输出里）
    const randSlots = Object.assign({}, base.slots || {});
    const nameBank = g ? bankFor(g, 'names') : BANKS.names;
    randSlots.nameA = pick(nameBank);
    randSlots.nameB = pick(nameBank.filter(n => n !== randSlots.nameA));
    randSlots.act = pick(BANKS.activities);
    const copy = JSON.parse(JSON.stringify(base));
    copy.slots = randSlots;            // 写入随机化后的 slots
    const sc = deepFill(copy, randSlots);
    sc.level = level;
    sc.tasks = buildTasksByLevel(sc, level);
    if (opts.twist) sc.setting.constraints += '；情境变化：' + pick(BANKS.twists) + '。';

    if (G) {
      sc.grade = g;
      sc.grades = G.zh;
      // 模板不属于该年级（降级兜底）时，统一改用该年级的教材标注
      if (!matchGrade(base, g)) sc.textbook = G.textbook;
      sc.setting.constraints += `；【${G.zh}语言约束】${G.sentence}，生词${G.newWords}，${G.rounds}。避免：${G.avoid.join('、')}。`;
    }
    sc.generated = true;
    return sc;
  }

  function buildTasksByLevel(scn, level) {
    const L = LEVELS[level];
    const task = (scn.setting && scn.setting.task) || '';
    return {
      basic: `【${L.zh}·保底】${task} 提供图片/句框，完成 ${L.rounds} 基本互动，允许先看示范。`,
      standard: `【${L.zh}·标准】只看关键词与半开放句框，完成 ${L.rounds} 互动，至少提问并回应一次。新词≤${L.newWords}。`,
      challenge: `【${L.zh}·挑战】去掉多数句框，增加一项限制或临场变化，要求给出理由、追问或复述对方信息。`,
    };
  }

  /* ---------------- 视图：独立练习（AI 对话） ---------------- */
  function renderPractice(sc) {
    setActiveTab(''); showBack(true);
    const appRole = (sc.partner && sc.partner.appRole) || 'B';
    const otherRole = appRole === 'B' ? 'A' : 'B';
    const roleObj = sc.roles && sc.roles[appRole];
    $('#view').innerHTML = `
      <div class="practice">
        <div class="p-head">
          <div class="p-title">${esc(sc.title)} · 独立练习</div>
          <div class="p-sub">你扮演 <b>角色 ${otherRole}</b>，应用扮演 <b>角色 ${appRole}</b></div>
        </div>
        <details class="p-roles">
          <summary>📇 角色卡 / 目标</summary>
          <div class="rolewrap">${(sc.roles && Object.values(sc.roles).map(r => `
            <div class="rolecard"><div class="role-name">${esc(r.name)}</div><ul>
              <li><b>你知道：</b>${esc(r.youKnow)}</li>
              <li><b>你需要：</b>${esc(r.youNeed)}</li>
              <li><b>目标：</b>${esc(r.yourGoal)}</li>
              <li><b>结束时要：</b>${esc(r.endWith)}</li></ul></div>`).join('')) || ''}</div>
        </details>
        <div class="chat" id="chat"></div>
        <div class="suggest" id="suggest" hidden>
          <div class="s-label">💡 参考回答（点击填入）：</div>
          <div class="s-body"><span id="sEn"></span> <button class="mini-speak" id="sSpeak">🔊</button></div>
          <div class="s-zh" id="sZh"></div>
        </div>
        <div class="composer">
          <input id="userInput" type="text" placeholder="用英文回复，或点麦克风说话…" autocomplete="off">
          <button class="mic" id="micBtn" title="语音输入">🎙</button>
          <button class="btn primary" id="sendBtn">发送</button>
        </div>
        <div class="p-actions">
          <button class="btn small" id="replayBtn">🔊 重听上句</button>
          <button class="btn small" id="restartBtn">↻ 重新开始</button>
        </div>
        <div class="done-banner" id="doneBanner" hidden>🎉 任务完成！点击“重新开始”换一题，或返回查看评价标准。</div>
      </div>`;

    state.partner = new Partner(sc);
    const chat = $('#chat');
    let lastAppLine = '';

    function addMsg(who, en, zh) {
      const m = document.createElement('div');
      m.className = 'msg ' + (who === 'app' ? 'app' : 'you');
      const w = document.createElement('div'); w.className = 'who'; w.textContent = who === 'app' ? 'AI（角色' + appRole + '）' : '你（角色' + otherRole + '）';
      const e = document.createElement('div'); e.className = 'en'; e.textContent = en;
      m.appendChild(w); m.appendChild(e);
      if (zh) { const z = document.createElement('div'); z.className = 'zh'; z.textContent = zh; m.appendChild(z); }
      const sp = document.createElement('button'); sp.className = 'mini-speak'; sp.textContent = '🔊';
      sp.addEventListener('click', () => window.Speech && Speech.speak(en));
      m.appendChild(sp);
      chat.appendChild(m);
      chat.scrollTop = chat.scrollHeight;
    }

    function showSuggest(s) {
      const box = $('#suggest');
      if (s && s.suggest) {
        $('#sEn').textContent = s.suggest; $('#sZh').textContent = s.suggestZh || '';
        box.hidden = false;
        $('#sSpeak').onclick = () => window.Speech && Speech.speak(s.suggest);
      } else box.hidden = true;
    }

    function appSay(res) {
      addMsg('app', res.en, res.zh);
      lastAppLine = res.en;
      window.Speech && Speech.speak(res.en);
      showSuggest(res);
      if (res.done) $('#doneBanner').hidden = false;
    }

    function userSend(text) {
      if (!text || !text.trim()) return;
      addMsg('you', text.trim(), '');
      const res = state.partner.respond(text);
      setTimeout(() => appSay(res), 350);
    }

    // 开场
    const opening = state.partner.start();
    setTimeout(() => appSay(opening), 300);

    $('#sendBtn').addEventListener('click', () => {
      const v = $('#userInput').value; $('#userInput').value = ''; userSend(v);
    });
    $('#userInput').addEventListener('keydown', e => { if (e.key === 'Enter') { const v = $('#userInput').value; $('#userInput').value = ''; userSend(v); } });
    $('#replayBtn').addEventListener('click', () => { if (lastAppLine) window.Speech && Speech.speak(lastAppLine); });
    $('#restartBtn').addEventListener('click', () => renderPractice(sc));
    $('#sEn') && $('#sEn').addEventListener('click', () => { const t = $('#sEn').textContent; if (t) $('#userInput').value = t; });

    const mic = $('#micBtn');
    if (!(window.Speech && Speech.sttAvailable)) { mic.disabled = true; mic.title = '当前浏览器不支持语音识别，可用键盘输入'; }
    mic.addEventListener('click', () => {
      if (!window.Speech || !Speech.sttAvailable) return;
      mic.classList.add('rec');
      Speech.listen({
        onResult: (txt) => { mic.classList.remove('rec'); if (txt) { $('#userInput').value = txt; userSend(txt); } },
        onError: (e) => { mic.classList.remove('rec'); alert('语音识别：' + e); },
        onEnd: () => mic.classList.remove('rec'),
      });
    });
  }

  /* ---------------- 视图：外教执行卡 ---------------- */
  function renderTeacher(sc) {
    setActiveTab(''); showBack(true);
    const t = sc.teacherCard || {};
    $('#view').innerHTML = `
      <div class="detail">
        <h1>外教执行卡 · ${esc(sc.title)}</h1>
        <section class="block"><h3>Teacher says</h3><div class="callout">${esc(t.says || '')}</div></section>
        <section class="block"><h3>Students do</h3><div class="callout">${esc(t.do || '')}</div></section>
        <section class="block"><h3>Monitor（观察重点）</h3><div class="callout">${esc(t.monitor || '')}</div></section>
        <section class="block"><h3>Correction（纠错重点）</h3><div class="callout">${esc(t.correct || '')}</div></section>
        <section class="block"><h3>Success check（成功标准）</h3><div class="callout ok">${esc(t.success || '')}</div></section>
        <div class="actions"><button class="btn primary" id="back">‹ 返回情景</button></div>
      </div>`;
    $('#back').addEventListener('click', () => renderDetail(sc, 'library'));
  }

  /* ---------------- 视图：评价标准 ---------------- */
  function renderRubric(sc) {
    setActiveTab(''); showBack(true);
    const rows = (sc.rubric || []).map(r => `<tr><td>${esc(r.dim)}</td><td class="ok">${esc(r.ok)}</td><td class="need">${esc(r.need)}</td></tr>`).join('');
    $('#view').innerHTML = `
      <div class="detail">
        <h1>评价标准 · ${esc(sc.title)}</h1>
        <table class="tbl"><thead><tr><th>维度</th><th>达标</th><th>需要支持</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="actions"><button class="btn primary" id="back2">‹ 返回情景</button></div>
      </div>`;
    $('#back2').addEventListener('click', () => renderDetail(sc, 'library'));
  }

  /* 说明页：年级体系与三年级专项说明（避免三年级孩子被超纲语言劝退） */
  function g3Count() { return countByGrade('g3'); }

  function gradeSection() {
    const G = GRADES.g3;
    const rows = GRADE_OPTS.filter(g => g.id !== 'all' && g.id !== 'other').map(g => {
      const GG = GRADES[g.id];
      return `<tr><td>${esc(GG.zh)}</td><td>${esc(GG.age)}</td><td>${esc(GG.levels.join(' / '))}</td><td>${esc(GG.sentence)}</td><td>${countByGrade(g.id)}</td></tr>`;
    }).join('');
    return `
      <section class="block"><h3>年级体系与语言上限</h3>
        <p>每个情景都标注适用年级，并按年级限定<b>句长、生词量与互动轮次</b>。</p>
        <table class="tbl"><thead><tr><th>年级</th><th>年龄</th><th>难度区间</th><th>句长上限</th><th>情景数</th></tr></thead><tbody>${rows}</tbody></table>
      </section>
      <section class="block"><h3>小学三年级（英语起步年）</h3>
        <p>三年级是多数地区英语的<b>起点年</b>，语言必须压到最低。三年级情景统一遵守：</p>
        <ul>
          <li><b>句长</b>：${esc(G.sentence)}</li>
          <li><b>生词</b>：${esc(G.newWords)}；<b>互动</b>：${esc(G.rounds)}</li>
          <li><b>难度</b>：只用 ${esc(G.levels.join(' 与 '))}（S1 模仿表达 / S2 句框表达）</li>
          <li><b>词汇</b>：${esc(G.vocab)}</li>
          <li><b>禁止</b>：${esc(G.avoid.join('、'))}</li>
          <li><b>中文支架</b>：${esc(G.zhSupport)}</li>
        </ul>
        <p>话题按 <b>${esc(G.textbook)}</b> 编排，覆盖问候与自我介绍、颜色、身体部位、动物、食物与饮料、数字与年龄、家庭成员、方位介词、水果与喜好等。交际功能只保留三年级能承担的：询问信息、描述与确认、表达偏好、购买与点餐、解决简单问题。</p>
        <p>用云端大模型生成时，若选择三年级，上述约束会作为<b>最高优先级</b>写入提示词，模型返回的难度若越界也会被自动钳制回 ${esc(G.levels.join(' / '))}。</p>
      </section>`;
  }

  /* ---------------- 视图：说明 ---------------- */
  function renderAbout() {
    setActiveTab('about'); showBack(false);
    $('#view').innerHTML = `
      <div class="detail">
        <h1>使用说明</h1>
        <section class="block"><h3>这是什么</h3>
          <p>本应用把“背一段对话”改造成“必须听懂对方、做出选择并完成任务”的口语互动，遵循《英语口语情景对话生成器》方法论：每个情景都具备<b>信息差、角色目标、限制条件</b>三项中的至少两项。</p></section>
        <section class="block"><h3>三大模块</h3>
          <ul>
            <li><b>情景库</b>：共 ${SCENARIOS.length} 个完整情景包（12 节模板），其中<b>小学三年级 ${g3Count()} 个</b>，另有四~六年级 ${SCENARIOS.length - g3Count()} 个。</li>
            <li><b>智能生成·离线</b>：选年级+类别+功能+难度，离线生成全新情景包；选年级后难度会自动钳制在该年级区间。</li>
            <li><b>智能生成·云端</b>：在「智能生成 → 云端大模型生成」中填入 API Key 后，用自然语言描述主题/年级/句型，由大模型现场创作情景包。</li>
            <li><b>独立练习</b>：应用扮演其中一个角色，按脚本事实与你真实对话；可文字或语音输入，应用会用英语回复并朗读。</li>
          </ul></section>
        ${gradeSection()}
        <section class="block"><h3>关于 APK / 离线</h3>
          <p>本应用是<b>纯前端 PWA</b>，所有数据与对话逻辑均离线内置，无需联网、无需 API Key。通过下方「添加到主屏幕」安装后，即可像 App 一样全屏离线使用。</p>
          <p>如需安装包 <code>.apk</code>，可用本项目附带的 Cordova 工程打包（见 <code>build-apk.md</code>）：装好 Android Studio 与 Cordova 后执行 <code>cordova platform add android &amp;&amp; cordova build android</code> 即可生成签名 APK。</p></section>
        <section class="block"><h3>关于云端大模型生成</h3>
          <p>云端生成调用你配置的 OpenAI 兼容接口（支持 OpenAI / DeepSeek / Kimi / 通义千问 / 智谱 等）。API Key 仅保存在本机 <code>localStorage</code>，仅发往你所选的服务商，不会上传第三方。</p>
          <p>注意：① 浏览器直接调用大模型接口可能受跨域(CORS)限制；打包为安卓 APK 时本工程已放开网络权限，若仍报 CORS 建议用自有后端代理转发。② 每次生成会消耗对应账户的额度，请妥善保管 Key。</p>
        </section>
        <section class="block"><h3>隐私</h3>
          <p>不收集任何个人信息，不要求孩子透露家庭收入、住址、学校或联系方式。</p></section>
      </div>`;
    /* 「添加到主屏幕」完整安装卡片（含一键安装 / iOS 与菜单手动路径） */
    if (window.AppInstall) window.AppInstall.mount($('#view'), 'card');
  }

  /* ---------------- 视图：云端大模型设置 ---------------- */
  function renderSettings(from) {
    setActiveTab(''); showBack(true);
    const s = LLM.loadSettings();
    const provOpts = Object.keys(LLM.PROVIDERS).map(k => `<option value="${k}">${esc(LLM.PROVIDERS[k].label)}</option>`).join('');
    $('#view').innerHTML = `
      <div class="detail">
        <h1>云端大模型设置</h1>
        <p class="hint">生成「自由情景」需要调用大模型接口。请选择供应商并填入你的 API Key。Key 仅保存在本机（localStorage），仅发往你所选的服务商，不会上传任何第三方。</p>
        <div class="form">
          <label>供应商<select id="sProv">${provOpts}</select></label>
          <label>接口地址 Base URL<input id="sBase" type="text" placeholder="https://.../v1" value="${esc(s.base || '')}"></label>
          <label>API Key<input id="sKey" type="password" placeholder="sk-..." value="${esc(s.apiKey || '')}"></label>
          <label>模型名称<input id="sModel" type="text" placeholder="如 deepseek-chat" value="${esc(s.model || '')}"></label>
          <label class="full">创造性（温度） <span id="sTempVal">${s.temperature || 0.8}</span>
            <input id="sTemp" type="range" min="0" max="1" step="0.1" value="${s.temperature || 0.8}"></label>
          <div class="row">
            <button class="btn primary" id="sSave">💾 保存设置</button>
            <button class="btn" id="sBack">‹ 返回</button>
          </div>
        </div>
        <div class="tip">💡 提示：浏览器直接调用大模型接口可能遇到跨域(CORS)限制。本工程 config.xml 已放开 APK 网络权限；若仍报 CORS，建议把 Key 放在自己的后端代理里转发请求。</div>
      </div>`;
    if (s.provider && $(`#sProv option[value="${s.provider}"]`)) $('#sProv').value = s.provider;
    $('#sProv').addEventListener('change', () => {
      const p = LLM.PROVIDERS[$('#sProv').value];
      if (p) {
        if (!$('#sBase').value.trim()) $('#sBase').value = p.base || '';
        if (!$('#sModel').value.trim()) $('#sModel').value = p.model || '';
      }
    });
    $('#sTemp').addEventListener('input', () => { $('#sTempVal').textContent = $('#sTemp').value; });
    $('#sSave').addEventListener('click', () => {
      LLM.saveSettings({
        provider: $('#sProv').value,
        base: $('#sBase').value.trim(),
        apiKey: $('#sKey').value.trim(),
        model: $('#sModel').value.trim(),
        temperature: parseFloat($('#sTemp').value) || 0.8,
      });
      const tip = document.createElement('div'); tip.className = 'gen-banner'; tip.textContent = '✅ 已保存设置。';
      $('#view').appendChild(tip);
      setTimeout(() => { if (from === 'gen') renderGenerator(); else renderAbout(); }, 600);
    });
    $('#sBack').addEventListener('click', () => { if (from === 'gen') renderGenerator(); else renderAbout(); });
  }

  /* ---------------- 路由 ---------------- */
  const views = { home: renderHome, library: renderLibrary, gen: renderGenerator, about: renderAbout, settings: () => renderSettings('gen') };
  function go(view) { if (views[view]) views[view](); }

  /* ---------------- 启动 ---------------- */
  function init() {
    shell();
    go('home');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 暴露给控制台调试
  window.__app = {
    generateScenario, openScenario, renderGenerator, renderSettings, state,
    renderHome, renderLibrary, renderAbout, renderDetail, matchGrade, countByGrade,
  };
})();
