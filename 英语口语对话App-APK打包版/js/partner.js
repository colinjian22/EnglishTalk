/* =========================================================================
 * partner.js — 离线 AI 角色对话引擎
 * 不依赖任何云端 API。基于情景 partner 字段中的角色事实 / 问题 / 澄清模板，
 * 用轻量意图识别驱动“信息差”式逐轮对话：学生问→应用答→应用追问→达成共识。
 * ========================================================================= */

(function (global) {
  'use strict';

  const QUESTION_WORDS = ['what', 'when', 'where', 'which', 'how', 'why', 'who', 'do you', 'are you', 'can you', 'is it', 'did you'];
  const AGREE_WORDS   = ['ok', 'okay', 'sure', 'deal', "let's", 'agree', 'yes', 'great', 'good', 'works', 'fine', 'love to'];
  const DISAGREE_WORDS= ['no', 'cannot', "can't", 'sorry', 'don\'t', 'wont', 'won\'t', 'not', 'busy', 'another'];
  const CLARIFY_WORDS = ['again', 'repeat', 'pardon', 'slow', 'what?', 'huh', '?', 'which one', 'what do you mean'];

  function norm(s) { return (s || '').toLowerCase().replace(/[?.,!]/g, ' ').trim(); }

  function hasAny(text, list) { return list.some(w => text.includes(w)); }

  class Partner {
    constructor(scenario) {
      this.sc = scenario;
      const p = scenario.partner || {};
      const slots = scenario.slots || {};
      // 预填充插槽
      this.appRole = p.appRole || 'B';
      this.facts = (p.appFacts || []).map(f => ({
        triggers: f.triggers, say: fillSlots(f.say, slots), zh: fillSlots(f.zh || '', slots),
      }));
      this.questions = (p.appQuestions || []).map(q => ({
        ask: fillSlots(q.ask, slots), zh: fillSlots(q.zh || '', slots),
      }));
      this.clarify = (p.clarify || []).map(c => ({
        triggers: c.triggers, say: fillSlots(c.say, slots), zh: fillSlots(c.zh || '', slots),
      }));
      this.tpl = {
        agree: fillSlots(p.agree || "That works! Let's do it.", slots),
        disagree: fillSlots(p.disagree || "Sorry, I can't. Let's try another way.", slots),
        decide: fillSlots(p.decide || "Great, we have a plan!", slots),
      };
      this.qIndex = 0;
      this.factUsed = new Set();
      this.done = false;
      this.turn = 0;
    }

    /* 开场：应用先发起 */
    start() {
      this.turn = 0;
      if (this.questions.length) {
        const q = this.questions[0];
        this.qIndex = 1;
        return { en: q.ask, zh: q.zh, suggest: '', suggestZh: '（你是' + this.otherRole() + '，请回应上面的提问）', done: false, opener: true };
      }
      return { en: this.tpl.agree, zh: '', suggest: '', suggestZh: '', done: false, opener: true };
    }

    otherRole() { return this.appRole === 'B' ? 'A' : 'B'; }

    /* 学生说了一句，返回应用的回应 */
    respond(userText) {
      this.turn++;
      const t = norm(userText);

      // 1) 澄清请求
      if (hasAny(t, CLARIFY_WORDS)) {
        const c = this.clarify.find(c => hasAny(t, c.triggers));
        if (c) return this.wrap(c.say, c.zh, this.askNext('（没听清，请再说一次或换种说法）'));
        // 通用澄清
        return this.wrap("Could you say that again, please?", "能再说一遍吗？", this.askNext('（请重复或换种说法）'));
      }

      // 2) 学生在提问 → 应用给出对应事实
      const isQuestion = t.includes('?') || hasAny(t, QUESTION_WORDS);
      if (isQuestion) {
        const fact = this.facts.find(f => !this.factUsed.has(this.facts.indexOf(f)) && hasAny(t, f.triggers));
        if (fact) {
          const idx = this.facts.indexOf(fact);
          this.factUsed.add(idx);
          return this.wrap(fact.say, fact.zh, this.askNext('（根据对方的回答，继续提问或做决定）'), idx);
        }
        // 没匹配到事实：礼貌回应并回到当前问题
        return this.wrap("Hmm, I'm not sure. " + (this.questions[Math.min(this.qIndex, this.questions.length - 1)]?.ask || this.tpl.agree),
          "嗯，我不太确定。/" + (this.questions[Math.min(this.qIndex, this.questions.length - 1)]?.zh || ''),
          this.askNext('（换种方式再问一次）'));
      }

      // 3) 学生表态：同意 / 决定
      if (hasAny(t, AGREE_WORDS)) {
        if (this.qIndex >= this.questions.length && this.factUsed.size > 0) {
          this.done = true;
          return this.wrap(this.tpl.decide, '（达成共识！）', '（任务完成 🎉 你可以点击“重新开始”换一题）', true);
        }
        return this.wrap(this.tpl.agree, '（同意）', this.askNext('（继续推进，或确认最终安排）'));
      }

      // 4) 学生拒绝 / 提条件
      if (hasAny(t, DISAGREE_WORDS)) {
        // 看看有没有能回应的“限制类”事实（如 sold out / busy / test）
        const fact = this.facts.find(f => !this.factUsed.has(this.facts.indexOf(f)) && /sold|busy|test|occup|river|wrong|can't|cant/.test(f.triggers.join(' ')));
        if (fact) {
          const idx = this.facts.indexOf(fact); this.factUsed.add(idx);
          return this.wrap(fact.say, fact.zh, this.askNext('（根据新情况调整你的方案）'));
        }
        return this.wrap(this.tpl.disagree, '（不同意/有难处）', this.askNext('（提出你的替代方案或理由）'));
      }

      // 5) 默认：鼓励并继续追问
      return this.wrap("OK. " + (this.questions[Math.min(this.qIndex, this.questions.length - 1)]?.ask || this.tpl.agree),
        "好的。/" + (this.questions[Math.min(this.qIndex, this.questions.length - 1)]?.zh || ''),
        this.askNext('（继续对话，试着提问或做决定）'));
    }

    /* 取出下一个要问的问题（若有），否则给决定提示 */
    askNext(fallbackZh) {
      if (this.qIndex < this.questions.length) {
        const q = this.questions[this.qIndex++];
        return { suggest: q.akHint || q.ask, suggestZh: q.zh, fallback: false };
      }
      return { suggest: this.tpl.decide, suggestZh: '（你们可以确认最终安排了）', fallback: true };
    }

    wrap(en, zh, next, done) {
      return {
        en: en,
        zh: zh,
        suggest: next ? next.suggest : '',
        suggestZh: next ? next.suggestZh : '',
        done: !!done || this.done,
      };
    }
  }

  global.Partner = Partner;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Partner };
})(typeof window !== 'undefined' ? window : globalThis);
