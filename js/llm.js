/* =========================================================================
 * llm.js — 云端大模型生成（OpenAI 兼容接口）
 * 用于「真正的自由生成」：把用户的主题/年级/交际功能/难度描述交给大模型，
 * 由其发挥生成一份全新情景对话包（仍遵循本应用的 12 节模板 + partner 引擎格式），
 * 解析为场景对象后交给本地 partner 引擎驱动练习。
 *
 * 设计要点：
 *  - 兼容任意 OpenAI Chat Completions 格式的服务（OpenAI / DeepSeek / Kimi /
 *    Moonshot / 通义千问 Qwen / 智谱 GLM / 自建兼容服务等）。
 *  - API Key 仅保存在本机 localStorage，发给所配置的服务商；不上传任何第三方。
 *  - 解析容错：自动剥离 ```json 代码围栏，截取首/尾大括号；缺失字段用默认值补齐，
 *    保证即使模型输出略有偏差，仍可渲染、仍可练习。
 *  - 隐私：建议生产环境把 Key 放后端代理；本客户端方案适合自用 / 教学演示。
 * ========================================================================= */
(function (global) {
  'use strict';

  /* 常用供应商预设（base 为 Chat Completions 的目录前缀） */
  const PROVIDERS = {
    openai:   { label: 'OpenAI',          base: 'https://api.openai.com/v1',           model: 'gpt-4o-mini' },
    deepseek: { label: 'DeepSeek',        base: 'https://api.deepseek.com/v1',         model: 'deepseek-chat' },
    moonshot: { label: 'Kimi (Moonshot)', base: 'https://api.moonshot.cn/v1',         model: 'moonshot-v1-8k' },
    qwen:     { label: '通义千问 Qwen',    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    zhipu:    { label: '智谱 GLM',        base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    custom:   { label: '自定义 / 兼容服务', base: '', model: '' },
  };

  const STORE_KEY = 'estalk_llm_settings';

  function def(v, d) { return (v === undefined || v === null || v === '') ? d : v; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* 读取设置（容错：localStorage 不可用时退回到默认值） */
  function loadSettings() {
    const base = { provider: 'deepseek', base: '', apiKey: '', model: '', temperature: 0.8 };
    try {
      const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORE_KEY) : null;
      if (!raw) return base;
      return Object.assign(base, JSON.parse(raw));
    } catch (e) { return base; }
  }

  function saveSettings(s) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
    catch (e) { /* 隐私模式或只读，忽略 */ }
  }

  /* 角色系统提示：强制输出严格 JSON，schema 与离线情景完全一致 */
  const SYSTEM_PROMPT = `You are an expert author of spoken-English scenario packages for Chinese primary-school EFL learners (Grades 3–6).
Produce a SINGLE valid JSON object (no markdown fences, no commentary) that strictly follows this schema:
{
  "category": one of ["campus","interest","foodshop","travel","festival","family"],
  "title": "short Chinese title",
  "titleEn": "English title",
  "func": "one communication function in Chinese, e.g. 询问信息",
  "level": "S1..S5",
  "grades": "e.g. 小学五、六年级",
  "textbook": "textbook alignment note",
  "duration": "e.g. 15分钟",
  "outcome": "what learners achieve",
  "slots": { "nameA":"NameA","nameB":"NameB","act":"an activity phrase" },
  "core": [ { "func":"功能","expr":"English sentence, may use {nameA}{nameB}{act}","slots":"词槽说明","zh":"中文提示" } x4 ],
  "setting": { "place":"","task":"","constraints":"","done":"" },
  "roles": { "A":{ "name":"","youAre":"","youKnow":"","youNeed":"","yourGoal":"","cannot":"","endWith":"" }, "B":{ "...":"" } },
  "demo": [ { "who":"A|B","en":"","zh":"" } x4 ],
  "tasks": { "basic":"","standard":"","challenge":"" },
  "followup": { "ask":"","agree":"","disagree":"","clarify":"" },
  "stuck": ["","","",""],
  "teacherCard": { "says":"","do":"","monitor":"","correct":"","success":"" },
  "solo": ["","",""],
  "rubric": [ { "dim":"","ok":"","need":"" } x4 ],
  "transfer": ["",""],
  "partner": {
     "appRole":"B",
     "appFacts":[ { "triggers":["lowercase keyword a student message may contain"], "say":"English reply", "zh":"中文" } x3 ],
     "appQuestions":[ { "ask":"English question", "zh":"中文" } x3 ],
     "clarify":[ { "triggers":["again","repeat","pardon"], "say":"English", "zh":"中文" } x2 ],
     "agree":"English agreement",
     "disagree":"English refusal",
     "decide":"English final decision"
  }
}
Rules:
- Age-appropriate for Chinese kids grades 3–6. Information-gap: the student MUST ask to obtain facts. Roles have DIFFERENT goals/constraints.
- partner.appRole must be "B". partner.appFacts triggers must be lowercase English keywords the student's message might contain (e.g. ["homework","math","due"]). partner.appQuestions drive the conversation order.
- No private/personal info (no real names, addresses, school names, contact info, income).
- Use {nameA}{nameB}{act} placeholders where natural. Return ONLY the JSON.
- CRITICAL: If the user message contains a "年级约束" (grade constraint) block, that block OVERRIDES everything else. You MUST respect its sentence-length limit, vocabulary scope, allowed "level" values, banned items, and the Chinese scaffolding ratio. Never exceed them.`;

  /* 年级约束段：把该年级的语言上限写死，模型必须服从 */
  function gradeRules(gid) {
    const G = (global.GRADES || {})[gid];
    if (!G) return '';
    const extra = gid === 'g3'
      ? '\n   - 三年级是英语起步年：示范对话不超过 4 轮，每句英文必须配中文，允许学生用指认、短答完成；不得出现任何需要书写拼写的长输出。'
      : '';
    return ` 年级约束（最高优先级，必须严格遵守）：
   - 对象：${G.zh}（${G.age}），${G.start}
   - 语言上限：${G.sentence}；生词 ${G.newWords}；互动 ${G.rounds}
   - 难度等级只能取：${G.levels.join(' 或 ')}
   - 词汇范围：${G.vocab}
   - 优先使用句型：${(G.patterns || []).join(' / ')}
   - 严禁出现：${(G.avoid || []).join('、')}
   - 教材对应：${G.textbook}；建议话题：${(G.topics || []).join('、')}
   - 中文支架：${G.zhSupport}${extra}`;
  }

  function buildUserPrompt(opts) {
    let p = '请生成一份英语口语情景对话包。';
    if (opts.category && opts.category !== 'all') p += ' 类别：' + opts.category + '。';
    if (opts.func) p += ' 交际功能：' + opts.func + '。';
    if (opts.level) p += ' 难度等级：' + opts.level + '。';
    const gr = gradeRules(opts.grade);
    if (gr) p += '\n' + gr + '\n';
    if (opts.prompt && opts.prompt.trim()) p += ' 用户额外要求：' + opts.prompt.trim() + '。';
    p += ' 必须返回严格 JSON，不要任何解释文字。';
    return p;
  }

  /* 从模型返回的文本内容中稳健地抽取 JSON 对象 */
  function extractJSON(text) {
    if (!text) throw new Error('模型返回为空');
    text = String(text).trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s >= 0 && e > s) text = text.slice(s, e + 1);
    try { return JSON.parse(text); }
    catch (err) { throw new Error('JSON 解析失败：' + err.message); }
  }

  /* 把模型对象归一化为可渲染的场景对象（缺字段用默认补齐） */
  function normalize(o, opts) {
    if (!o || typeof o !== 'object') throw new Error('模型未返回有效对象');
    const sc = {
      id: 'llm_' + Date.now(),
      category: def(o.category, 'campus'),
      title: def(o.title, '大模型生成情景'),
      titleEn: def(o.titleEn, 'AI Scenario'),
      func: def(o.func, '描述与确认'),
      level: def(o.level, (opts && opts.level) ? opts.level : 'S3'),
      grades: def(o.grades, '小学四至六年级'),
      textbook: def(o.textbook, '通用 · 大模型生成'),
      duration: def(o.duration, '15分钟'),
      outcome: def(o.outcome, ''),
      slots: Object.assign({ nameA: 'Amy', nameB: 'Ben', act: 'practice English' }, o.slots || {}),
      core: (arr(o.core).length ? o.core : defaultCore()).map(c => ({
        func: def(c.func, '交流'), expr: def(c.expr, ''), slots: def(c.slots, ''), zh: def(c.zh, ''),
      })),
      setting: Object.assign({ place: '', task: '', constraints: '', done: '' }, o.setting || {}),
      roles: (o.roles && o.roles.A && o.roles.B) ? o.roles : defaultRoles(),
      demo: arr(o.demo).map(d => ({ who: def(d.who, 'A'), en: def(d.en, ''), zh: def(d.zh, '') })),
      tasks: Object.assign({ basic: '', standard: '', challenge: '' }, o.tasks || {}),
      followup: Object.assign({ ask: '', agree: '', disagree: '', clarify: '' }, o.followup || {}),
      stuck: arr(o.stuck),
      teacherCard: Object.assign({ says: '', do: '', monitor: '', correct: '', success: '' }, o.teacherCard || {}),
      solo: arr(o.solo),
      rubric: arr(o.rubric).map(r => ({ dim: def(r.dim, ''), ok: def(r.ok, ''), need: def(r.need, '') })),
      transfer: arr(o.transfer),
      partner: normalizePartner(o.partner),
      generated: true,
      fromLLM: true,
    };

    /* 年级约束回填：模型若不听话，这里兜底钳制 */
    const gid = opts && opts.grade;
    const G = gid ? (global.GRADES || {})[gid] : null;
    if (G) {
      sc.grade = gid;
      sc.grades = G.zh;
      if (G.levels.indexOf(sc.level) < 0) sc.level = G.defaultLevel;
      if (!sc.textbook || sc.textbook === '通用 · 大模型生成') sc.textbook = G.textbook;
      // 三年级追加语言上限到约束里，供老师/家长核对
      if (gid === 'g3') {
        sc.setting.constraints += `；【三年级语言约束】${G.sentence}，生词${G.newWords}，${G.rounds}。`;
      }
    }
    return sc;
  }

  function normalizePartner(p) {
    if (!p || typeof p !== 'object') p = {};
    return {
      appRole: def(p.appRole, 'B'),
      appFacts: arr(p.appFacts).map(f => ({
        triggers: Array.isArray(f.triggers) ? f.triggers : (f.triggers ? [f.triggers] : []),
        say: def(f.say, ''),
        zh: def(f.zh, ''),
      })),
      appQuestions: arr(p.appQuestions).map(q => ({ ask: def(q.ask, ''), zh: def(q.zh, '') })),
      clarify: arr(p.clarify).map(c => ({
        triggers: Array.isArray(c.triggers) ? c.triggers : [],
        say: def(c.say, ''),
        zh: def(c.zh, ''),
      })),
      agree: def(p.agree, 'That works!'),
      disagree: def(p.disagree, "Sorry, I can't."),
      decide: def(p.decide, "Great, we have a plan!"),
    };
  }

  function defaultCore() {
    return [
      { func: '开始', expr: 'Hello!', slots: '', zh: '你好！' },
      { func: '交流', expr: 'I want to ___', slots: '内容', zh: '我想___' },
      { func: '提问', expr: 'What do you ___?', slots: '', zh: '你___什么？' },
      { func: '结束', expr: 'OK, great!', slots: '', zh: '好的！' },
    ];
  }
  function defaultRoles() {
    return {
      A: { name: 'A（学生）', youAre: '', youKnow: '', youNeed: '', yourGoal: '', cannot: '', endWith: '' },
      B: { name: 'B（应用）', youAre: '', youKnow: '', youNeed: '', yourGoal: '', cannot: '', endWith: '' },
    };
  }

  /* 主入口：根据设置调用大模型，返回 Promise<场景对象> */
  async function generate(opts) {
    const s = loadSettings();
    if (!s.apiKey) { const e = new Error('未配置 API Key'); e.code = 'NO_KEY'; throw e; }
    let base = (s.base && s.base.trim()) ? s.base.trim().replace(/\/+$/, '') : (PROVIDERS[s.provider] && PROVIDERS[s.provider].base);
    if (!base) { const e = new Error('未配置接口地址（Base URL）'); e.code = 'NO_BASE'; throw e; }
    let model = (s.model && s.model.trim()) ? s.model.trim() : (PROVIDERS[s.provider] && PROVIDERS[s.provider].model);
    if (!model) { const e = new Error('未配置模型名称'); e.code = 'NO_MODEL'; throw e; }

    const temperature = (typeof s.temperature === 'number') ? s.temperature : 0.8;
    const body = {
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(opts || {}) },
      ],
      temperature: temperature,
    };

    let resp;
    try {
      resp = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey },
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      const e = new Error('网络请求失败（检查网络/CORS/接口地址）：' + (netErr && netErr.message ? netErr.message : netErr));
      e.code = 'NETWORK';
      throw e;
    }

    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try { const j = await resp.json(); if (j && j.error && j.error.message) msg += ' ' + j.error.message; } catch (_) {}
      const e = new Error(msg);
      e.code = 'HTTP_' + resp.status;
      throw e;
    }

    const data = await resp.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const obj = extractJSON(content);
    return normalize(obj, opts);
  }

  global.LLM = { PROVIDERS, loadSettings, saveSettings, generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LLM;
})(typeof window !== 'undefined' ? window : globalThis);
