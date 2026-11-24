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
  const scene = {
    circus:{geometry:window.circusGeometry,title:'Eye building',yaw:3.49,pitch:.22},
    arkaden:{geometry:window.arkadenGeometry,title:'Arkaden',yaw:.43,pitch:.72}
  }[media.dataset.project];
  const hotelScenes = {
    window: {title:'Window', yaw:.24, pitch:.13},
    owner: {title:'Hotel owner', yaw:.12, pitch:.055},
    visitor: {title:'Visitor', yaw:.12, pitch:.055}
  };
  const pendingScripts = new Map();
  const choices = media.querySelectorAll('[data-model]');
  let selectedModel = choices[0]?.dataset.model;
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
    const selectedScene = hotelScenes[id];
    const loading = model.querySelector('[data-loading]');
    const error = model.querySelector('[data-load-error]');
    if (loading) loading.hidden = !selectedScene;
    if (error) error.hidden = true;
    try {
      const options = selectedScene ? {...selectedScene, geometry:await loadModel(id)} : scene;
      if (request !== token || model.hidden) return;
      dispose = window.mountPortfolioScene(host,document.documentElement.lang,options);
    } catch (cause) {
      if (request === token && error) error.hidden = false;
      console.error('Could not display the 3D model', cause);
    } finally {
      if (request === token && loading) loading.hidden = true;
    }
  }

  choices.forEach(button => button.addEventListener('click', () => {
    if (selectedModel === button.dataset.model) return;
    selectedModel = button.dataset.model;
    dispose?.();
    dispose = null;
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
    if (model) model.hidden=!showModel;
    if (mode!=='film' && player) {
      player.remove(); player=null; poster.hidden=false;
    }
    if (showModel && !dispose) mountSelected();
    if (!showModel) request++;
    media.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  }
  if (level) {
    const route = level.querySelector('#level-route');
    const stops = Array.from(route.querySelectorAll('.route-stop'));
    const position = route.querySelector('output');
    let currentStop = 0;

    function moveStop(step) {
      stops[currentStop].hidden = true;
      currentStop = (currentStop + step + stops.length) % stops.length;
      stops[currentStop].hidden = false;
      position.textContent = (currentStop + 1) + ' / ' + stops.length;
    }
    route.querySelectorAll('[data-route-step]').forEach(button => {
      button.addEventListener('click', () => moveStop(Number(button.dataset.routeStep)));
    });
    route.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      moveStop(event.key === 'ArrowLeft' ? -1 : 1);
    });
    const choices = level.querySelectorAll('[data-level-view]');
    choices.forEach(choice => choice.addEventListener('click', () => {
      choices.forEach(button => {
        const selected = button === choice;
        button.setAttribute('aria-pressed', String(selected));
        document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
      });
    }));
  }
  if (board) {
    const sheets = Array.from(board.querySelectorAll('.board-sheet'));
    const previous = board.querySelector('[data-board-step="-1"]');
    const next = board.querySelector('[data-board-step="1"]');
    const counter = board.querySelector('output');
    let current = 0;
    function move(step) {
      const index = Math.max(0,Math.min(sheets.length-1,current+step));
      sheets[current].hidden = true;
      sheets[index].hidden = false;
      current = index;
      counter.textContent = String(index+1).padStart(2,'0')+' / '+sheets.length;
      previous.disabled = index===0;
      next.disabled = index===sheets.length-1;
    }
    previous.addEventListener('click',()=>move(-1));
    next.addEventListener('click',()=>move(1));
    board.addEventListener('keydown',e=>{
      if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
      e.preventDefault(); move(e.key==='ArrowLeft' ? -1 : 1);
    });
  }
  poster?.addEventListener('click',play);
  media.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.mode)));
  if (model && (!film || location.hash==='#model-panel')) show('model');
})();
