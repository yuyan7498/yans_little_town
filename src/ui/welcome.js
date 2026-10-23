// The welcome card as a controller. index.html holds the markup (it is also the loading
// screen); this drives it: progress text while the town loads, the 進入小鎮 button once the
// town is ready (and the little town on the card has had a moment to finish building).
const MIN_SHOW_MS = 2600;   // let the build animation play before the button appears

export function createWelcome({ root = document.getElementById('welcome') } = {}) {
  const born = performance.now();
  const status = root.querySelector('#welcome-status');
  const bar = root.querySelector('.welcome-progress span');
  const button = root.querySelector('#welcome-enter');
  let onEnter = null, isReady = false, entered = false, readyTimer = 0;

  const click = () => {
    if (!isReady || entered) return;
    entered = true;
    root.classList.add('is-leaving');
    document.documentElement.dataset.entered = '';
    button.disabled = true;
    setTimeout(() => root.remove(), 1100);
    if (onEnter) onEnter();
  };
  button.addEventListener('click', click);

  return {
    root,
    get entered() { return entered; },
    // Called when the player enters the town.
    onEnter(fn) { onEnter = fn; },
    progress(text, share = null) {
      if (text) status.textContent = text;
      if (share !== null) { bar.style.animation = 'none'; bar.style.width = Math.round(share * 100) + '%'; bar.style.transform = 'none'; }
    },
    ready() {
      clearTimeout(readyTimer);
      const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - born));
      readyTimer = setTimeout(() => {
        isReady = true;
        status.textContent = '小鎮建好了';
        root.classList.add('is-ready');
        button.disabled = false;
        button.focus({ preventScroll: true });
      }, wait);
    },
    error(message) {
      root.classList.add('is-error');
      status.textContent = message || '小鎮載入失敗，請重新整理再試一次。';
    },
    click,
    // For tests and the dev harness: enter at once.
    skip() { isReady = true; click(); },
    dispose() { clearTimeout(readyTimer); button.removeEventListener('click', click); }
  };
}
