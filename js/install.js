// One app, one manifest, and one install experience across the game room.
let deferredPrompt;
const buttons = [...document.querySelectorAll('[data-install]')];
const standalone = matchMedia('(display-mode: standalone)');
const installed = () => standalone.matches || navigator.standalone === true;
const update = () => buttons.forEach(button => { button.hidden = installed(); });
const dialog = document.createElement('dialog');
dialog.className = 'install-dialog';
const title = document.createElement('h2'); title.textContent = 'Keep the game room handy';
const instructions = document.createElement('p');
const close = document.createElement('button'); close.textContent = 'Got it'; close.className = 'button button--primary';
close.onclick = () => dialog.close();
dialog.append(title, instructions, close); document.body.append(dialog);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredPrompt = event; update(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; buttons.forEach(button => { button.hidden = true; }); dialog.close(); });
standalone.addEventListener('change', update);
buttons.forEach(button => button.addEventListener('click', async () => {
  if (deferredPrompt) {
    const prompt = deferredPrompt; deferredPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; } catch { showInstructions(); }
  } else showInstructions();
}));
function showInstructions() {
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  instructions.textContent = appleMobile
    ? 'Open this site in Safari, tap Share, then Add to Home Screen. One icon opens the game room with both Trumps and Dominoes.'
    : 'Open your browser’s menu and choose Install app or Add to Home Screen. If that option is unavailable, try Chrome or Edge. One icon opens both games.';
  if (!dialog.open) dialog.showModal();
}
update();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
