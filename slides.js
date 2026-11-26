document.querySelectorAll('[data-slideshow]').forEach(sequence => {
  const slides = [...sequence.querySelectorAll('[data-slide]')];
  const controls = sequence.querySelector('.slide-controls');
  const previous = controls.querySelector('[data-slide-step="-1"]');
  const next = controls.querySelector('[data-slide-step="1"]');
  const counter = controls.querySelector('output');
  let current = 0;

  function show(index) {
    current = index >= slides.length ? 0 : Math.max(0, index);
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    const format = number => String(number).padStart(2, '0');
    counter.textContent = format(current + 1) + ' / ' + format(slides.length);
    const focused = document.activeElement;
    previous.disabled = current === 0;
    next.disabled = slides.length < 2;
    if (focused === previous && previous.disabled) next.focus({preventScroll:true});
  }

  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  sequence.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    show(current + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  show(0);
  sequence.classList.add('image-sequence');
  controls.hidden = false;
});
