// Glass-morphism 三選一卡牌
// 暫停遊戲 → show → 等使用者點/按 1-3 → resolve callback

export class PerkUI {
  constructor() {
    this.overlay = document.getElementById('perk-overlay');
    this.cardsEl = document.getElementById('perk-cards');
    this.levelEl = document.getElementById('perk-level');
    this.activePerksEl = document.getElementById('active-perks');
    this._choices = null;
    this._resolve = null;

    window.addEventListener('keydown', (e) => {
      if (!this._resolve) return;
      if (e.code === 'Digit1' || e.code === 'Numpad1') { e.preventDefault(); this._pick(0); }
      else if (e.code === 'Digit2' || e.code === 'Numpad2') { e.preventDefault(); this._pick(1); }
      else if (e.code === 'Digit3' || e.code === 'Numpad3') { e.preventDefault(); this._pick(2); }
    });
  }

  show(level, choices, onPick) {
    if (choices.length === 0) {
      onPick(null);
      return;
    }
    this.levelEl.textContent = level;
    this.cardsEl.innerHTML = '';
    this._choices = choices;
    this._resolve = onPick;

    choices.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = `perk-card rarity-${p.rarity}`;
      card.innerHTML = `
        <div class="perk-rarity-tag">${p.rarity.toUpperCase()}</div>
        <div class="perk-icon">${p.icon}</div>
        <div class="perk-name">${p.nameCn}</div>
        <div class="perk-name-en">${p.name}</div>
        <div class="perk-desc">${p.desc}</div>
        <div class="perk-hotkey">${i + 1}</div>
      `;
      card.addEventListener('click', () => this._pick(i));
      this.cardsEl.appendChild(card);
    });

    this.overlay.classList.add('show');
  }

  _pick(idx) {
    if (!this._resolve || !this._choices[idx]) return;
    const chosen = this._choices[idx];
    const cb = this._resolve;
    this._resolve = null;
    this.overlay.classList.remove('show');
    // 給 CSS transition 一點時間
    setTimeout(() => cb(chosen), 80);
  }

  renderActiveList(takenIds, PERKS) {
    if (!this.activePerksEl) return;
    // 將相同 perk 計次
    const counts = new Map();
    for (const id of takenIds) counts.set(id, (counts.get(id) || 0) + 1);
    this.activePerksEl.innerHTML = '';
    for (const [id, c] of counts) {
      const p = PERKS[id];
      const el = document.createElement('div');
      el.className = `active-perk rarity-${p.rarity}`;
      el.title = `${p.nameCn} — ${p.desc}` + (c > 1 ? ` (×${c})` : '');
      el.innerHTML = p.icon + (c > 1 ? `<span class="stack">${c}</span>` : '');
      this.activePerksEl.appendChild(el);
    }
  }
}
