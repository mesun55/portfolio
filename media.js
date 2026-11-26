(() => {
  const media = document.querySelector('.project-media');
  if (!media) return;
  const film = media.querySelector('#film-panel');
  const model = media.querySelector('#model-panel');
  const slot = film?.querySelector('.film-slot');
  const poster = slot?.querySelector('button');
  const host = model?.querySelector('#viewer-host');
  const board = media.querySelector('#board-panel');
  const level = media.querySelector('#level-panel');
  let player, dispose;
  const scenes = {
    circus: {title:'Eye building', yaw:3.49, pitch:.22},
    window: {title:'Window', yaw:.24, pitch:.13},
    owner: {title:'Hotel owner', yaw:.12, pitch:.055},
    visitor: {title:'Visitor', yaw:.12, pitch:.055}
  };
  const pendingScripts = new Map();
  const choices = media.querySelectorAll('[data-model]');
  let selectedModel = choices[0]?.dataset.model || media.dataset.project;
  let ready = false;
  let request = 0;

  function loadModel(id) {
    const name = id + 'Geometry';
    if (window[name]) return Promise.resolve(window[name]);
    if (pendingScripts.has(id)) return pendingScripts.get(id);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/scene-' + id + '.js';
      script.onload = () => window[name] ? resolve(window[name]) : reject();
      script.onerror = reject;
      document.head.append(script);
    }).finally(() => pendingScripts.delete(id));
    pendingScripts.set(id, promise);
    return promise;
  }

  async function mountSelected() {
    const token = ++request;
    const id = selectedModel;
    const loading = model.querySelector('[data-loading]');
    const bar = loading.querySelector('progress');
    const error = model.querySelector('[data-load-error]');
    ready = false;
    dispose?.();
    dispose = null;
    loading.hidden = false;
    error.hidden = true;
    bar.removeAttribute('value');
    host.setAttribute('aria-busy','true');

    function finish(failed) {
      if (request !== token) return;
      loading.hidden = true;
      error.hidden = !failed;
      host.setAttribute('aria-busy','false');
      ready = !failed;
      if (failed) {
        dispose?.();
        dispose = null;
      }
    }
    try {
      // Paint the loading panel before parsing cached geometry on the main thread.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (request !== token) return;
      const geometry = await loadModel(id);
      if (request !== token) return;
      dispose = window.mountPortfolioScene(host,document.documentElement.lang,{
        ...scenes[id], geometry,
        onProgress(done,total) {
          if (request !== token || !total) return;
          bar.max = total + 1;
          bar.value = done;
        },
        onReady() { finish(false); },
        onError() { finish(true); }
      });
    } catch (cause) {
      finish(true);
      console.error('Could not display the 3D model', cause);
    }
  }

  choices.forEach(button => button.addEventListener('click', () => {
    if (selectedModel === button.dataset.model) return;
    selectedModel = button.dataset.model;
    choices.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
    model.querySelector('.model-credit').hidden = selectedModel !== 'window';
    mountSelected();
  }));
  model?.querySelector('[data-retry]')?.addEventListener('click', mountSelected);

  function play() {
    if (player) return;
    player=document.createElement('iframe');
    const url=new URL('https://player.vimeo.com/video/'+slot.dataset.video);
    url.searchParams.set('autoplay','1');
    url.searchParams.set('dnt','1');
    player.title=slot.dataset.title+' · Vimeo';
    player.allow='autoplay; fullscreen; picture-in-picture; encrypted-media';
    player.allowFullscreen=true;
    player.referrerPolicy='strict-origin-when-cross-origin';
    player.src=url.href;
    slot.append(player);
    poster.hidden=true;
    player.focus();
  }
  function show(mode) {
    const showModel=mode==='model';
    if (film) film.hidden=mode!=='film';
    if (board) board.hidden=mode!=='board';
    if (level) level.hidden=mode!=='level';
    const enteringModel = showModel && model?.hidden;
    if (model) model.hidden=!showModel;
    if (mode!=='film' && player) {
      player.remove(); player=null; poster.hidden=false;
    }
    if (showModel && !dispose && (enteringModel || !film)) mountSelected();
    if (!showModel && !ready) {
      request++;
      dispose?.();
      dispose = null;
    }
    media.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  }
  if (level) {
    const choices = level.querySelectorAll('[data-level-view]');
    choices.forEach(choice => choice.addEventListener('click', () => {
      choices.forEach(button => {
        const selected = button === choice;
        button.setAttribute('aria-pressed', String(selected));
        document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
      });
    }));
  }
  poster?.addEventListener('click',play);
  media.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.mode)));
  if (model && (!film || location.hash==='#model-panel')) show('model');
})();
