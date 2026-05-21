// 第一局教學系統 — 觸發式 toast
// 只在 meta.runs === 0 時啟用

export class Tutorial {
  constructor(enabled) {
    this.enabled = enabled;
    this.shown = new Set();
    this.currentStep = null;
    this.currentLifeRemaining = 0;        // P8: 用遊戲時間計時，pause 期間不會走

    this.toastEl = document.getElementById('tutorial-toast');
    this.toastTextEl = document.getElementById('tutorial-text');

    this.steps = {
      start: { text: 'WASD 移動，Space 衝刺。撞到怪會扣自己血量（繫帶連著時慢回血）；水晶或英雄任一血量歸零都算結束。', life: 11 },
      tether: { text: '英雄離水晶越遠，繫帶倍率越高（傷害 ↑、水晶受傷也 ↑）。看 HUD 的「繫帶」數值。', life: 10 },
      kill: { text: '殺敵會掉靈魂，沿繫帶回流治療水晶。離得近，靈魂回流快。', life: 8 },
      levelup: { text: '升級可選擇 1 個天賦，永久強化本局。傳奇 (橘色) 卡片最強。', life: null },
      slinger: { text: '紅色亮起的是遠程怪 — 子彈會射水晶。衝出去清掉！', life: 9 },
      splitter: { text: '大怪死亡會分裂成 3 隻小蟲，小蟲只追英雄，撞到會把你推回水晶。', life: 10 },
      bossWarning: { text: '⚠ Ohm 接近中…紅色預警光束會打你；50% 血開始順移壓繫帶；20% 血狂暴衝水晶自爆！', life: 9 },
      boss: { text: 'Ohm 規則：紅光束 0.4s 預警再射（要閃）｜壓繫帶持續傷水晶+鎖你回血 3s｜看到 ghost 1s 內走位避開順移點｜逼到 20% 血會自爆衝水晶。', life: 13 },
      save: { text: '新手庇護啟動！水晶免於崩裂一次。下次就沒這待遇了。', life: 7 },
    };
  }

  /** 觸發某步驟（如果已顯示過就跳過） */
  trigger(stepId) {
    if (!this.enabled) return;
    if (this.shown.has(stepId)) return;
    const step = this.steps[stepId];
    if (!step) return;
    this.shown.add(stepId);
    this._show(step);
  }

  /** 強制顯示一則訊息（不受 enabled 限制） */
  showCustom(text, life = 7) {
    this._show({ text, life });
  }

  /** 主動關閉當前 toast（例：升級選完天賦後） */
  dismissIf(stepId) {
    if (this.currentStep && this.currentStep === this.steps[stepId]) {
      this._hide();
    }
  }

  _show(step) {
    if (!this.toastEl) return;
    this.currentStep = step;
    this.toastTextEl.textContent = step.text;
    this.toastEl.classList.add('show');
    // P8: 用遊戲時間倒數，pause 期間不會自動消失
    this.currentLifeRemaining = (step.life !== null && step.life > 0) ? step.life : Infinity;
  }

  _hide() {
    if (!this.toastEl) return;
    this.toastEl.classList.remove('show');
    this.currentStep = null;
    this.currentLifeRemaining = 0;
  }

  /** P8: 由 game loop 每幀餵 rawDt（paused 時不會被呼叫） */
  tick(rawDt) {
    if (!this.currentStep) return;
    if (this.currentLifeRemaining === Infinity) return;
    this.currentLifeRemaining -= rawDt;
    if (this.currentLifeRemaining <= 0) this._hide();
  }
}
