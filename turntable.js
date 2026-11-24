(() => {
  const stage = document.querySelector('.turn-stage');
  const cards = Array.from(stage.querySelectorAll('.turn-card'));
  const count = cards.length;
  const details = document.querySelector('[data-turn-link]');
  const meta = document.querySelector('[data-turn-meta]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const descriptions = ['Cinematic · 3D / 2026', 'Environment · Unreal Engine / 2026'];
  let position = 0, target = 0, velocity = 0, frame = 0, lastTick = 0;
  let pointer = null, originX = 0, lastX = 0, lastTime = 0, dragged = false, blockClickUntil = 0;
  let selected = -1;
  const wrap = value => ((value % count) + count) % count;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function caption(index) {
    selected = index;
    const card = cards[index];
    details.replaceChildren(...Array.from(card.querySelector('span').childNodes, n => n.cloneNode(true)));
    details.href = card.href;
    meta.textContent = descriptions[index];
    cards.forEach((item, i) => item.tabIndex = i === index ? 0 : -1);
  }

  function draw() {
    const width = stage.clientWidth;
    cards.forEach((card, i) => {
      const angle = (i - position) * 2 * Math.PI / count;
      const depth = (1 + Math.cos(angle)) / 2;
      const x = (Math.sin(angle) * .35 + (count === 2 ? (1-depth) * .29 : 0)) * width;
      const y = (depth - .5) * Math.min(width * .075, 90);
      const scale = .63 + depth * .37;
      card.style.transform = 'translate(-50%,-50%) translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
      card.style.zIndex = Math.round(depth * 100);
      card.style.filter = 'brightness(' + (.55 + .45 * depth) + ')';
    });
    const nearest = wrap(Math.round(position));
    if (selected !== nearest) caption(nearest);
  }

  function tick(now) {
    const dt = Math.min((now - lastTick) / 1000, .04);
    lastTick = now;
    // Critically damped spring. Match the release velocity to the first settling frame.
    const distance = position - target;
    const rate = 10.5;
    const term = velocity + rate * distance;
    const decay = Math.exp(-rate * dt);
    position = target + (distance + term * dt) * decay;
    velocity = (velocity - rate * term * dt) * decay;
    if (Math.abs(target - position) < .001 && Math.abs(velocity) < .012) {
      position = target = wrap(target);
      velocity = frame = 0;
      draw();
      return;
    }
    draw();
    frame = requestAnimationFrame(tick);
  }
  function settle(value) {
    target = value;
    if (reduced.matches) {
      cancelAnimationFrame(frame);
      frame = velocity = 0;
      position = target = wrap(target);
      draw();
    } else if (!frame) {
      lastTick = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  stage.addEventListener('dragstart', e => e.preventDefault());
  stage.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || pointer !== null) return;
    pointer = e.pointerId;
    lastX = originX = e.clientX;
    lastTime = performance.now();
    dragged = false;
    cancelAnimationFrame(frame);
    frame = velocity = 0;
  });
  window.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    if (!dragged && Math.abs(e.clientX - originX) < 5) return;
    if (!dragged) {
      dragged = true;
      stage.setPointerCapture(pointer);
      stage.classList.add('dragging');
    }
    const now = performance.now();
    const delta = (lastX - e.clientX) / Math.max(110, stage.clientWidth * .36);
    const speed = delta * 1000 / Math.max(now - lastTime, 6);
    velocity = clamp(.55 * velocity + .45 * speed, -5, 5);
    position += delta;
    lastTime = now;
    lastX = e.clientX;
    draw();
  });
  function release(e) {
    if (e.pointerId !== pointer) return;
    if (stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
    pointer = null;
    stage.classList.remove('dragging');
    if (dragged) blockClickUntil = performance.now() + 280;
    if (performance.now() - lastTime > 100 || e.type === 'pointercancel') velocity = 0;
    settle(Math.round(position + velocity * .16));
  }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  stage.addEventListener('click', e => {
    const card = e.target.closest('[data-work]');
    if (!card) return;
    if (performance.now() < blockClickUntil && e.detail !== 0) { e.preventDefault(); return; }
    const index = cards.indexOf(card);
    if (index === selected) return;
    e.preventDefault();
    const base = Math.round(position);
    const diff = wrap(index - base);
    settle(base + (diff > count / 2 ? diff - count : diff));
  });
  function step(by) { settle((frame ? target : Math.round(position)) + by); }
  document.querySelectorAll('[data-step]').forEach(b =>
    b.addEventListener('click', () => step(Number(b.dataset.step))));
  document.querySelector('.collection').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    step(e.key === 'ArrowLeft' ? -1 : 1);
  });
  document.addEventListener('portfolio-language', () => caption(wrap(Math.round(position))));
  window.addEventListener('resize', draw);
  draw();
})();
