/* Animated scenes for the "in progress" placeholder pages.
   Markup lives in _includes/wip.html; each scene is picked by data-wip-scene. */
(function () {
  'use strict';

  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Fixed colours. Accent colours come from the colormap switcher
  // (assets/js/colormap.js) when it is loaded, see accent()/ramp() below.
  var COLOR = {
    bg: '#1a1e26',
    page: '#252a34',
    text: '#eaeaea',
    red: '255, 107, 107',
    white: '234, 234, 234'
  };
  var FALLBACK = { accent: '0, 173, 181', warm: '255, 200, 87' };

  // "r, g, b" for a named role: 'accent' or 'warm'.
  function accent(role) {
    return window.Colormap ? window.Colormap.rgb(role) : FALLBACK[role];
  }
  // "r, g, b" for a data value u in 0-1, taken from the active colormap.
  function ramp(u) {
    return window.Colormap ? window.Colormap.ramp(u) : FALLBACK.accent;
  }

  var MONO = '11px Monaco, Consolas, "Lucida Console", monospace';

  function rgba(c, a) { return 'rgba(' + c + ', ' + a + ')'; }
  function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function onColormap(redraw) { document.addEventListener('colormapchange', redraw); }

  /* ---------- canvas plumbing ---------- */

  // Creates a canvas that tracks its CSS size and device pixel ratio.
  function makeCanvas(stage, label, onResize) {
    var canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', label);
    stage.appendChild(canvas);
    var view = { canvas: canvas, ctx: canvas.getContext('2d'), w: 0, h: 0 };

    function fit() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.w = rect.width;
      view.h = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (onResize) onResize(view);
    }
    view.fit = fit;
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas);
    else window.addEventListener('resize', fit);
    return view;
  }

  // Runs frame(dt, t) every animation frame while the element is on screen.
  function animate(el, frame) {
    var visible = true, last = 0, t = 0;
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
      }).observe(el);
    }
    function tick(now) {
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
      last = now;
      if (visible) { t += dt; frame(dt, t); }
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  /* ---------- scene: flow past a cylinder (Research) ---------- */

  function flowScene(stage, hud) {
    var R = 0.55, U = 1.5, TRAIL = 26;
    var worldW, xMin, xMax, yMax, scale, particles = [];

    var view = makeCanvas(stage,
      'Animation of streamlines flowing past a cylinder, with a wavy wake behind it.',
      function (v) {
        worldW = v.w < 480 ? 7.5 : 10;
        scale = v.w / worldW;
        xMin = -0.3 * worldW;
        xMax = xMin + worldW;
        yMax = v.h / scale / 2;
        var want = Math.max(110, Math.min(380, Math.round(v.w * v.h / 900)));
        while (particles.length < want) particles.push(seed({}, true));
        particles.length = want;
      });

    function seed(p, anywhere) {
      do {
        p.x = anywhere ? xMin + Math.random() * worldW : xMin - Math.random() * 0.6;
        p.y = (Math.random() * 2 - 1) * yMax;
      } while (p.x * p.x + p.y * p.y < R * R * 1.3);
      p.trail = [];
      p.speed = U;
      return p;
    }

    // Potential flow around a cylinder plus a made-up oscillating wake,
    // because a vortex street is prettier than a correct boundary layer.
    function advance(p, dt, t) {
      var x = p.x, y = p.y, r2 = x * x + y * y, r4 = r2 * r2, R2 = R * R;
      var u = U * (1 - R2 * (x * x - y * y) / r4);
      var v = -U * 2 * R2 * x * y / r4;
      if (x > 0) {
        var g = Math.min(1, x / 1.5) * Math.exp(-(y * y) / 0.8);
        v += 0.8 * U * g * Math.sin(2.3 * x - 4.4 * t);
        u -= 0.4 * U * g * Math.exp(-x / 5);
      }
      p.trail.push(x, y);
      if (p.trail.length > TRAIL * 2) p.trail.splice(0, 2);
      p.x = x + u * dt;
      p.y = y + v * dt;
      p.speed = Math.sqrt(u * u + v * v);
      if (p.x > xMax + 0.4 || Math.abs(p.y) > yMax + 0.4 || p.x * p.x + p.y * p.y < R2) seed(p, false);
    }

    function draw() {
      var ctx = view.ctx, i, k, b;
      var ox = -xMin * scale, oy = view.h / 2;
      ctx.fillStyle = COLOR.bg;
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.4;

      // Colour by speed, like a velocity-magnitude plot. Speeds are bucketed
      // so each bucket/age pair is a single stroke.
      var BUCKETS = 5;
      for (b = 0; b < BUCKETS; b++) {
        var tint = ramp(b / (BUCKETS - 1));
        for (k = 0; k < TRAIL - 1; k++) {
          ctx.beginPath();
          for (i = 0; i < particles.length; i++) {
            var p = particles[i];
            var bucket = Math.max(0, Math.min(BUCKETS - 1, Math.floor((p.speed / U - 0.45) / 1.1 * BUCKETS)));
            if (bucket !== b) continue;
            var j = p.trail.length - 2 * (k + 2);
            if (j < 0) continue;
            ctx.moveTo(ox + p.trail[j] * scale, oy + p.trail[j + 1] * scale);
            ctx.lineTo(ox + p.trail[j + 2] * scale, oy + p.trail[j + 3] * scale);
          }
          ctx.strokeStyle = rgba(tint, (0.55 + 0.45 * b / (BUCKETS - 1)) * (1 - k / TRAIL) * 0.9);
          ctx.stroke();
        }
      }

      ctx.beginPath();
      ctx.arc(ox, oy, R * scale, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.page;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(accent('warm'), 0.9);
      ctx.stroke();
    }

    var iter = 48213;
    function step(dt, t) {
      for (var i = 0; i < particles.length; i++) advance(particles[i], dt, t);
      iter += dt * 400;
      var residual = 1.0 + 0.35 * Math.sin(t * 0.9) + 0.1 * Math.sin(t * 3.7);
      hud.textContent = 'iter ' + commas(iter) + ' · residual ' + residual.toFixed(2) +
        'e-03 (refusing to drop) · ETA: when I find time';
      draw();
    }

    for (var warm = 0; warm < 60; warm++) {
      for (var i = 0; i < particles.length; i++) advance(particles[i], 0.016, warm * 0.016);
    }
    if (REDUCED) { step(0.016, 0.64); onColormap(draw); return; }
    animate(view.canvas, step);
  }

  /* ---------- scene: training loss that goes to NaN (Projects) ---------- */

  function lossScene(stage, hud) {
    var STEPS = 400, Y_MAX = 2.6, RATE = 80;
    var attempt = 3, ghosts = [], pts, blowAt, value, mode, hold, acc;

    var view = makeCanvas(stage,
      'Animation of a training loss curve that steadily decreases, then blows up to NaN and restarts.',
      function () { if (pts) draw(); });

    function reset() {
      pts = [];
      blowAt = 220 + Math.floor(Math.random() * 130);
      value = 0; mode = 'train'; hold = 0; acc = 0;
    }

    function next() {
      var i = pts.length;
      if (i < blowAt) {
        value = 2.1 * Math.exp(-i / 60) + 0.22 + (Math.random() - 0.5) * 0.1 * (0.35 + Math.exp(-i / 110));
      } else {
        value = value * 1.3 + 0.02;
      }
      pts.push(value);
      if (value > Y_MAX * 1.15) { mode = 'nan'; hold = 0; }
    }

    function draw() {
      var ctx = view.ctx, w = view.w, h = view.h;
      var L = 40, T = 16, Rt = 16, B = 28, pw = w - L - Rt, ph = h - T - B, i, g;
      function px(i) { return L + i / STEPS * pw; }
      function py(v) { return T + (1 - v / Y_MAX) * ph; }

      ctx.fillStyle = COLOR.bg;
      ctx.fillRect(0, 0, w, h);

      ctx.font = MONO;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.lineWidth = 1;
      for (g = 0; g <= 2; g++) {
        ctx.strokeStyle = rgba(COLOR.white, g === 0 ? 0.25 : 0.08);
        ctx.beginPath();
        ctx.moveTo(L, Math.round(py(g)) + 0.5);
        ctx.lineTo(w - Rt, Math.round(py(g)) + 0.5);
        ctx.stroke();
        ctx.fillStyle = rgba(COLOR.white, 0.45);
        ctx.fillText(g.toFixed(1), L - 8, py(g));
      }
      ctx.textAlign = 'left';
      ctx.fillText('loss', L + 6, T + 4);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('training steps →', w - Rt, h - 9);

      ctx.save();
      ctx.beginPath();
      ctx.rect(L, T - 6, pw, ph + 6);
      ctx.clip();
      ctx.lineJoin = 'round';

      function curve(arr) {
        ctx.beginPath();
        for (i = 0; i < arr.length; i++) {
          if (i) ctx.lineTo(px(i), py(arr[i])); else ctx.moveTo(px(i), py(arr[i]));
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1.2;
      for (g = 0; g < ghosts.length; g++) {
        ctx.strokeStyle = rgba(COLOR.white, 0.14 + 0.06 * g);
        curve(ghosts[g]);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(accent('accent'), 1);
      curve(pts);
      ctx.restore();

      if (!pts.length) return;
      var lastX = px(pts.length - 1);
      if (mode === 'train') {
        ctx.beginPath();
        ctx.arc(lastX, py(value), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = COLOR.text;
        ctx.fill();
      } else {
        var right = lastX > w - 110;
        ctx.font = 'bold 13px Monaco, Consolas, monospace';
        ctx.textAlign = right ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(COLOR.red, 1);
        ctx.fillText(right ? 'loss = NaN ↗' : '↖ loss = NaN', lastX + (right ? -12 : 12), T + 16);
      }
    }

    function step(dt) {
      if (mode === 'train') {
        acc += dt * RATE;
        while (acc >= 1 && mode === 'train') { acc -= 1; next(); }
        hud.classList.remove('is-error');
        hud.textContent = 'epoch ' + attempt + '/∞ · step ' + commas(pts.length * 25) +
          ' · loss ' + Math.min(value, 99).toFixed(4);
      } else {
        hold += dt;
        if (hold < 1.8) {
          hud.classList.add('is-error');
          hud.textContent = 'epoch ' + attempt + '/∞ · loss NaN · a deadline exploded the gradients';
        } else if (hold < 3.4) {
          hud.classList.remove('is-error');
          hud.textContent = 'lowering learning rate (again)… restarting';
        } else {
          ghosts.push(pts);
          if (ghosts.length > 3) ghosts.shift();
          attempt += 1;
          reset();
        }
      }
      draw();
    }

    reset();
    if (REDUCED) {
      while (mode === 'train') next();
      hud.classList.add('is-error');
      hud.textContent = 'epoch ' + attempt + '/∞ · loss NaN · a deadline exploded the gradients';
      draw();
      onColormap(draw);
      return;
    }
    animate(view.canvas, step);
  }

  /* ---------- scene: a very uninformative posterior (Publications) ---------- */

  function posteriorScene(stage, hud) {
    var BINS = 36, TARGET = 1600;
    var counts, total, drops, mode, hold, acc;

    var view = makeCanvas(stage,
      'Animation of samples piling up into a very wide probability distribution of when this page will be finished, ' +
      'spanning from next week to my defense.',
      function () { if (counts) draw(); });

    function reset() {
      counts = []; for (var i = 0; i < BINS; i++) counts.push(0);
      total = 0; drops = []; mode = 'sample'; hold = 0; acc = 0;
    }

    // Two modes: "soon" and "later". Neither is very convincing.
    function sample() {
      var x;
      do { x = Math.random() < 0.55 ? 0.3 + 0.1 * gauss() : 0.7 + 0.11 * gauss(); } while (x < 0.03 || x > 0.97);
      return x;
    }

    function quantile(q) {
      var need = q * total, run = 0;
      for (var i = 0; i < BINS; i++) { run += counts[i]; if (run >= need) return i; }
      return BINS - 1;
    }

    function geometry() {
      var L = 18, Rt = 18, T = 14, B = 62;
      return { L: L, T: T, pw: view.w - L - Rt, ph: view.h - T - B, base: view.h - B };
    }

    function barHeight(g, c) {
      var max = Math.max.apply(null, counts);
      var unit = Math.min(5, g.ph * 0.86 / Math.max(max, 1));
      return c * unit;
    }

    function draw() {
      var ctx = view.ctx, w = view.w, h = view.h, g = geometry(), i;
      var bw = g.pw / BINS;
      ctx.fillStyle = COLOR.bg;
      ctx.fillRect(0, 0, w, h);

      var lo = total > 20 ? quantile(0.025) : 0, hi = total > 20 ? quantile(0.975) : BINS - 1;
      var peak = Math.max.apply(null, counts) || 1;
      for (i = 0; i < BINS; i++) {
        var bh = barHeight(g, counts[i]);
        if (!bh) continue;
        ctx.fillStyle = rgba(ramp(counts[i] / peak), i >= lo && i <= hi ? 0.9 : 0.3);
        ctx.fillRect(g.L + i * bw + 1, g.base - bh, bw - 2, bh);
      }

      ctx.fillStyle = rgba(accent('warm'), 0.95);
      for (i = 0; i < drops.length; i++) {
        ctx.beginPath();
        ctx.arc(g.L + (drops[i].bin + 0.5) * bw, drops[i].y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = rgba(COLOR.white, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(g.L, g.base + 0.5);
      ctx.lineTo(g.L + g.pw, g.base + 0.5);
      ctx.stroke();

      // 95% interval bracket
      var x0 = g.L + lo * bw, x1 = g.L + (hi + 1) * bw, by = g.base + 14;
      ctx.strokeStyle = rgba(accent('warm'), 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, by - 5); ctx.lineTo(x0, by + 5);
      ctx.moveTo(x0, by); ctx.lineTo(x1, by);
      ctx.moveTo(x1, by - 5); ctx.lineTo(x1, by + 5);
      ctx.stroke();

      ctx.font = MONO;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(accent('warm'), 0.95);
      ctx.fillText('95% credible interval', (x0 + x1) / 2, by + 18);

      ctx.fillStyle = rgba(COLOR.white, 0.5);
      ctx.textAlign = 'left';
      ctx.fillText('next week', g.L, h - 8);
      ctx.textAlign = 'right';
      ctx.fillText('my defense', g.L + g.pw, h - 8);
      if (w > 420) {
        ctx.textAlign = 'center';
        ctx.fillText('expected arrival of this page →', g.L + g.pw / 2, h - 8);
      }
    }

    function land(bin) { counts[bin] += 1; total += 1; }

    function step(dt) {
      var g = geometry(), i;
      if (mode === 'sample') {
        acc += dt * 95;
        while (acc >= 1) {
          acc -= 1;
          drops.push({ bin: Math.min(BINS - 1, Math.floor(sample() * BINS)), y: g.T - 4 });
        }
        if (total >= TARGET) { mode = 'shrug'; hold = 0; drops = []; }
        hud.textContent = 'N = ' + commas(total) + ' samples · 95% CI: [next week, my defense] · width: basically all of it';
      } else {
        hold += dt;
        hud.textContent = 'N = ' + commas(total) + ' · posterior still uninformative · collecting more data…';
        if (hold > 3) reset();
      }
      for (i = drops.length - 1; i >= 0; i--) {
        drops[i].y += dt * 460;
        if (drops[i].y >= g.base - barHeight(g, counts[drops[i].bin])) {
          land(drops[i].bin);
          drops.splice(i, 1);
        }
      }
      draw();
    }

    reset();
    if (REDUCED) {
      for (var n = 0; n < TARGET; n++) land(Math.min(BINS - 1, Math.floor(sample() * BINS)));
      hud.textContent = 'N = ' + commas(total) + ' samples · 95% CI: [next week, my defense] · width: basically all of it';
      draw();
      onColormap(draw);
      return;
    }
    animate(view.canvas, step);
  }

  /* ---------- scene: terminal (CV, 404) ---------- */

  var SCRIPTS = {
    latex: {
      loop: true,
      label: 'Terminal showing a LaTeX CV that refuses to compile.',
      status: ['pdflatex · attempt ', ' · 0 errors I am willing to admit to'],
      lines: [
        ['cmd', 'pdflatex cv.tex'],
        ['out', 'This is pdfTeX, Version 3.14159265'],
        ['out', '(./cv.tex (./education.tex) (./research.tex)'],
        ['warn', "LaTeX Warning: Reference `free_time' undefined."],
        ['warn', 'Overfull \\hbox (badness 10000) in "Skills"'],
        ['warn', 'Underfull \\vbox in "Weekends"'],
        ['err', '! Undefined control sequence.'],
        ['err', 'l.42 \\sleep'],
        ['cmd', 'pdflatex cv.tex   # just one more margin tweak'],
        ['out', 'Output written on cv.pdf (0 pages).'],
        ['ok', '>> Retrying after coffee…']
      ]
    },
    diverged: {
      loop: false,
      label: 'Terminal showing a solver whose residuals blow up to NaN while looking for this page.',
      status: ['exit code 404 · run ', ' · solution diverged'],
      lines: [
        ['cmd', './find_page {path}'],
        ['out', ' iter   residual    page found?'],
        ['out', '    1   1.00e+00    no'],
        ['out', '   40   3.17e-01    no'],
        ['out', '   80   8.80e-02    almost'],
        ['warn', '  120   4.52e+03    no'],
        ['warn', '  150   9.99e+17    definitely not'],
        ['err', '  151   NaN         NaN'],
        ['err', 'Floating point exception (core dumped)'],
        ['ok', '>> Solution diverged: this page does not exist.']
      ]
    }
  };

  function terminalScene(stage, hud, script) {
    var term = document.createElement('div');
    term.className = 'wip__term';
    term.setAttribute('role', 'img');
    term.setAttribute('aria-label', script.label);
    stage.appendChild(term);

    var path = window.location.pathname;
    if (path.length > 22) path = path.slice(0, 21) + '…';
    var lines = script.lines.map(function (l) {
      return [l[0], (l[0] === 'cmd' ? '$ ' : '') + l[1].replace('{path}', path)];
    });
    var cursor = document.createElement('span');
    cursor.className = 'wip__cursor';
    var run = 0;

    function addLine(kind) {
      var el = document.createElement('span');
      el.className = 'wip__line wip__line--' + kind;
      term.appendChild(el);
      return el;
    }

    function start() {
      run += 1;
      term.textContent = '';
      // Reserve the final height so the page does not jump while typing.
      term.style.minHeight = 'calc(' + (lines.length + 1) * 1.6 + 'em + 2em)';
      hud.textContent = script.status[0] + run + script.status[1];
      play(0);
    }

    function play(i) {
      if (i >= lines.length) {
        addLine('cmd').appendChild(cursor);
        if (script.loop) window.setTimeout(start, 7000);
        return;
      }
      var kind = lines[i][0], text = lines[i][1], el = addLine(kind);
      if (kind !== 'cmd') {
        el.textContent = text;
        window.setTimeout(function () { play(i + 1); }, kind === 'err' ? 520 : 260);
        return;
      }
      var n = 0, node = document.createTextNode('');
      el.appendChild(node);
      el.appendChild(cursor);
      (function type() {
        n += 1;
        node.data = text.slice(0, n);
        if (n < text.length) window.setTimeout(type, 28 + Math.random() * 50);
        else window.setTimeout(function () { el.removeChild(cursor); play(i + 1); }, 480);
      })();
    }

    if (REDUCED) {
      lines.forEach(function (l) { addLine(l[0]).textContent = l[1]; });
      hud.textContent = script.status[0] + '1' + script.status[1];
      return;
    }
    start();
  }

  /* ---------- scene: the eternally unfinished first post (Blog) ---------- */

  function draftScene(stage, hud) {
    var OPENERS = [
      'Welcome to my blog! In this first post, I will',
      'It was the mesh. It is always the mesh.',
      'How confident am I in this post? Roughly 40% ± 40%.',
      'Things I have learned during my PhD so far: 1.',
      'TODO: write an actual blog post.'
    ];
    var editor = document.createElement('div');
    editor.className = 'wip__editor';
    editor.setAttribute('role', 'img');
    editor.setAttribute('aria-label', 'A text editor where the first sentence of a blog post keeps being typed and then deleted.');
    var gutter = document.createElement('div');
    gutter.className = 'wip__gutter';
    gutter.textContent = '1';
    var text = document.createElement('div');
    text.className = 'wip__text';
    var node = document.createTextNode('');
    var cursor = document.createElement('span');
    cursor.className = 'wip__cursor';
    text.appendChild(node);
    text.appendChild(cursor);
    editor.appendChild(gutter);
    editor.appendChild(text);
    stage.appendChild(editor);

    var draft = 14, which = 0;
    function status() {
      var words = node.data.trim() ? node.data.trim().split(/\s+/).length : 0;
      hud.textContent = 'draft ' + draft + ' · words: ' + words + ' · posts published: 0';
    }

    function type(target, n) {
      node.data = target.slice(0, n);
      status();
      if (n < target.length) window.setTimeout(function () { type(target, n + 1); }, 45 + Math.random() * 70);
      else window.setTimeout(function () { erase(target.length); }, 1900);
    }

    function erase(n) {
      node.data = node.data.slice(0, n);
      status();
      if (n > 0) { window.setTimeout(function () { erase(n - 1); }, 22); return; }
      draft += 1;
      which = (which + 1) % OPENERS.length;
      window.setTimeout(function () { type(OPENERS[which], 1); }, 700);
    }

    if (REDUCED) { node.data = OPENERS[0]; status(); return; }
    status();
    window.setTimeout(function () { type(OPENERS[0], 1); }, 500);
  }

  /* ---------- scene: chalkboard (Teaching) ---------- */

  function chalkScene(stage, hud) {
    var LINES = [
      ['title', 'Lecture {n}: Introduction'],
      ['math', '∂u/∂t + (u·∇)u = −∇p/ρ + ν∇²u'],
      ['math', '∇·u = 0'],
      ['text', 'The rest of this page is left as an exercise for the reader.']
    ];
    var board = document.createElement('div');
    board.className = 'wip__board';
    board.setAttribute('role', 'img');
    board.setAttribute('aria-label',
      'A chalkboard where the Navier–Stokes equations are written out, followed by: ' +
      'the rest of this page is left as an exercise for the reader.');
    stage.appendChild(board);
    var lecture = 1;

    function status(done) {
      hud.textContent = 'lecture ' + lecture + ' · slides ready: 0 · ' +
        (done ? 'any questions? no? great.' : 'chalk remaining: plenty');
    }

    function addLine(kind) {
      var el = document.createElement('span');
      el.className = 'wip__chalk wip__chalk--' + kind;
      board.appendChild(el);
      return el;
    }

    function write(i) {
      if (i >= LINES.length) {
        status(true);
        window.setTimeout(function () {
          board.classList.add('is-erasing');
          window.setTimeout(function () { lecture += 1; start(); }, 900);
        }, 6500);
        return;
      }
      var text = LINES[i][1].replace('{n}', lecture), el = addLine(LINES[i][0]), n = 0;
      (function type() {
        n += 1;
        el.textContent = text.slice(0, n);
        if (n < text.length) window.setTimeout(type, 38 + Math.random() * 45);
        else window.setTimeout(function () { write(i + 1); }, 650);
      })();
    }

    function start() {
      board.textContent = '';
      board.classList.remove('is-erasing');
      status(false);
      write(0);
    }

    if (REDUCED) {
      LINES.forEach(function (l) { addLine(l[0]).textContent = l[1].replace('{n}', lecture); });
      status(true);
      return;
    }
    start();
  }

  /* ---------- boot ---------- */

  function init() {
    var roots = document.querySelectorAll('[data-wip-scene]');
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      var stage = root.querySelector('[data-wip-stage]');
      var hud = root.querySelector('[data-wip-hud]');
      if (!stage || !hud || root.getAttribute('data-wip-ready')) continue;
      root.setAttribute('data-wip-ready', 'true');
      var scene = root.getAttribute('data-wip-scene');
      if (scene === 'flow') flowScene(stage, hud);
      else if (scene === 'loss') lossScene(stage, hud);
      else if (scene === 'posterior') posteriorScene(stage, hud);
      else if (scene === 'draft') draftScene(stage, hud);
      else if (scene === 'chalk') chalkScene(stage, hud);
      else terminalScene(stage, hud, SCRIPTS[scene] || SCRIPTS.latex);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
