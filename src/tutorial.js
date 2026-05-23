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
      tether: { text: '英雄與水晶間有靈魂繫帶 — 連著時會緩慢回血；被 boss 切斷則停回血。', life: 10 },
      kill: { text: '殺敵會掉靈魂，沿繫帶回流治療水晶。離得近，靈魂回流快。', life: 8 },
      levelup: { text: '升級可選擇 1 個天賦，永久強化本局。傳奇 (橘色) 卡片最強。', life: null },
      slinger: { text: '紅色亮起的是遠程怪 — 子彈會射水晶。衝出去清掉！', life: 9 },
      splitter: { text: '橘紅多面體會高速衝水晶，死亡 / 撞水晶時拋 3 顆引信炸彈，1.2 秒後爆 — 同時打你和水晶。優先點掉它們！', life: 11 },
      lancer: { text: '突刺兵：靠近後紅線預警 0.6 秒 → 直線衝刺 12 單位。看到紅線就 Dash 閃側邊！', life: 10 },
      wraith: { text: '鬼影：平時慢漂，每 2.8 秒會「閃」（紫光預警）後朝你瞬移。隨時保持移動。', life: 10 },
      mites: { text: '小蟲群：高速、低 HP，撞到只是輕推 — 但會干擾你打輸出。一發脈衝就能清。', life: 9 },
      conduit: { text: '導體：水藍色光環怪，活著時讓全場敵人 +25% 速度。優先擊破，不然怪潮會變猛。', life: 10 },
      sentinel: { text: '哨衛：超慢但 480 HP 硬如石頭。Dash 撞它能咬下 45 HP，搭配脈衝。不打掉就是撞水晶 55 傷害。', life: 11 },
      mire: { text: '沼澤怪：走過會掉減速地帶，踩進去你會被 -40% 速度。看到深綠色地板就繞開！', life: 10 },
      bossWarning: { text: '⚠ Ohm 接近中…紅色預警光束會打你；50% 血開始順移壓繫帶；20% 血狂暴衝水晶自爆！', life: 9 },
      boss: { text: 'Ohm 規則：永遠在水晶外圈軌道追你（站內圈或站樁 → 光束方向會穿過水晶連你帶水晶一起打）｜壓繫帶傷水晶+傷你+鎖回血 3s｜紅光束 0.4s 預警（要閃）｜50% 開始順移、20% 自爆衝水晶。', life: 14 },
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
