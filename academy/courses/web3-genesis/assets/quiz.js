/**
 * Daskibo Academy — Web3 Genesis: quiz.js
 *
 * Self-check quiz block. Each lesson embeds:
 *
 *   <section class="lesson-quiz" data-lesson="01">
 *     <script type="application/json" class="quiz-data">
 *     {
 *       "title": "Самопроверка · Lesson 01",
 *       "questions": [
 *         {
 *           "q": "Что такое seed-фраза?",
 *           "kind": "multiple",        // multiple | open | task
 *           "options": ["…", "…", "…"],
 *           "answerIndex": 1,
 *           "explain": "Пояснение…"
 *         },
 *         { "q": "Объясните…", "kind": "open", "answer": "Эталонный ответ…" },
 *         { "q": "Задача…",    "kind": "task", "answer": "Решение / критерий проверки" }
 *       ]
 *     }
 *     </script>
 *   </section>
 *
 * Особенности:
 *   • Никаких сетевых вызовов, никаких зависимостей — чистый ESM.
 *   • Для multiple-выбора подсветка верного / неверного варианта.
 *   • Для open / task ответ скрыт за «Показать эталонный ответ».
 *   • Прогресс хранится в localStorage по ключу `quiz:<lesson>` — повторное
 *     открытие урока сохраняет «правильно отвеченные» вопросы.
 *   • Никакого внешнего сервера: всё для самоконтроля.
 */

const STORAGE_PREFIX = 'web3-genesis:quiz:';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function loadProgress(lesson) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + lesson) || '{}');
  } catch { return {}; }
}
function saveProgress(lesson, data) {
  try { localStorage.setItem(STORAGE_PREFIX + lesson, JSON.stringify(data)); } catch {}
}

function renderQuestion(host, q, index, lesson, progress, onProgress) {
  const card = el('div', { class: 'quiz-card', 'data-kind': q.kind || 'multiple' });
  const head = el('div', { class: 'quiz-head' }, [
    el('span', { class: 'quiz-num', text: '№ ' + (index + 1) }),
    el('span', { class: 'quiz-kind', text: ({
      multiple: 'один правильный ответ',
      open:     'открытый вопрос',
      task:     'практическая задача',
    })[q.kind || 'multiple'] }),
  ]);
  card.appendChild(head);
  card.appendChild(el('p', { class: 'quiz-q', html: q.q }));

  if (q.kind === 'multiple') {
    const list = el('ul', { class: 'quiz-options' });
    const status = el('p', { class: 'quiz-status' });
    q.options.forEach((opt, i) => {
      const li = el('li', { class: 'quiz-option' });
      const btn = el('button', { type: 'button', class: 'quiz-opt-btn', text: opt });
      btn.addEventListener('click', () => {
        list.querySelectorAll('.quiz-opt-btn').forEach((b) => {
          b.classList.remove('correct', 'wrong');
          b.disabled = true;
        });
        if (i === q.answerIndex) {
          btn.classList.add('correct');
          status.textContent = '✓ Верно. ' + (q.explain || '');
          status.className = 'quiz-status ok';
          progress[index] = 'correct';
        } else {
          btn.classList.add('wrong');
          list.querySelectorAll('.quiz-opt-btn')[q.answerIndex].classList.add('correct');
          status.textContent = '✗ Не совсем. ' + (q.explain || 'Сравните с подсвеченным верным вариантом.');
          status.className = 'quiz-status err';
          progress[index] = 'wrong';
        }
        saveProgress(lesson, progress);
        onProgress();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    card.appendChild(list);
    card.appendChild(status);
    if (progress[index] === 'correct') {
      const btns = list.querySelectorAll('.quiz-opt-btn');
      btns.forEach((b, i) => { b.disabled = true; if (i === q.answerIndex) b.classList.add('correct'); });
      status.textContent = '✓ Зачтено ранее.';
      status.className = 'quiz-status ok';
    }
  } else {
    // open / task
    const reveal = el('details', { class: 'quiz-reveal' });
    reveal.appendChild(el('summary', { text: q.kind === 'task'
      ? 'Показать эталонное решение' : 'Показать эталонный ответ' }));
    reveal.appendChild(el('div', { class: 'quiz-answer', html: q.answer || '—' }));
    card.appendChild(reveal);
    const mark = el('button', { class: 'btn btn-ghost quiz-mark', type: 'button',
      text: progress[index] === 'done' ? '✓ отмечено как пройденное' : 'Отметить как пройденное' });
    if (progress[index] === 'done') mark.classList.add('done');
    mark.addEventListener('click', () => {
      progress[index] = progress[index] === 'done' ? null : 'done';
      mark.textContent = progress[index] === 'done'
        ? '✓ отмечено как пройденное' : 'Отметить как пройденное';
      mark.classList.toggle('done', progress[index] === 'done');
      saveProgress(lesson, progress);
      onProgress();
    });
    card.appendChild(mark);
  }
  host.appendChild(card);
}

function mount(host) {
  const lesson = host.dataset.lesson || host.dataset.id || 'default';
  const dataScript = host.querySelector('script.quiz-data, script[type="application/json"]');
  if (!dataScript) {
    host.appendChild(el('p', { text: 'Quiz config not found' }));
    return;
  }
  let cfg;
  try { cfg = JSON.parse(dataScript.textContent); }
  catch (err) {
    host.appendChild(el('p', { text: 'Quiz parse error: ' + err.message }));
    return;
  }
  const progress = loadProgress(lesson);

  // wrapper
  host.innerHTML = '';
  const wrap = el('div', { class: 'quiz' });
  const header = el('div', { class: 'quiz-header' });
  const total = cfg.questions.length;
  const summary = el('div', { class: 'quiz-summary' });
  function updateSummary() {
    const done = cfg.questions.reduce((acc, _, i) => {
      const s = progress[i];
      return acc + (s === 'correct' || s === 'done' ? 1 : 0);
    }, 0);
    summary.textContent = `${done} / ${total} зачтено`;
    summary.className = 'quiz-summary' + (done === total ? ' ok' : '');
  }
  header.appendChild(el('h3', { class: 'quiz-title', text: cfg.title || 'Самопроверка' }));
  header.appendChild(summary);
  wrap.appendChild(header);

  if (cfg.intro) wrap.appendChild(el('p', { class: 'quiz-intro', html: cfg.intro }));

  const list = el('div', { class: 'quiz-list' });
  cfg.questions.forEach((q, i) =>
    renderQuestion(list, q, i, lesson, progress, updateSummary));
  wrap.appendChild(list);

  const reset = el('button', { class: 'btn btn-ghost quiz-reset', type: 'button', text: 'Сбросить прогресс' });
  reset.addEventListener('click', () => {
    if (!confirm('Сбросить отметки самопроверки для этого урока?')) return;
    saveProgress(lesson, {});
    location.reload();
  });
  wrap.appendChild(reset);

  host.appendChild(wrap);
  updateSummary();
}

export function mountAll(root = document) {
  for (const host of root.querySelectorAll('.lesson-quiz')) mount(host);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountAll());
  } else {
    mountAll();
  }
}

export { loadProgress, saveProgress };
