/* Cursor wake: the mouse pointer behaves like a body moving through a fluid.
   It leaves a short streakline and sheds a von Karman vortex street behind it:
   counter-rotating point vortices that curl the dye trails up before they fade.
   Clicking sends out a small pressure pulse.

   Turn it off site-wide with `cursor_wake: false` in _config.yml. */
(function () {
  'use strict';

  var mq = window.matchMedia;
  if (!mq || !window.requestAnimationFrame || !window.Path2D) return;
  if (mq('(prefers-reduced-motion: reduce)').matches) return;   // respect the OS setting
  if (!mq('(hover: hover) and (pointer: fine)').matches) return; // no mouse, no wake

  var TEAL = '70, 222, 230', AMBER = '255, 200, 87', ICE = '225, 250, 252';

  var TRAIL = 14;            // points remembered per dye particle
  var SAMPLE = 1 / 60;       // seconds between remembered points
  var MAX_PARTICLES = 650;
  var MAX_VORTICES = 44;
  var DYE_SPACING = 5;       // px of cursor travel between dye particles
  var SHED_SPACING = 34;     // px of cursor travel between shed vortices
  var CORE2 = 16 * 16;       // vortex core radius squared (keeps velocities finite)
  var STREAK_LIFE = 0.42;    // seconds the bright core line survives
  var TWO_PI = Math.PI * 2;

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'pointer-events:none;z-index:2147483000;';
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var width = 0, height = 0;
  function fit() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var particles = [];  // {x, y, vx, vy, age, life, side, trail[]}
  var vortices = [];   // {x, y, gamma, age, life}
  var streak = [];     // {x, y, t}
  var pulses = [];     // {x, y, age}
  var pointer = null;  // last pointer sample {x, y, t}
  var side = 1, dyeDist = 0, shedDist = 0;
  var running = false, lastFrame = 0, clock = 0, sampleAcc = 0;

  /* ---------- input ---------- */

  function onMove(e) {
    if (e.pointerType && e.pointerType === 'touch') return;
    var now = performance.now() / 1000;
    var x = e.clientX, y = e.clientY;
    if (!pointer || now - pointer.t > 0.12) { restart(x, y, now); return; }

    var dx = x - pointer.x, dy = y - pointer.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) return;
    if (dist > 320) { restart(x, y, now); return; }  // teleport, not a stroke

    var dt = Math.max(now - pointer.t, 0.004);
    var speed = Math.min(dist / dt, 2600);
    var ux = dx / dist, uy = dy / dist;   // direction of travel
    var nx = -uy, ny = ux;                // its left-hand normal

    streak.push({ x: x, y: y, t: clock });

    // Dye: particles released just off the path, alternating sides.
    dyeDist += dist;
    while (dyeDist >= DYE_SPACING) {
      dyeDist -= DYE_SPACING;
      var back = dyeDist, s = Math.random() < 0.5 ? 1 : -1, off = 2 + Math.random() * 7;
      emit(x - ux * back + nx * s * off, y - uy * back + ny * s * off,
        ux * speed * 0.1 + nx * s * Math.random() * 26,
        uy * speed * 0.1 + ny * s * Math.random() * 26,
        s, 1.0 + Math.random() * 0.9);
    }

    // Vortex shedding: one vortex per SHED_SPACING, alternating sides and signs,
    // so the flow between the two rows follows the cursor like a real wake.
    shedDist += dist;
    while (shedDist >= SHED_SPACING) {
      shedDist -= SHED_SPACING;
      side = -side;
      vortices.push({
        x: x - ux * shedDist + nx * side * 11,
        y: y - uy * shedDist + ny * side * 11,
        gamma: side * Math.max(260, Math.min(speed, 1500)) * 30,
        age: 0,
        life: 1.8
      });
      if (vortices.length > MAX_VORTICES) vortices.shift();
    }

    pointer = { x: x, y: y, t: now };
    wake();
  }

  // Begin a new stroke without connecting it to wherever the pointer was before.
  function restart(x, y, now) {
    pointer = { x: x, y: y, t: now };
    streak.push({ x: x, y: y, t: clock, first: true });
    wake();
  }

  function onDown(e) {
    if (e.pointerType && e.pointerType === 'touch') return;
    var x = e.clientX, y = e.clientY, i;
    pulses.push({ x: x, y: y, age: 0 });
    for (i = 0; i < particles.length; i++) {
      var p = particles[i], dx = p.x - x, dy = p.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 150) { p.vx += dx / d * 340 * (1 - d / 150); p.vy += dy / d * 340 * (1 - d / 150); }
    }
    for (i = 0; i < 30; i++) {
      var a = i / 30 * TWO_PI, v = 190 + Math.random() * 90;
      emit(x + Math.cos(a) * 6, y + Math.sin(a) * 6, Math.cos(a) * v, Math.sin(a) * v,
        i % 2 ? 1 : -1, 0.6 + Math.random() * 0.4);
    }
    // A counter-rotating pair, so the burst rolls up instead of flying straight.
    vortices.push({ x: x - 12, y: y, gamma: 15000, age: 0, life: 0.9 });
    vortices.push({ x: x + 12, y: y, gamma: -15000, age: 0, life: 0.9 });
    wake();
  }

  function emit(x, y, vx, vy, s, life) {
    particles.push({ x: x, y: y, vx: vx, vy: vy, age: 0, life: life, side: s, trail: [x, y] });
    if (particles.length > MAX_PARTICLES) particles.shift();
  }

  /* ---------- simulation ---------- */

  function induced(x, y, skip, out) {
    var u = 0, v = 0;
    for (var i = 0; i < vortices.length; i++) {
      if (i === skip) continue;
      var w = vortices[i], rx = x - w.x, ry = y - w.y;
      var k = w.gamma * (1 - w.age / w.life) / (TWO_PI * (rx * rx + ry * ry + CORE2));
      u -= k * ry;
      v += k * rx;
    }
    out.u = u; out.v = v;
  }

  var vel = { u: 0, v: 0 };
  function step(dt) {
    var i, p, w;
    clock += dt;
    sampleAcc += dt;
    var remember = sampleAcc >= SAMPLE;
    if (remember) sampleAcc = 0;

    for (i = vortices.length - 1; i >= 0; i--) {
      w = vortices[i];
      w.age += dt;
      if (w.age >= w.life) { vortices.splice(i, 1); continue; }
    }
    for (i = 0; i < vortices.length; i++) {   // vortices carry each other along
      w = vortices[i];
      induced(w.x, w.y, i, vel);
      w.x += vel.u * dt;
      w.y += vel.v * dt;
    }

    var drag = Math.exp(-4.5 * dt);
    for (i = particles.length - 1; i >= 0; i--) {
      p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      induced(p.x, p.y, -1, vel);
      p.vx *= drag;
      p.vy *= drag;
      p.x += (p.vx + vel.u) * dt;
      p.y += (p.vy + vel.v) * dt;
      if (remember) {
        p.trail.push(p.x, p.y);
        if (p.trail.length > TRAIL * 2) p.trail.splice(0, 2);
      }
    }

    while (streak.length && clock - streak[0].t > STREAK_LIFE) streak.shift();
    for (i = pulses.length - 1; i >= 0; i--) {
      pulses[i].age += dt;
      if (pulses[i].age > 0.6) pulses.splice(i, 1);
    }
  }

  /* ---------- drawing ---------- */

  function draw() {
    var i, k, p, n;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Dye trails. Older particles lose the tail of their trail first, so every
    // (side, brightness) pair can be drawn as one batched stroke.
    var paths = [[], []];
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      n = p.trail.length / 2;
      var row = paths[p.side > 0 ? 0 : 1];
      var fade = Math.floor(p.age / p.life * TRAIL);
      var hx = p.x, hy = p.y;   // newer end of the current segment
      for (k = fade; k < TRAIL && n > 0; k++) {
        n -= 1;
        if (!row[k]) row[k] = new Path2D();
        row[k].moveTo(p.trail[n * 2], p.trail[n * 2 + 1]);
        row[k].lineTo(hx, hy);
        hx = p.trail[n * 2];
        hy = p.trail[n * 2 + 1];
      }
    }
    for (var r = 0; r < 2; r++) {
      for (k = 0; k < TRAIL; k++) {
        if (!paths[r][k]) continue;
        var strength = 1 - k / TRAIL;
        ctx.lineWidth = 0.6 + 1.3 * strength;
        ctx.strokeStyle = 'rgba(' + (r ? AMBER : TEAL) + ', ' + (0.75 * strength).toFixed(3) + ')';
        ctx.stroke(paths[r][k]);
      }
    }

    // Bright streakline right behind the pointer.
    for (i = 1; i < streak.length; i++) {
      var life = 1 - (clock - streak[i].t) / STREAK_LIFE;
      if (life <= 0 || streak[i].first) continue;
      ctx.beginPath();
      ctx.moveTo(streak[i - 1].x, streak[i - 1].y);
      ctx.lineTo(streak[i].x, streak[i].y);
      ctx.lineWidth = 0.5 + 2.2 * life;
      ctx.strokeStyle = 'rgba(' + ICE + ', ' + (0.85 * life).toFixed(3) + ')';
      ctx.stroke();
    }

    // Click pulses.
    for (i = 0; i < pulses.length; i++) {
      var f = pulses[i].age / 0.6, ease = 1 - (1 - f) * (1 - f);
      ctx.beginPath();
      ctx.arc(pulses[i].x, pulses[i].y, 8 + 92 * ease, 0, TWO_PI);
      ctx.lineWidth = 2.2 * (1 - f) + 0.3;
      ctx.strokeStyle = 'rgba(' + ICE + ', ' + (0.7 * (1 - f)).toFixed(3) + ')';
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- loop: only runs while something is on screen ---------- */

  function frame(now) {
    var dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.04) : 0.016;
    lastFrame = now;
    step(dt);
    draw();
    if (particles.length || vortices.length || streak.length || pulses.length) {
      window.requestAnimationFrame(frame);
    } else {
      running = false;
      lastFrame = 0;
      ctx.clearRect(0, 0, width, height);
    }
  }

  function wake() {
    if (running) return;
    running = true;
    window.requestAnimationFrame(frame);
  }

  function start() {
    document.body.appendChild(canvas);
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('blur', function () { pointer = null; });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
