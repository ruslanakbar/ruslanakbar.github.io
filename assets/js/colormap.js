/* Colormap switcher: recolours the site's accents, the placeholder animations
   and the cursor wake using scientific colormaps. The choice is remembered in
   localStorage. "jet" is on the list, but it has principles.

   Loaded in <head> without `defer` on purpose, so a saved colormap is applied
   before the first paint. Turn the control off with `colormap_switcher: false`
   in _config.yml.

   To add a colormap, add an entry to MAPS:
     stops   colours sampled evenly along the map
     range   the part of the map that is readable on the dark background
     accent  position (0-1) or hex used for buttons, links, highlights
     warm    position (0-1) or hex used for the secondary highlight */
(function () {
  'use strict';

  var MAPS = [
    { id: 'default', stops: ['#0d7f87', '#00adb5', '#6fd3d8', '#bef0f2'], range: [0, 1],
      accent: '#00adb5', warm: '#ffc857', onAccent: '#ffffff' },
    { id: 'viridis', stops: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
      range: [0.37, 1], accent: 0.68, warm: 1 },
    { id: 'plasma', stops: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
      range: [0.42, 1], accent: 0.64, warm: 0.92 },
    { id: 'inferno', stops: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
      range: [0.5, 1], accent: 0.7, warm: 0.93 },
    { id: 'cividis', stops: ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8678', '#a59c74', '#c3b369', '#e1cc55', '#fee838'],
      range: [0.4, 1], accent: 0.95, warm: 0.7 },
    { id: 'turbo', stops: ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a', '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0403'],
      range: [0.11, 0.88], accent: 0.3, warm: 0.68 },
    { id: 'coolwarm', stops: ['#3b4cc0', '#5d7ce6', '#8db0fe', '#b9d0f9', '#dddcdc', '#f5c4ac', '#f4987a', '#de604d', '#b40426'],
      range: [0.05, 0.95], accent: 0.25, warm: 0.75 },
    { id: 'jet', forbidden: true, stops: ['#00007f', '#0000ff', '#007fff', '#00ffff', '#7fff7f', '#ffff00', '#ff7f00', '#ff0000', '#7f0000'],
      range: [0.21, 0.9], accent: 0.375, warm: 0.625 }
  ];

  var JET_REFUSALS = [
    'Request denied: jet is not perceptually uniform.',
    'Still no. Rainbow colormaps invent features that are not in the data.',
    'Reviewer 2 would never forgive me.',
    'Last warning. viridis is right there.'
  ];
  var JET_SECONDS = 4;

  var KEY = 'colormap';
  var TEXT = [234, 234, 234], DARK = [20, 24, 31], WHITE = [255, 255, 255];

  /* ---------- colour maths ---------- */

  function parse(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function mix(a, b, w) {   // w = share of a
    return [a[0] * w + b[0] * (1 - w), a[1] * w + b[1] * (1 - w), a[2] * w + b[2] * (1 - w)];
  }
  function triplet(c) { return Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]); }
  function css(c) { return 'rgb(' + triplet(c) + ')'; }
  function luminance(c) {
    var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function sample(stops, t) {
    t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    var i = Math.min(Math.floor(t), stops.length - 2);
    return mix(stops[i + 1], stops[i], t - i);
  }
  function gradient(stops, from, to) {
    var parts = [];
    for (var i = 0; i <= 8; i++) parts.push(css(sample(stops, from + (to - from) * i / 8)));
    return 'linear-gradient(90deg, ' + parts.join(', ') + ')';
  }

  MAPS.forEach(function (m) {
    m.rgb = m.stops.map(parse);
    m.accentRgb = typeof m.accent === 'string' ? parse(m.accent) : sample(m.rgb, m.accent);
    m.warmRgb = typeof m.warm === 'string' ? parse(m.warm) : sample(m.rgb, m.warm);
    m.onAccentRgb = m.onAccent ? parse(m.onAccent)
      : (contrast(WHITE, m.accentRgb) >= contrast(DARK, m.accentRgb) ? WHITE : DARK);
    m.triplets = {
      accent: triplet(m.accentRgb),
      warm: triplet(m.warmRgb),
      glow: triplet(mix(WHITE, m.accentRgb, 0.3))
    };
  });

  function find(id) {
    for (var i = 0; i < MAPS.length; i++) if (MAPS[i].id === id) return MAPS[i];
    return null;
  }

  /* ---------- state ---------- */

  var chosen = MAPS[0];   // what the visitor picked (persisted)
  var active = MAPS[0];   // what is on screen (differs only during the jet incident)

  try {
    var saved = find(window.localStorage.getItem(KEY));
    if (saved && !saved.forbidden) chosen = saved;
  } catch (e) { /* private mode, blocked storage: just use the default */ }

  function paint(map) {
    active = map;
    var root = document.documentElement.style;
    var link = mix(map.accentRgb, TEXT, 0.4);
    root.setProperty('--cm-accent', css(map.accentRgb));
    root.setProperty('--cm-accent-hover', css(mix(map.accentRgb, [0, 0, 0], 0.8)));
    root.setProperty('--cm-on-accent', css(map.onAccentRgb));
    root.setProperty('--cm-warm', css(map.warmRgb));
    root.setProperty('--cm-link', css(link));
    root.setProperty('--cm-link-hover', css(mix(link, WHITE, 0.75)));
    root.setProperty('--cm-link-visited', css(mix(link, [0, 0, 0], 0.75)));
    root.setProperty('--cm-gradient', gradient(map.rgb, map.range[0], map.range[1]));
    document.documentElement.setAttribute('data-colormap', map.id);
    try { document.dispatchEvent(new CustomEvent('colormapchange', { detail: { id: map.id } })); } catch (e) { /* old browser */ }
  }

  function choose(map) {
    chosen = map;
    try { window.localStorage.setItem(KEY, map.id); } catch (e) { /* not fatal */ }
    paint(map);
  }

  // What the canvases use.
  window.Colormap = {
    id: function () { return active.id; },
    // 'accent' | 'warm' | 'glow' as an "r, g, b" string for rgba()
    rgb: function (role) { return active.triplets[role] || active.triplets.accent; },
    // data value u in 0-1 mapped through the readable part of the colormap
    ramp: function (u) {
      u = Math.max(0, Math.min(1, u));
      return triplet(sample(active.rgb, active.range[0] + (active.range[1] - active.range[0]) * u));
    }
  };

  paint(chosen);

  /* ---------- the control ---------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function buildControl() {
    var wrap = el('div', 'cm');
    var toast = el('div', 'cm__toast');
    toast.setAttribute('role', 'status');
    toast.hidden = true;

    var menu = el('div', 'cm__menu');
    menu.id = 'cm-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Colormap');
    menu.hidden = true;
    menu.appendChild(el('div', 'cm__title', 'colormap'));

    var toggle = el('button', 'cm__toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-controls', 'cm-menu');
    toggle.setAttribute('aria-expanded', 'false');
    var bar = el('span', 'cm__bar');
    var name = el('span', 'cm__name');
    toggle.appendChild(bar);
    toggle.appendChild(name);

    var items = MAPS.map(function (map) {
      var item = el('button', 'cm__item');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      var swatch = el('span', 'cm__swatch');
      swatch.style.backgroundImage = gradient(map.rgb, 0, 1);
      item.appendChild(swatch);
      item.appendChild(el('span', 'cm__label', map.id));
      item.addEventListener('click', function () { pick(map, item); });
      menu.appendChild(item);
      return item;
    });

    function sync() {
      name.textContent = active.id;
      toggle.setAttribute('aria-label', 'Colormap: ' + active.id + '. Change colormap');
      items.forEach(function (item, i) {
        item.setAttribute('aria-checked', MAPS[i] === active ? 'true' : 'false');
      });
    }

    var toastTimer = 0;
    function say(message, ms) {
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = window.setTimeout(function () { toast.hidden = true; }, ms || 4200);
    }

    var jetAttempts = 0, jetTimer = 0;
    function pick(map, item) {
      if (!map.forbidden) {
        window.clearTimeout(jetTimer);
        jetTimer = 0;
        choose(map);
        sync();
        return;
      }
      if (jetTimer) return;   // already enduring it
      if (jetAttempts < JET_REFUSALS.length) {
        say(JET_REFUSALS[jetAttempts]);
        jetAttempts += 1;
        item.classList.remove('is-refused');
        void item.offsetWidth;   // restart the shake animation
        item.classList.add('is-refused');
        return;
      }
      // Persistence pays off. Briefly.
      jetAttempts = 0;
      paint(map);
      sync();
      say('Fine. ' + JET_SECONDS + ' seconds. Then we never speak of this.', JET_SECONDS * 1000);
      jetTimer = window.setTimeout(function () {
        jetTimer = 0;
        paint(chosen);
        sync();
        say('Back to ' + chosen.id + '. That never happened.');
      }, JET_SECONDS * 1000);
    }

    function open(focusItem) {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      if (focusItem) (items[MAPS.indexOf(active)] || items[0]).focus();
    }
    function close(returnFocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      if (menu.hidden) open(true); else close(false);
    });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(true); return; }
      if (menu.hidden || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      var at = items.indexOf(document.activeElement);
      var next = at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[next].focus();
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) close(false);
    });
    wrap.addEventListener('focusout', function (e) {
      if (e.relatedTarget && !wrap.contains(e.relatedTarget)) close(false);
    });

    wrap.appendChild(toast);
    wrap.appendChild(menu);
    wrap.appendChild(toggle);
    document.body.appendChild(wrap);
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildControl);
  else buildControl();
})();
