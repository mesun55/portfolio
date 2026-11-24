(() => {
  const diary = document.querySelector('.diary');
  const slides = [...diary.querySelectorAll('.diary-slide')];
  const count = diary.querySelector('.diary-count');
  let current = 0;

  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    count.textContent = (current + 1) + ' / ' + slides.length;
  }

  diary.querySelectorAll('[data-step]').forEach(button => {
    button.addEventListener('click', () => show(current + Number(button.dataset.step)));
  });
  diary.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    show(current + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  show(0);
  diary.querySelector('.diary-controls').hidden = false;
})();
