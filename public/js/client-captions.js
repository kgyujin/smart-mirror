// 자막 관리 시스템
let ephemeralEl = null;

const addCaption = (role, text, { ephemeral=false, autohideMs=null }={}) => {
  if (ephemeral) {
    if (!ephemeralEl) {
      ephemeralEl = document.createElement('div');
      ephemeralEl.className = `caption ${role} ephemeral`;
      ephemeralEl.innerHTML = `<div class="role">${role === 'user' ? '나' : '미러'}</div><div class="text"></div>`;
      $('captions').appendChild(ephemeralEl);
    }
    ephemeralEl.querySelector('.text').textContent = text;
    return;
  }
  if (ephemeralEl) { ephemeralEl.remove(); ephemeralEl = null; }
  const el = document.createElement('div');
  el.className = `caption ${role}`;
  el.innerHTML = `<div class="role">${role === 'user' ? '나' : '미러'}</div><div class="text">${text}</div>`;
  $('captions').appendChild(el);
  // keep last ~8 captions
  const nodes = $('captions').querySelectorAll('.caption');
  if (nodes.length > 8) nodes[0].remove();
  if (autohideMs && Number.isFinite(autohideMs)) {
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, autohideMs);
  }
  // 클릭 시 즉시 페이드아웃
  el.addEventListener('click', () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); });
};
