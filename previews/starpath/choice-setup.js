(() => {
  const setup = document.getElementById('gameSetup');
  const jlpt = setup.querySelector('#gameJlpt .quiz-levels');
  const grades = setup.querySelector('#gameGrade .quiz-levels');
  const jlptValue = setup.querySelector('#choiceJlptValue');
  const gradeValue = setup.querySelector('#choiceGradeValue');
  const range = setup.querySelector('#choiceRangeSummary');
  const error = document.getElementById('gameSetupError');
  let lastPicker = null;

  function gradeName(value) {
    return value.replace(/^중학\s*(\d+)$/, '중학교 $1학년')
      .replace(/^고교\s*(\d+)$/, '고등학교 $1학년');
  }

  function updateRange() {
    const level = jlpt.querySelector('input:checked').value;
    const grade = gradeName(grades.querySelector('input:checked').value);
    jlptValue.textContent = level.replace(/^JLPT\s+/, '') || '전체 등급';
    gradeValue.textContent = grade || '전체 학년';
    range.textContent = [level, grade].filter(Boolean).join(' · ') || '전체 한자';
  }

  function formatLevels() {
    for (const input of jlpt.querySelectorAll('input[value^="JLPT "]')) {
      input.nextElementSibling.textContent = input.value.slice(5);
    }
    const schools = new Map();
    for (const label of grades.querySelectorAll(':scope > .quiz-level')) {
      const input = label.querySelector('input');
      const name = gradeName(input.value);
      const parts = name.match(/^(초등학교|중학교|고등학교)\s*(\d+학년)$/);
      if (!parts) continue;
      const [, school, year] = parts;
      if (!schools.has(school)) {
        const row = document.createElement('div');
        row.className = 'choice-school';
        const heading = document.createElement('span');
        heading.textContent = school;
        const years = document.createElement('div');
        years.className = 'choice-years';
        row.append(heading, years);
        grades.insertBefore(row, label);
        schools.set(school, years);
      }
      input.setAttribute('aria-label', name);
      label.querySelector('span').textContent = year;
      schools.get(school).append(label);
    }
    updateRange();
  }

  // The study app fills these native radio groups after the kanji data arrives.
  const levels = new MutationObserver(formatLevels);
  levels.observe(jlpt, { childList: true });
  levels.observe(grades, { childList: true });
  formatLevels();
  window.addEventListener('pageshow', updateRange);
  setup.addEventListener('change', event => {
    if (!event.target.matches('.choice-picker input[type="radio"]')) return;
    lastPicker = event.target.closest('details');
    updateRange();
    error.hidden = true;
  });

  function closePicker(picker) {
    picker.open = false;
    picker.querySelector('summary').focus({ preventScroll: true });
  }
  setup.addEventListener('click', event => {
    if (event.detail > 0 && event.target.matches('.choice-picker input[type="radio"]')) {
      closePicker(event.target.closest('details'));
    }
  });
  setup.addEventListener('keydown', event => {
    const picker = event.target.closest('.choice-picker[open]');
    if (!picker) return;
    if (event.key === 'Escape' || (event.key === 'Enter' && event.target.matches('input[type="radio"]'))) {
      event.preventDefault();
      closePicker(picker);
    }
  });

  // An insufficient pool can be corrected from either filter.
  new MutationObserver(() => {
    if (error.hidden) return;
    const picker = lastPicker || grades.closest('details');
    picker.open = true;
    picker.querySelector('input:checked').focus();
  }).observe(error, { attributes: true, attributeFilter: ['hidden'] });
})();
