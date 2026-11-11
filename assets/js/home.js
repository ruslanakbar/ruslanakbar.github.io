/* Home page behaviour: a greeting that knows the time (and whether you have been
   here before), a typed "right now I'm probably..." line, and the small
   conversation. The words themselves live in _data/home.yml. */
(function () {
  'use strict';

  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- greeting ---------- */

  function greet() {
    var el = document.querySelector('[data-home-hello]');
    if (!el) return;

    var returning = false;
    try {
      returning = window.localStorage.getItem('visited') === 'yes';
      window.localStorage.setItem('visited', 'yes');
    } catch (e) { /* storage blocked: treat everyone as new */ }

    var hour = new Date().getHours(), text;
    if (hour >= 22 || hour < 5) {
      text = returning ? 'Up late again? Same here. Welcome back.' : 'Up late? Same here. Welcome.';
    } else {
      var part = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');
      text = part + (returning ? ', and welcome back.' : ', and welcome.');
    }
    el.textContent = text;
  }

  /* ---------- "right now I'm probably ..." ---------- */

  function typeStatus() {
    var el = document.querySelector('[data-home-typed]');
    if (!el) return;
    var phrases;
    try { phrases = JSON.parse(el.getAttribute('data-phrases')); } catch (e) { return; }
    if (!phrases || phrases.length < 2 || REDUCED) return;

    var which = 0;
    function type(n) {
      el.textContent = phrases[which].slice(0, n);
      if (n < phrases[which].length) window.setTimeout(function () { type(n + 1); }, 38 + Math.random() * 55);
      else window.setTimeout(function () { erase(phrases[which].length); }, 2600);
    }
    function erase(n) {
      el.textContent = phrases[which].slice(0, n);
      if (n > 0) { window.setTimeout(function () { erase(n - 1); }, 20); return; }
      which = (which + 1) % phrases.length;
      window.setTimeout(function () { type(1); }, 450);
    }
    window.setTimeout(function () { erase(phrases[0].length); }, 3200);
  }

  /* ---------- the conversation ---------- */

  function chat() {
    var root = document.querySelector('[data-home-chat]');
    if (!root) return;
    var log = root.querySelector('[data-home-log]');
    var replies = root.querySelector('[data-home-replies]');
    var chips = Array.prototype.slice.call(root.querySelectorAll('.home__chip'));
    var mini = root.querySelector('.home__mini');
    if (!log || !replies || !chips.length) return;

    replies.classList.add('is-enhanced');   // hide the plain list, the chips take over
    chips.forEach(function (chip) { chip.hidden = false; });

    function row(kind) {
      var wrap = document.createElement('div');
      wrap.className = 'home__bubble-row' + (kind === 'visitor' ? ' home__bubble-row--visitor' : '');
      if (kind === 'me' && mini) {
        var face = mini.cloneNode(false);
        wrap.appendChild(face);
      }
      var bubble = document.createElement('div');
      bubble.className = 'home__bubble home__bubble--' + kind;
      wrap.appendChild(bubble);
      log.appendChild(wrap);
      return bubble;
    }

    var pending = 0;
    function answer(chip) {
      var source = replies.querySelector('[data-reply-for="' + chip.getAttribute('data-reply') + '"] .home__reply-body');
      if (!source) return;
      window.clearTimeout(pending);
      chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });

      log.textContent = '';
      row('visitor').textContent = chip.textContent;
      var mine = row('me');

      function reveal() { mine.innerHTML = source.innerHTML; }   // our own markup, from the page itself
      if (REDUCED) { reveal(); return; }

      var dots = document.createElement('span');
      dots.className = 'home__typing';
      dots.setAttribute('aria-hidden', 'true');
      dots.appendChild(document.createElement('i'));
      dots.appendChild(document.createElement('i'));
      dots.appendChild(document.createElement('i'));
      mine.appendChild(dots);
      pending = window.setTimeout(reveal, 750);
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () { answer(chip); });
    });
  }

  function init() { greet(); typeStatus(); chat(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
