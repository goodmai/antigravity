// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { mountAll, loadProgress, saveProgress } from '../academy/courses/web3-genesis/assets/quiz.js';

const fixture = {
  title: 'Test quiz',
  questions: [
    {
      q: 'Что хранит MetaMask?',
      kind: 'multiple',
      options: ['токены', 'ключи', 'state', 'NFT'],
      answerIndex: 1,
      explain: 'Только seed и зашифрованные ключи.',
    },
    {
      q: 'Объясните EIP-155',
      kind: 'open',
      answer: 'chainId в подписи',
    },
    {
      q: 'Задача: проверьте chainId',
      kind: 'task',
      answer: 'cast chain-id',
    },
  ],
};

function mountFixture(lesson = 'test') {
  document.body.innerHTML = `
    <section class="lesson-quiz" data-lesson="${lesson}">
      <script type="application/json" class="quiz-data">${JSON.stringify(fixture)}</script>
    </section>`;
  mountAll(document);
  return document.querySelector('.lesson-quiz');
}

describe('quiz rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('renders 3 quiz cards from JSON', () => {
    const host = mountFixture();
    const cards = host.querySelectorAll('.quiz-card');
    expect(cards.length).toBe(3);
    expect(host.querySelector('.quiz-title').textContent).toBe('Test quiz');
  });

  it('renders multiple-choice options as buttons', () => {
    const host = mountFixture();
    const opts = host.querySelector('.quiz-card[data-kind="multiple"]').querySelectorAll('.quiz-opt-btn');
    expect(opts.length).toBe(4);
  });

  it('marks correct answer and persists progress', () => {
    const host = mountFixture('test1');
    const first = host.querySelector('.quiz-card[data-kind="multiple"]');
    const buttons = first.querySelectorAll('.quiz-opt-btn');
    buttons[1].click();
    expect(buttons[1].classList.contains('correct')).toBe(true);
    const saved = loadProgress('test1');
    expect(saved[0]).toBe('correct');
  });

  it('marks wrong answer and reveals correct one', () => {
    const host = mountFixture('test2');
    const first = host.querySelector('.quiz-card[data-kind="multiple"]');
    const buttons = first.querySelectorAll('.quiz-opt-btn');
    buttons[0].click();
    expect(buttons[0].classList.contains('wrong')).toBe(true);
    expect(buttons[1].classList.contains('correct')).toBe(true);
    expect(loadProgress('test2')[0]).toBe('wrong');
  });

  it('renders <details> reveal for open and task questions', () => {
    const host = mountFixture();
    const reveals = host.querySelectorAll('.quiz-reveal');
    expect(reveals.length).toBe(2);
    expect(host.querySelectorAll('.quiz-mark').length).toBe(2);
  });

  it('summary updates after answering', () => {
    const host = mountFixture('test3');
    expect(host.querySelector('.quiz-summary').textContent).toBe('0 / 3 зачтено');
    host.querySelectorAll('.quiz-card[data-kind="multiple"] .quiz-opt-btn')[1].click();
    expect(host.querySelector('.quiz-summary').textContent).toBe('1 / 3 зачтено');
  });

  it('saveProgress / loadProgress round-trip', () => {
    saveProgress('roundtrip', { 0: 'correct', 2: 'done' });
    const back = loadProgress('roundtrip');
    expect(back[0]).toBe('correct');
    expect(back[2]).toBe('done');
  });
});
