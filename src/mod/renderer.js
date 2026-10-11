(function () {
  "use strict";
  if (window.__ymmV2 || !window.musicDesktopMod) return;
  window.__ymmV2 = true;
  const api = window.musicDesktopMod;
  const root = document.documentElement;

  // utils
  const $ = (sel, el = document) => el.querySelector(sel);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const debounce = (fn, ms) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const luminance = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const SEL = {
    playerRoot: '[class*="PlayerBarDesktopWithBackgroundProgressBar_root"]',
    player: '[class*="PlayerBarDesktopWithBackgroundProgressBar_player__"]',
    cover: '[class*="PlayerBarDesktopWithBackgroundProgressBar_coverContainer"]',
    volRoot: '[class*="ChangeVolume_root"], [class*="VibePlayerBar_changeVolume"]',
  };

  // state
  let state = null; // {config, files, modVersion, appVersion, discord}
  let cfg = null;
  const pending = {};
  const flush = debounce(async () => {
    const patch = { ...pending };
    for (const k of Object.keys(pending)) delete pending[k];
    try {
      const next = await api.set(patch);
      state.discord = next.discord;
      state.files = next.files;
      ui.refreshStatus();
    } catch (e) {
      console.warn("[YMusicMod] save", e);
    }
  }, 220);
  const setOpt = (patch, opts = {}) => {
    Object.assign(cfg, patch);
    Object.assign(pending, patch);
    if (!opts.keepPreset && !("activePreset" in patch) && Object.keys(patch).some((k) => PRESET_KEYS.includes(k))) {
      cfg.activePreset = null;
      pending.activePreset = null;
    }
    if ("discordRpc" in patch || "discordClientId" in patch) discord.lastKey = "";
    flush();
    applyAll();
    if (!opts.silent) ui.sync();
  };
  const replaceState = (next) => {
    state = next;
    cfg = { ...next.config };
    applyAll();
    ui.render();
  };
  const PRESET_KEYS = ["blur", "dim", "saturation", "contentAlpha", "bgMode", "slideInterval", "accentMode", "accent", "rounded", "glow", "playerGlass", "hideWaveArt", "beatSync", "beatIntensity", "bgPulse", "thumbStyle", "thumbRainbow", "visualizer", "visualizerOpacity", "reducedMotion", "cleanVibe"];
  const BUILTIN_PRESETS = {
    "Неон": { blur: 6, dim: 45, saturation: 140, contentAlpha: 50, accentMode: "fixed", accent: "#ff2d95", rounded: true, glow: true, playerGlass: 22, beatSync: true, beatIntensity: 85, bgPulse: true, thumbStyle: "pinwheel", thumbRainbow: true, visualizer: "mirror", visualizerOpacity: 85, reducedMotion: false },
    "Стекло": { blur: 28, dim: 25, saturation: 120, contentAlpha: 35, accentMode: "cover", rounded: true, glow: false, playerGlass: 32, beatSync: true, beatIntensity: 45, bgPulse: false, thumbStyle: "orb", thumbRainbow: false, visualizer: "wave", visualizerOpacity: 55, reducedMotion: false },
    "Обложка": { blur: 12, dim: 40, saturation: 110, contentAlpha: 55, accentMode: "cover", rounded: true, glow: true, playerGlass: 18, beatSync: true, beatIntensity: 70, bgPulse: true, thumbStyle: "pinwheel", thumbRainbow: false, visualizer: "bars", visualizerOpacity: 70, reducedMotion: false },
    "Минимал": { blur: 0, dim: 55, saturation: 90, contentAlpha: 75, accentMode: "fixed", accent: "#e8e8e8", rounded: true, glow: false, playerGlass: 10, beatSync: false, beatIntensity: 40, bgPulse: false, thumbStyle: "default", thumbRainbow: false, visualizer: "off", visualizerOpacity: 50, reducedMotion: true }
  };

  // accent
  try {
    CSS.registerProperty({ name: "--ymm-accent", syntax: "<color>", inherits: true, initialValue: "#ff5c4d" });
    CSS.registerProperty({ name: "--ymm-accent-ui", syntax: "<color>", inherits: true, initialValue: "#ff5c4d" });
  } catch {
  }
  const readable = (hex) => {
    let [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let l = (max + min) / 2;
    if (l >= 0.55) return hex;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let hh = 0;
    if (d) hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
    l = 0.66;
    const sat = Math.min(1, s * 1.25);
    const c = (1 - Math.abs(2 * l - 1)) * sat;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = l - c / 2;
    const [rr, gg, bb] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + [rr, gg, bb].map((v) => Math.round(clamp((v + m) * 255, 0, 255)).toString(16).padStart(2, "0")).join("");
  };
  const accent = {
    current: "#ff5c4d",
    ui: "#ff5c4d",
    coverUrl: null,
    coverHex: null,
    coverHexUrl: null,
    set(hex) {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
      this.current = hex;
      this.ui = readable(hex);
      root.style.setProperty("--ymm-accent", hex);
      root.style.setProperty("--ymm-accent-ui", this.ui);
      root.style.setProperty("--ymm-on-accent", luminance(hex) > 0.42 ? "#0b0b0b" : "#ffffff");
      root.style.setProperty("--ymm-on-accent-ui", luminance(this.ui) > 0.42 ? "#0b0b0b" : "#ffffff");
      thumb.update();
    },
    resolve() {
      if (!cfg) return;
      if (cfg.accentMode === "fixed") this.set(cfg.accent);
      else if (cfg.accentMode === "cover") {
        this.set(this.coverHex || cfg.accent);
        if (this.coverUrl && this.coverHexUrl !== this.coverUrl) this.fetchCover(this.coverUrl);
      }
      else this.set("#ffdb4d");
    },
    onCover(url) {
      if (!url || url === this.coverUrl) return;
      this.coverUrl = url;
      if (cfg && cfg.accentMode === "cover") this.fetchCover(url);
    },
    async fetchCover(url) {
      if (this.fetching === url) return;
      this.fetching = url;
      try {
        const hex = await api.coverColor(url);
        if (hex && url === this.coverUrl) {
          this.coverHex = hex;
          this.coverHexUrl = url;
          if (cfg.accentMode === "cover") this.set(hex);
        }
      } catch {
      }
      if (this.fetching === url) this.fetching = null;
    }
  };

  // track info
  const track = {
    title: "", artist: "", album: "", cover: "",
    read() {
      const md = navigator.mediaSession && navigator.mediaSession.metadata;
      if (md && md.title) {
        this.title = md.title;
        this.artist = md.artist || "";
        this.album = md.album || "";
        const art = (md.artwork || []).filter((a) => a && a.src && /^https:/.test(a.src));
        this.cover = art.length ? art[art.length - 1].src : "";
      }
      if (!this.cover) {
        const img = $(`${SEL.cover} img`);
        if (img && /^https:/.test(img.src)) this.cover = img.src;
      }
      return this;
    }
  };

  // audio engine
  const audio = {
    ctx: null, analyser: null, beatAn: null, freq: null, bass: null, nodes: new Map(), attached: 0, playing: false, el: null,
    needed() {
      return cfg && !cfg.reducedMotion && (cfg.beatSync || cfg.visualizer !== "off");
    },
    ensureCtx() {
      if (this.ctx) return;
      this.ctx = new AudioContext({ latencyHint: "playback" });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.7;
      this.analyser.minDecibels = -85;
      this.analyser.maxDecibels = -18;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      // Бит: быстрый отклик, широкий диапазон - ловим атаку бочки.
      this.beatAn = this.ctx.createAnalyser();
      this.beatAn.fftSize = 1024;
      this.beatAn.smoothingTimeConstant = 0.35;
      this.beatAn.minDecibels = -70;
      this.beatAn.maxDecibels = -6;
      this.bass = new Uint8Array(this.beatAn.frequencyBinCount);
    },
    connect(el) {
      if (!this.needed()) return;
      this.ensureCtx();
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      let entry = this.nodes.get(el);
      if (!entry) {
        let stream;
        try {
          stream = el.captureStream ? el.captureStream() : null;
        } catch (e) {
          console.warn("[YMusicMod] captureStream", e && e.message);
          return;
        }
        if (!stream) return;
        entry = { stream, src: null };
        this.nodes.set(el, entry);
        const rebuild = () => this.rebuild(el);
        stream.addEventListener("addtrack", rebuild);
        stream.addEventListener("removetrack", rebuild);
        el.addEventListener("playing", rebuild);
      }
      this.rebuild(el);
    },
    rebuild(el) {
      const entry = this.nodes.get(el);
      if (!entry || !this.ctx) return;
      // Плеер переиспользует <audio>: на каждый трек captureStream добавляет новую дорожку,
      // а старые остаются "живыми", но молчат. Слушаем только последнюю, старые закрываем.
      const all = entry.stream.getAudioTracks().filter((t) => t.readyState === "live");
      const latest = all[all.length - 1];
      for (const t of all) {
        if (t === latest) continue;
        entry.stream.removeTrack(t);
        t.stop();
      }
      const tracks = latest ? [latest] : [];
      const key = latest ? latest.id : "";
      if (entry.key === key) return;
      if (entry.src) {
        try {
          entry.src.disconnect();
        } catch {
        }
        entry.src = null;
      }
      entry.key = key;
      if (!tracks.length) return;
      try {
        entry.src = this.ctx.createMediaStreamSource(new MediaStream(tracks));
        entry.src.connect(this.analyser);
        entry.src.connect(this.beatAn);
        this.attached = [...this.nodes.values()].filter((e) => e.src).length;
        ui.refreshStatus();
      } catch (e) {
        console.warn("[YMusicMod] stream source", e && e.message);
      }
    },
    init() {
      if (window.__ymmAudio) window.__ymmAudio.onAdd((el) => {
        el.addEventListener("play", () => this.connect(el));
        if (!el.paused) this.connect(el);
      });
    },
    reconnectAll() {
      if (window.__ymmAudio) window.__ymmAudio.elements.forEach((el) => this.connect(el));
    },
    pollPlaying() {
      let playing = false;
      let el = null;
      if (window.__ymmAudio) {
        for (const a of window.__ymmAudio.elements) {
          if (!a.paused && !a.ended && a.readyState > 2) {
            playing = true;
            if (!el || a.volume > el.volume) el = a;
          }
        }
      }
      if (!playing && navigator.mediaSession && navigator.mediaSession.playbackState === "playing") playing = true;
      this.el = el;
      if (playing !== this.playing) {
        this.playing = playing;
        root.classList.toggle("ymm-playing", playing);
        if (playing && this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        discord.push(true);
        loop.kick();
      }
    }
  };

  // beat + visualizer loop
  const beat = { hist: new Float32Array(6), idx: 0, pulse: 0, level: 0, lo: 1, hi: 0, last: 0 };
  const vis = { canvas: null, ctx2d: null, w: 0, h: 0, dpr: 1, smooth: new Float32Array(96), peaks: new Float32Array(96) };
  const targets = { bg: null, player: null };
  const loop = {
    raf: 0,
    kick() {
      if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    },
    tick: () => {
      loop.raf = 0;
      const active = audio.needed() && audio.analyser && !document.hidden;
      if (!active) {
        setBeat(0);
        vis.clear && vis.clear();
        return;
      }
      audio.analyser.getByteFrequencyData(audio.freq);
      if (cfg.beatSync) updateBeat();
      else setBeat(0);
      if (cfg.visualizer !== "off") drawVisualizer();
      else if (vis.clear) vis.clear();
      if (audio.playing || beat.pulse > 0.01 || vis.energy > 0.01) loop.kick();
      else {
        setBeat(0);
        if (vis.clear) vis.clear();
      }
    }
  };
  function setBeat(v) {
    if (Math.abs(v - beat.level) < 0.002 && v !== 0) return;
    if (v === 0 && beat.level === 0) return;
    beat.level = v;
    const s = v.toFixed(3);
    if (targets.bg) targets.bg.style.setProperty("--ymm-beat", s);
    if (targets.player) targets.player.style.setProperty("--ymm-beat", s);
  }
  function updateBeat() {
    const an = audio.beatAn;
    an.getByteFrequencyData(audio.bass);
    const binHz = audio.ctx.sampleRate / an.fftSize;
    const hi = Math.max(2, Math.ceil(150 / binHz));
    let e = 0;
    for (let i = 1; i <= hi; i++) e += audio.bass[i] * audio.bass[i];
    e = Math.sqrt(e / hi) / 255;
    let min = 1;
    for (let i = 0; i < beat.hist.length; i++) min = Math.min(min, beat.hist[i]);
    beat.hist[beat.idx++ % beat.hist.length] = e;
    const rise = e - min;
    const now = performance.now();
    if (rise > 0.08 && e > 0.25 && now - beat.last > 110) {
      beat.pulse = Math.max(beat.pulse, clamp(0.45 + rise * 1.6, 0, 1));
      beat.last = now;
    } else beat.pulse *= 0.86;
    beat.lo = Math.min(e, beat.lo + 0.002);
    beat.hi = Math.max(e, beat.hi - 0.002);
    const norm = beat.hi - beat.lo > 0.05 ? (e - beat.lo) / (beat.hi - beat.lo) : 0;
    setBeat(Math.max(beat.pulse, norm * 0.22) * (cfg.beatIntensity / 100));
  }
  function ensureCanvas() {
    if (vis.canvas && vis.canvas.isConnected) return true;
    vis.canvas = h("canvas", { id: "ymmod-vis", "aria-hidden": "true" });
    document.body.appendChild(vis.canvas);
    vis.ctx2d = vis.canvas.getContext("2d");
    vis.clear = () => {
      if (vis.ctx2d && vis.w) vis.ctx2d.clearRect(0, 0, vis.w, vis.h);
      vis.energy = 0;
    };
    layoutCanvas();
    return true;
  }
  function layoutCanvas() {
    if (!vis.canvas) return;
    const p = targets.player && targets.player.isConnected ? targets.player : $(SEL.playerRoot);
    const r = p ? p.getBoundingClientRect() : null;
    const visible = r && r.height > 20 && r.top > 60 && r.bottom <= innerHeight + 2 && !$('[class*="VibePage_root"]');
    vis.canvas.style.display = visible ? "" : "none";
    if (!visible) return;
    const H = cfg && cfg.visualizer === "wave" ? 70 : 56;
    const dpr = window.devicePixelRatio || 1;
    Object.assign(vis.canvas.style, { left: `${r.left + 12}px`, width: `${Math.max(0, r.width - 24)}px`, top: `${r.top - H}px`, height: `${H}px` });
    const w = Math.round(Math.max(1, r.width - 24) * dpr);
    const hh = Math.round(H * dpr);
    if (vis.canvas.width !== w || vis.canvas.height !== hh) {
      vis.canvas.width = w;
      vis.canvas.height = hh;
    }
    vis.w = w;
    vis.h = hh;
    vis.dpr = dpr;
  }
  function drawVisualizer() {
    ensureCanvas();
    const c = vis.ctx2d;
    const { w, h: H, dpr } = vis;
    c.clearRect(0, 0, w, H);
    const f = audio.freq;
    const N = cfg.visualizer === "mirror" ? 48 : 72;
    // Логарифмическая шкала 35 Гц…16 кГц - низы не съедают всю ширину.
    const binHz = audio.ctx.sampleRate / audio.analyser.fftSize;
    const fmin = 35, fmax = 16000;
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const a = Math.floor((fmin * (fmax / fmin) ** (i / N)) / binHz);
      const b = Math.max(a + 1, Math.floor((fmin * (fmax / fmin) ** ((i + 1) / N)) / binHz));
      let m = 0;
      for (let j = a; j < b && j < f.length; j++) m = Math.max(m, f[j]);
      const v = (m / 255) ** 1.6 * (0.75 + (i / N) * 0.5);
      vis.smooth[i] = v > vis.smooth[i] ? v * 0.6 + vis.smooth[i] * 0.4 : vis.smooth[i] * 0.88;
      vis.peaks[i] = Math.max(vis.peaks[i] * 0.97 - 0.002, vis.smooth[i]);
      energy += vis.smooth[i];
    }
    vis.energy = energy / N;
    const col = accent.ui;
    const alpha = cfg.visualizerOpacity / 100;
    const grad = c.createLinearGradient(0, H, 0, 0);
    grad.addColorStop(0, col + "ff");
    grad.addColorStop(1, col + "10");
    c.globalAlpha = alpha;
    c.fillStyle = grad;
    c.shadowColor = col;
    c.shadowBlur = 10 * dpr;
    if (cfg.visualizer === "wave") {
      c.beginPath();
      c.moveTo(0, H);
      const pts = [];
      for (let i = 0; i < N; i++) pts.push([(i / (N - 1)) * w, H - vis.smooth[i] * (H - 4 * dpr)]);
      c.lineTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < N; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        c.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      }
      c.lineTo(w, H);
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = col;
      c.lineWidth = 2 * dpr;
      c.stroke();
    } else {
      const count = cfg.visualizer === "mirror" ? N * 2 : N;
      const gap = 3 * dpr;
      const bw = Math.max(1, (w - gap * (count - 1)) / count);
      for (let k = 0; k < count; k++) {
        const i = cfg.visualizer === "mirror" ? (k < N ? N - 1 - k : k - N) : k;
        const bh = Math.max(2 * dpr, vis.smooth[i] * (H - 6 * dpr));
        const x = k * (bw + gap);
        const r = Math.min(bw / 2, 3 * dpr);
        c.beginPath();
        c.roundRect(x, H - bh, bw, bh, [r, r, 0, 0]);
        c.fill();
        const py = H - Math.max(2 * dpr, vis.peaks[i] * (H - 6 * dpr)) - 3 * dpr;
        c.fillRect(x, py, bw, 1.5 * dpr);
      }
    }
    c.globalAlpha = 1;
    c.shadowBlur = 0;
  }

  // background
  const bg = {
    host: null, layers: [], active: 0, currentName: null, slideTimer: 0,
    ensure() {
      if (this.host && this.host.isConnected) return;
      this.host = h("div", { id: "ymmod-bg", "aria-hidden": "true" }, h("div", { class: "ymm-slot" }), h("div", { class: "ymm-slot" }), h("div", { class: "ymm-shade" }));
      document.body.prepend(this.host);
      this.layers = [...this.host.querySelectorAll(".ymm-slot")];
      targets.bg = this.host;
      this.currentName = null;
    },
    fileFor() {
      if (!cfg || !state) return null;
      const list = cfg.backgrounds;
      if (cfg.bgMode === "daynight") {
        const hr = new Date().getHours();
        const { dayStartHour: d, nightStartHour: n } = cfg;
        const isDay = d < n ? hr >= d && hr < n : hr >= d || hr < n;
        return (isDay ? cfg.dayFile : cfg.nightFile) || cfg.backgroundFile || list[0] || null;
      }
      return cfg.backgroundFile || null;
    },
    show(name) {
      this.ensure();
      root.classList.toggle("ymm-has-bg", Boolean(name));
      if (name === this.currentName) return;
      const file = name ? state.files.find((f) => f.name === name) : null;
      if (name && !file) return;
      this.currentName = name;
      const next = this.layers[1 - this.active];
      const prev = this.layers[this.active];
      next.replaceChildren();
      if (!name) {
        prev.classList.remove("on");
        next.classList.remove("on");
        return;
      }
      let media;
      if (file.kind === "video") {
        media = h("video", { src: file.url, muted: true, loop: true, playsinline: true, autoplay: true, preload: "auto", disablepictureinpicture: true });
        media.muted = true;
        media.addEventListener("canplay", () => this.reveal(next, prev), { once: true });
      } else {
        media = h("img", { src: file.url, decoding: "async", alt: "" });
        media.addEventListener("load", () => this.reveal(next, prev), { once: true });
      }
      media.addEventListener("error", () => console.warn("[YMusicMod] bg failed", file.url), { once: true });
      next.append(media);
      this.active = 1 - this.active;
      this.syncVideo();
    },
    reveal(next, prev) {
      next.classList.add("on");
      prev.classList.remove("on");
      setTimeout(() => {
        if (!prev.classList.contains("on")) prev.replaceChildren();
      }, 1400);
    },
    syncVideo() {
      if (!this.host) return;
      const still = document.hidden || cfg.reducedMotion;
      this.host.querySelectorAll("video").forEach((v) => (still ? v.pause() : v.play().catch(() => {})));
    },
    next(step = 1) {
      const list = cfg.backgrounds;
      if (!list.length) return;
      const i = list.indexOf(cfg.backgroundFile);
      setOpt({ backgroundFile: list[(i + step + list.length) % list.length] }, { keepPreset: true });
    },
    schedule() {
      const key = `${cfg.bgMode}|${cfg.slideInterval}|${cfg.backgrounds.length}`;
      if (key === this.slideKey) return;
      this.slideKey = key;
      clearInterval(this.slideTimer);
      if (cfg.bgMode === "slideshow" && cfg.backgrounds.length > 1) this.slideTimer = setInterval(() => this.next(1), cfg.slideInterval * 60000);
      else if (cfg.bgMode === "daynight") this.slideTimer = setInterval(() => this.show(this.fileFor()), 60000);
    }
  };

  // progress thumb
  const thumb = {
    last: "",
    update() {
      if (!cfg) return;
      const col = cfg.thumbRainbow ? "#ff2d55" : accent.ui;
      const key = cfg.thumbStyle + col;
      if (key === this.last) return;
      this.last = key;
      let svg = "";
      if (cfg.thumbStyle === "pinwheel") {
        const blade = (deg) => `<text x="16" y="7" transform="rotate(${deg} 16 16)">Г</text>`;
        svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="10" text-anchor="middle" fill="${col}">${[0, 90, 180, 270].map(blade).join("")}</g><circle cx="16" cy="16" r="3.2" fill="#fff"/><circle cx="16" cy="16" r="1.6" fill="${col}"/></svg>`;
      } else if (cfg.thumbStyle === "orb") {
        svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><radialGradient id="g" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="url(#g)"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>`;
      }
      root.style.setProperty("--ymm-thumb", svg ? `url("data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}")` : "none");
    }
  };

  // stylesheet
  const style = h("style", { id: "ymmod-style" });
  document.head.appendChild(style);
  let styleKey = "";
  function buildCss() {
    const c = cfg;
    const P = '[class*="PlayerBarDesktopWithBackgroundProgressBar_';
    const parts = [];
    parts.push(`
:root{--ymm-beat:0;}
#ymmod-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:#000;contain:strict;}
#ymmod-bg .ymm-slot{position:absolute;inset:-3%;opacity:0;transition:opacity 1.2s ease;transform:scale(calc(1 + var(--ymm-beat) * var(--ymm-bgpulse, 0)));will-change:opacity,transform;}
#ymmod-bg .ymm-slot.on{opacity:1;}
#ymmod-bg .ymm-slot>img,#ymmod-bg .ymm-slot>video{width:100%;height:100%;object-fit:cover;filter:blur(var(--ymm-blur)) saturate(var(--ymm-sat));}
#ymmod-bg .ymm-shade{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,rgba(0,0,0,calc(var(--ymm-dim) * .75)) 0%,rgba(0,0,0,calc(var(--ymm-dim) + .12)) 100%);}
html:not(.ymm-has-bg) #ymmod-bg{display:none;}
#ymmod-vis{position:fixed;z-index:3;pointer-events:none;}
html:not(.ymm-playing) #ymmod-vis{opacity:.0;transition:opacity .6s ease;}
html.ymm-playing #ymmod-vis{opacity:1;transition:opacity .3s ease;}
`);
    parts.push(`
html.ymm-has-bg,html.ymm-has-bg body{background:transparent !important;}
html.ymm-has-bg,html.ymm-has-bg .ym-dark-theme,html.ymm-has-bg .ym-light-theme{
  --ym-background-color-primary-enabled-basic:transparent !important;
  --ym-background-color-primary-enabled-content:rgba(14,14,17,var(--ymm-alpha)) !important;
  --ym-background-color-primary-enabled-header:rgba(8,8,10,calc(var(--ymm-alpha) * .6)) !important;
  --ym-background-color-primary-enabled-player:rgba(12,12,15,var(--ymm-alpha)) !important;
  --ym-background-color-primary-enabled-popover:rgba(20,20,24,.94) !important;
  --ym-background-color-primary-enabled-menu:rgba(20,20,24,.94) !important;
  --ym-background-color-primary-enabled-vibe:transparent !important;
  --player-average-color-background:rgba(12,12,15,var(--ymm-alpha)) !important;
}`);
    if (c.hideWaveArt) {
      parts.push(`[class*="Background_media"]{opacity:0 !important;}[class*="Background_root"]{background-color:transparent !important;}
html.ymm-has-bg [class*="DefaultLayout_rootNewVibe"]{background:transparent !important;}
[class*="VibeArtistCover_root"]{opacity:0 !important;pointer-events:none;}`);
    }
    if (c.cleanVibe) {
      parts.push(`
[class*="VibeArtistCover_root"]{display:none !important;}
[class*="DefaultLayout_rootNewVibe"]{background:radial-gradient(ellipse 70% 80% at 75% 45%,color-mix(in srgb,var(--ymm-accent-ui) 20%,#0c0c10) 0%,#0a0a0d 70%) !important;}
html.ymm-has-bg [class*="DefaultLayout_rootNewVibe"]{background:linear-gradient(90deg,rgba(0,0,0,.62) 0%,rgba(0,0,0,.42) 45%,rgba(0,0,0,.3) 100%) !important;}
[class*="VibePage_root"]{text-shadow:0 1px 10px rgba(0,0,0,.55);}
[class*="VibePage_vibeAnimation"],[class*="VibeWidgetAnimation_root"]{display:none !important;}
.ymm-artist [class*="WheelItem_coverContainer"]{border-radius:50% !important;overflow:hidden;position:relative;
  background:radial-gradient(circle at 32% 28%,color-mix(in oklab,var(--ymm-accent-ui) 65%,white) 0%,var(--ymm-accent-ui) 45%,color-mix(in oklab,var(--ymm-accent-ui) 45%,black) 100%) !important;}
.ymm-artist [class*="WheelItem_coverContainer"] img{opacity:0 !important;}
.ymm-artist [class*="WheelItem_coverContainer"]::after{content:"♪";position:absolute;inset:0;display:grid;place-items:center;font-size:30px;font-weight:700;color:var(--ymm-on-accent-ui);}
[class*="VibePlayerbarMeta_root"],[class*="VibePlayerBar_button"]{backdrop-filter:blur(14px);}
`);
    }
    if (c.accentMode !== "off") {
      parts.push(`
:root,.ym-dark-theme,.ym-light-theme{
  --ym-controls-color-primary-default-enabled:var(--ymm-accent) !important;
  --ym-controls-color-primary-default-hovered:color-mix(in oklab,var(--ymm-accent) 86%,black) !important;
  --ym-controls-color-primary-default-pressed:color-mix(in oklab,var(--ymm-accent) 70%,white) !important;
  --ym-controls-color-primary-default-focused_stroke:color-mix(in srgb,var(--ymm-accent) 50%,transparent) !important;
  --ym-controls-color-primary-on_default-enabled:var(--ymm-on-accent) !important;
  --ym-controls-color-primary-outline-selected_stroke:var(--ymm-accent) !important;
  --ym-logo-color-primary-variant:var(--ymm-accent) !important;
  --ym-logo-color-primary-player:var(--ymm-accent) !important;
  --ym-logo-color-primary-text:var(--ymm-accent) !important;
}
:root{transition:--ymm-accent .9s ease,--ymm-accent-ui .9s ease;}`);
    }
    // Прогресс-бар: градиент акцента + кастомный ползунок.
    parts.push(`
${P}slider"]{--ymm-a2:color-mix(in oklab,var(--ymm-accent-ui) 60%,white);}
${P}slider"]::before{background:linear-gradient(90deg,var(--ymm-accent-ui),var(--ymm-a2)) !important;box-shadow:0 0 calc(6px + var(--ymm-beat) * 14px) color-mix(in srgb,var(--ymm-accent-ui) 70%,transparent);}
`);
    if (c.thumbStyle !== "default") {
      parts.push(`
${P}thumb"]{opacity:1 !important;background:transparent !important;box-shadow:none !important;overflow:visible !important;position:relative !important;}
${P}thumb"]::before{content:"" !important;position:absolute !important;top:50% !important;left:50% !important;width:22px !important;height:22px !important;margin:-11px 0 0 -11px !important;
  background:var(--ymm-thumb) center/contain no-repeat !important;pointer-events:none !important;
  animation:ymmSpin 1.4s linear infinite${c.thumbRainbow ? ", ymmHue 4s linear infinite" : ""} !important;filter:drop-shadow(0 0 5px var(--ymm-accent-ui));}
html:not(.ymm-playing) ${P}thumb"]::before{animation-play-state:paused !important;}
${c.thumbStyle === "orb" ? `${P}thumb"]::before{animation:ymmBreath 1.6s ease-in-out infinite${c.thumbRainbow ? ", ymmHue 4s linear infinite" : ""} !important;}` : ""}
@keyframes ymmSpin{to{transform:rotate(360deg);}}
@keyframes ymmBreath{0%,100%{transform:scale(.85);}50%{transform:scale(1.1);}}
@keyframes ymmHue{to{filter:drop-shadow(0 0 5px var(--ymm-accent-ui)) hue-rotate(360deg);}}
`);
    }
    // Обложка и бит.
    parts.push(`
${P}coverContainer"]{transform:scale(calc(1 + var(--ymm-beat) * .09));transition:transform 60ms linear;will-change:transform;}
${P}coverContainer"] img{box-shadow:0 0 calc(var(--ymm-beat) * 22px) calc(var(--ymm-beat) * 3px) color-mix(in srgb,var(--ymm-accent-ui) 75%,transparent);border-radius:inherit;}
`);
    // и даём попапу собственную стеклянную карточку + подпись процента.
    parts.push(`
[class*="CommonLayout_playerBar"],${P}root"]{position:relative;z-index:50 !important;}
${P}root"]{overflow:visible !important;}
[class*="ChangeVolume_sliderContainer"]{z-index:2147483000 !important;}
[class*="ChangeVolume_wrapperSlider"]{background:rgba(16,16,20,.88) !important;backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);
  border:1px solid color-mix(in srgb,var(--ymm-accent-ui) 35%,rgba(255,255,255,.08)) !important;box-shadow:0 12px 32px rgba(0,0,0,.55),0 0 18px color-mix(in srgb,var(--ymm-accent-ui) 25%,transparent) !important;position:relative;}
[class*="ChangeVolume_wrapperSlider"] input[type=range]{--default-thumb-color:#fff;}
[class*="ChangeVolume_wrapperSlider"] input[type=range]::before{background:linear-gradient(90deg,var(--ymm-accent-ui),color-mix(in oklab,var(--ymm-accent-ui) 55%,white)) !important;}
[class*="ChangeVolume_wrapperSlider"] input[type=range]::-webkit-slider-thumb{background:#fff !important;box-shadow:0 0 0 3px color-mix(in srgb,var(--ymm-accent-ui) 55%,transparent),0 0 10px rgba(255,255,255,.7) !important;}
.ymm-vol-label{position:absolute;top:-26px;left:50%;transform:translateX(-50%);padding:2px 8px;border-radius:999px;font-weight:600;font-size:11px;line-height:16px;font-family:inherit;color:var(--ymm-on-accent-ui);background:var(--ymm-accent-ui);white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.4);}
`);
    if (c.rounded) {
      parts.push(`:root,.ym-dark-theme,.ym-light-theme{--ym-radius-size-m:.875rem !important;--ym-radius-size-l:1.25rem !important;--ym-radius-size-xl:1.75rem !important;--ym-radius-size-xxl:2.25rem !important;}`);
    }
    if (c.playerGlass > 0) {
      parts.push(`${P}player__"]{backdrop-filter:blur(var(--ymm-glass)) saturate(1.35) !important;-webkit-backdrop-filter:blur(var(--ymm-glass)) saturate(1.35) !important;}
${P}player__"]{border-color:rgba(255,255,255,.07) !important;}`);
    }
    if (c.glow) {
      parts.push(`
${P}root"]{border-radius:var(--ym-radius-size-l);box-shadow:0 0 calc(14px + var(--ymm-beat) * 30px) calc(var(--ymm-beat) * 4px) color-mix(in srgb,var(--ymm-accent-ui) calc(35% + var(--ymm-beat) * 40%),transparent);animation:ymmGlow 3.2s ease-in-out infinite;}
html:not(.ymm-playing) ${P}root"]{animation-play-state:paused;}
@keyframes ymmGlow{0%,100%{outline:1px solid color-mix(in srgb,var(--ymm-accent-ui) 18%,transparent);}50%{outline:1px solid color-mix(in srgb,var(--ymm-accent-ui) 45%,transparent);}}
${P}root"]{outline-offset:-1px;}`);
    }
    if (c.reducedMotion) {
      parts.push(`${P}thumb"]::before,${P}root"]{animation:none !important;}#ymmod-bg .ymm-slot{transition:none !important;transform:none !important;}`);
    }
    return parts.join("\n");
  }
  const STRUCTURAL = ["hideWaveArt", "cleanVibe", "accentMode", "thumbStyle", "thumbRainbow", "rounded", "glow", "reducedMotion"];
  function applyVars() {
    const s = root.style;
    s.setProperty("--ymm-blur", `${cfg.blur}px`);
    s.setProperty("--ymm-dim", (cfg.dim / 100).toFixed(2));
    s.setProperty("--ymm-sat", (cfg.saturation / 100).toFixed(2));
    s.setProperty("--ymm-alpha", (cfg.contentAlpha / 100).toFixed(2));
    s.setProperty("--ymm-glass", `${cfg.playerGlass}px`);
    s.setProperty("--ymm-bgpulse", cfg.bgPulse && !cfg.reducedMotion ? "0.025" : "0");
  }
  function applyAll() {
    if (!cfg) return;
    const key = STRUCTURAL.map((k) => String(cfg[k])).join("|") + "|" + (cfg.playerGlass > 0);
    if (key !== styleKey) {
      styleKey = key;
      style.textContent = buildCss();
    }
    applyVars();
    accent.resolve();
    thumb.update();
    bg.show(bg.fileFor());
    bg.syncVideo();
    bg.schedule();
    if (audio.needed()) audio.reconnectAll();
    if (cfg.visualizer !== "off") {
      ensureCanvas();
      layoutCanvas();
    } else if (vis.clear) vis.clear();
    loop.kick();
    ui.setButtonHidden(cfg.hideButton);
    discord.push(false);
  }

  // volume
  const volume = {
    bound: new WeakSet(),
    scan() {
      document.querySelectorAll(SEL.volRoot).forEach((rootEl) => {
        if (this.bound.has(rootEl)) return;
        this.bound.add(rootEl);
        rootEl.addEventListener("wheel", (e) => {
          if (!cfg.volumeWheel) return;
          const input = rootEl.querySelector("input[type=range]");
          if (!input) return;
          e.preventDefault();
          const min = Number(input.min || 0), max = Number(input.max || 1);
          const step = (max - min) / 50;
          const v = clamp(Number(input.value) + (e.deltaY < 0 ? step : -step), min, max);
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(v));
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          this.label(rootEl, input, true);
        }, { passive: false });
        rootEl.addEventListener("input", () => {
          const input = rootEl.querySelector("input[type=range]");
          if (input) this.label(rootEl, input, true);
        });
        rootEl.addEventListener("mouseenter", () => {
          const input = rootEl.querySelector("input[type=range]");
          if (input) this.label(rootEl, input, false);
        });
      });
    },
    label(rootEl, input, flash) {
      const wrap = rootEl.querySelector('[class*="ChangeVolume_wrapperSlider"]');
      if (!wrap) return;
      let lab = wrap.querySelector(".ymm-vol-label");
      if (!lab) {
        lab = h("span", { class: "ymm-vol-label" });
        wrap.append(lab);
      }
      const min = Number(input.min || 0), max = Number(input.max || 1);
      lab.textContent = `${Math.round(((Number(input.value) - min) / (max - min || 1)) * 100)}%`;
      if (flash) {
        const container = rootEl.querySelector('[class*="ChangeVolume_sliderContainer"]');
        if (container) {
          container.style.opacity = "1";
          clearTimeout(this.t);
          this.t = setTimeout(() => (container.style.opacity = ""), 900);
        }
      }
    }
  };

  // discord
  const discord = {
    lastKey: "", timer: 0,
    push(force) {
      if (!cfg || !cfg.discordRpc) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.send(force), 400);
    },
    send(force) {
      track.read();
      const el = audio.el || [...((window.__ymmAudio && window.__ymmAudio.elements) || [])].find((x) => x.currentTime > 0);
      const pos = el ? el.currentTime : NaN;
      const dur = el && Number.isFinite(el.duration) ? el.duration : NaN;
      const paused = !audio.playing;
      const key = track.title ? `${track.title}|${track.artist}|${paused ? "p" + Math.round(pos || 0) : Math.round((Date.now() / 1000 - (pos || 0)) / 3)}` : "none";
      if (!force && key === this.lastKey) return;
      this.lastKey = key;
      const link = $(`${SEL.playerRoot} a[href*="/track/"]`) || $('[class*="VibePlayerBar_root"] a[href*="/track/"]');
      const trackUrl = link ? new URL(link.getAttribute("href"), "https://music.yandex.ru").href.replace(/^[a-z-]+:\/\/[^/]+/, "https://music.yandex.ru") : "";
      api.discord(track.title ? { title: track.title, artist: track.artist, album: track.album, cover: track.cover, position: pos, duration: dur, paused, trackUrl } : null)
        .then((st) => {
          state.discord = st;
          ui.refreshStatus();
        }).catch(() => {});
    }
  };

  // mini player
  const mini = {
    on: false, timer: 0,
    btn(label, transport) {
      const scope = (transport && $(`${SEL.playerRoot} [class*="BaseSonataControlsDesktop_root"]`)) || $(SEL.playerRoot) || $('[class*="VibePlayerBar_root"]') || document;
      return [...scope.querySelectorAll("button[aria-label]")].find((b) => label.test(b.getAttribute("aria-label")));
    },
    snapshot() {
      track.read();
      const el = audio.el || [...((window.__ymmAudio && window.__ymmAudio.elements) || [])].find((a) => a.currentTime > 0);
      const like = this.btn(/^Нравится$/);
      return {
        title: track.title, artist: track.artist, cover: track.cover, playing: audio.playing,
        position: el ? el.currentTime : 0, duration: el && Number.isFinite(el.duration) ? el.duration : 0,
        liked: like ? like.getAttribute("aria-pressed") === "true" : false,
        accent: accent.ui, onAccent: luminance(accent.ui) > 0.42 ? "#0b0b0b" : "#ffffff"
      };
    },
    push() {
      api.miniState(this.snapshot()).catch(() => {});
    },
    async toggle(v = !this.on) {
      this.on = await api.mini(v);
      clearInterval(this.timer);
      if (this.on) {
        this.push();
        this.timer = setInterval(() => this.push(), 500);
      }
      ui.sync();
    },
    command(cmd, val) {
      const click = (re) => {
        const b = this.btn(re, cmd !== "like");
        if (b) b.click();
      };
      if (cmd === "toggle") click(/^(Пауза|Воспроизведение)$/);
      else if (cmd === "next") click(/^Следующая песня$/);
      else if (cmd === "prev") click(/^Предыдущая песня$/);
      else if (cmd === "like") click(/^Нравится$/);
      else if (cmd === "seek") {
        const input = $('[class*="VibePage_root"] input[class*="VibePlayerbarMeta_slider"]') || $(`${SEL.playerRoot} input[type=range][class*="PlayerBarDesktopWithBackgroundProgressBar_slider"]`) || $(`${SEL.playerRoot} input[type=range]`);
        if (input) {
          const max = Number(input.max || 0);
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(clamp(val, 0, 1) * max));
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      setTimeout(() => this.push(), 150);
    }
  };
  window.__ymmMiniCmd = (cmd, val) => mini.command(cmd, val);
  window.__ymmMiniClosed = () => {
    mini.on = false;
    clearInterval(mini.timer);
    ui.sync();
  };

  // toast
  let toastEl = null;
  function toast(text) {
    if (!ui.shadow) return;
    if (!toastEl) {
      toastEl = h("div", { class: "toast" });
      ui.shadow.append(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  // hotkeys
  const HOTKEYS = [
    ["Y", "Панель кастомизации", () => ui.toggle()],
    ["B", "Пульс под бит", () => {
      setOpt({ beatSync: !cfg.beatSync });
      toast(`Пульс: ${cfg.beatSync ? "вкл" : "выкл"}`);
    }],
    ["V", "Визуализатор: режим", () => {
      const order = ["off", "bars", "wave", "mirror"];
      setOpt({ visualizer: order[(order.indexOf(cfg.visualizer) + 1) % order.length] });
      toast(`Визуализатор: ${VIS_LABEL[cfg.visualizer]}`);
    }],
    ["P", "Следующий пресет", () => presets.cycle()],
    ["N", "Следующий фон", () => {
      bg.next(1);
      toast("Следующий фон");
    }],
    ["M", "Мини-плеер", () => mini.toggle()],
    ["R", "Меньше анимаций", () => {
      setOpt({ reducedMotion: !cfg.reducedMotion });
      toast(`Меньше анимаций: ${cfg.reducedMotion ? "вкл" : "выкл"}`);
    }]
  ];
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui.open) {
      ui.toggle(false);
      return;
    }
    if (!e.ctrlKey || !e.shiftKey || e.altKey) return;
    const t = e.composedPath()[0];
    if (t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && t.type !== "range" && t.type !== "checkbox") return;
    const hk = HOTKEYS.find(([k]) => e.code === `Key${k}`);
    if (!hk) return;
    e.preventDefault();
    e.stopPropagation();
    hk[2]();
  }, true);

  // presets
  const presets = {
    all() {
      return [...Object.keys(BUILTIN_PRESETS).map((n) => ({ name: n, builtin: true, data: BUILTIN_PRESETS[n] })), ...Object.entries(cfg.presets).map(([n, d]) => ({ name: n, builtin: false, data: d }))];
    },
    apply(name) {
      const p = this.all().find((x) => x.name === name);
      if (!p) return;
      const patch = {};
      for (const k of PRESET_KEYS) if (k in p.data) patch[k] = p.data[k];
      if (p.data.backgroundFile && cfg.backgrounds.includes(p.data.backgroundFile)) patch.backgroundFile = p.data.backgroundFile;
      patch.activePreset = name;
      setOpt(patch, { keepPreset: true });
      toast(`Пресет: ${name}`);
    },
    cycle() {
      const list = this.all();
      const i = list.findIndex((p) => p.name === cfg.activePreset);
      this.apply(list[(i + 1) % list.length].name);
    },
    save(name) {
      name = (name || "").trim().slice(0, 40);
      if (!name) return;
      const data = {};
      for (const k of PRESET_KEYS) data[k] = cfg[k];
      if (cfg.backgroundFile) data.backgroundFile = cfg.backgroundFile;
      setOpt({ presets: { ...cfg.presets, [name]: data }, activePreset: name }, { keepPreset: true });
      toast(`Сохранено: ${name}`);
    },
    remove(name) {
      const next = { ...cfg.presets };
      delete next[name];
      setOpt({ presets: next, activePreset: cfg.activePreset === name ? null : cfg.activePreset }, { keepPreset: true });
    }
  };

  // UI
  const VIS_LABEL = { off: "выкл", bars: "полосы", wave: "волна", mirror: "зеркало" };
  const ICONS = {
    bg: '<path d="M4 5h16v14H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m4 16 5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="15.5" cy="9" r="1.5" fill="currentColor"/>',
    color: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.2 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.9 17 3 12 3Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="11" r="1.3" fill="currentColor"/><circle cx="10" cy="7" r="1.3" fill="currentColor"/><circle cx="15" cy="7.2" r="1.3" fill="currentColor"/>',
    player: '<rect x="3" y="14" width="18" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 4.5v6l5-3z" fill="currentColor"/>',
    fx: '<path d="M3 12h3l2-6 4 12 3-9 2 3h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    presets: '<path d="M5 4h14v16l-7-4-7 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    more: '<circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>'
  };
  const TABS = [["bg", "Фон"], ["color", "Цвет"], ["player", "Плеер"], ["fx", "Эффекты"], ["presets", "Пресеты"], ["more", "Ещё"]];
  const SWATCHES = ["#ff5c4d", "#ff2d95", "#b44dff", "#5c7cff", "#2dd4ff", "#2dffa8", "#ffd23f", "#ff8a3d", "#e8e8e8"];
  const PANEL_CSS = `
:host{all:initial;font-family:"YS Text","Inter",system-ui,sans-serif;color:#f2f2f4;--a:var(--ymm-accent-ui,#ff5c4d);--on-a:var(--ymm-on-accent-ui,#000);}
*{box-sizing:border-box;}
.handle{position:fixed;left:0;top:58%;z-index:2147483646;width:10px;height:56px;border:0;padding:0;border-radius:0 12px 12px 0;cursor:pointer;
  background:linear-gradient(180deg,var(--a),color-mix(in oklab,var(--a) 55%,#000));box-shadow:0 0 14px color-mix(in srgb,var(--a) 60%,transparent);
  transition:width .22s cubic-bezier(.2,.8,.2,1),opacity .2s;opacity:.55;display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--on-a);}
.handle svg{width:18px;height:18px;opacity:0;transition:opacity .2s;}
.handle:hover,.handle.active{width:38px;opacity:1;}
.handle:hover svg,.handle.active svg{opacity:1;}
.handle.hidden{display:none;}
.panel{position:fixed;left:48px;top:50%;z-index:2147483647;width:368px;max-height:min(86vh,720px);display:flex;flex-direction:column;
  transform:translateY(-50%) translateX(-12px) scale(.97);opacity:0;pointer-events:none;transition:transform .26s cubic-bezier(.2,.8,.2,1),opacity .2s;
  background:linear-gradient(160deg,rgba(30,30,36,.86),rgba(14,14,18,.9));backdrop-filter:blur(28px) saturate(1.5);-webkit-backdrop-filter:blur(28px) saturate(1.5);
  border:1px solid rgba(255,255,255,.09);border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden;}
.panel.open{transform:translateY(-50%);opacity:1;pointer-events:auto;}
.head{display:flex;align-items:center;gap:10px;padding:16px 16px 10px;}
.logo{width:32px;height:32px;border-radius:9px;background:url("__YMMOD_LOGO__") center/cover;box-shadow:0 4px 14px rgba(255,45,122,.35);}
.title{font-size:15px;font-weight:700;letter-spacing:.2px;}
.sub{font-size:11px;opacity:.5;margin-top:1px;}
.x{margin-left:auto;width:28px;height:28px;border-radius:9px;border:0;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:15px;}
.x:hover{background:rgba(255,255,255,.14);}
.tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:0 12px 10px;}
.tab{display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 0 6px;border:0;border-radius:12px;background:transparent;color:rgba(255,255,255,.55);cursor:pointer;font-size:10px;font-family:inherit;transition:background .15s,color .15s;}
.tab svg{width:18px;height:18px;}
.tab:hover{background:rgba(255,255,255,.06);color:#fff;}
.tab.on{background:color-mix(in srgb,var(--a) 18%,transparent);color:var(--a);}
.body{overflow-y:auto;padding:4px 16px 16px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent;}
.sec{margin:6px 0 14px;}
.sec-t{font-size:11px;text-transform:uppercase;letter-spacing:.9px;opacity:.45;margin:14px 2px 8px;font-weight:600;}
.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:4px 12px;}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:42px;padding:6px 0;}
.row+.row{border-top:1px solid rgba(255,255,255,.05);}
.lbl{font-size:13px;}
.hint{font-size:11px;opacity:.45;margin-top:2px;}
.val{font-size:12px;opacity:.6;font-variant-numeric:tabular-nums;min-width:40px;text-align:right;}
.range{display:block;padding:8px 0 10px;}
.range .top{display:flex;justify-content:space-between;margin-bottom:8px;}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:99px;outline:none;cursor:pointer;
  background:linear-gradient(90deg,var(--a) 0 var(--p,50%),rgba(255,255,255,.12) var(--p,50%) 100%);}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px color-mix(in srgb,var(--a) 35%,transparent),0 2px 6px rgba(0,0,0,.4);transition:transform .12s;}
input[type=range]:active::-webkit-slider-thumb{transform:scale(1.18);}
.sw{position:relative;width:40px;height:24px;flex-shrink:0;}
.sw input{opacity:0;width:0;height:0;position:absolute;}
.sw span{position:absolute;inset:0;border-radius:99px;background:rgba(255,255,255,.14);transition:background .2s;cursor:pointer;}
.sw span::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .22s cubic-bezier(.2,.8,.2,1);box-shadow:0 2px 6px rgba(0,0,0,.35);}
.sw input:checked+span{background:var(--a);box-shadow:0 0 12px color-mix(in srgb,var(--a) 45%,transparent);}
.sw input:checked+span::after{transform:translateX(16px);}
.seg{display:flex;background:rgba(0,0,0,.3);border-radius:11px;padding:3px;gap:2px;width:100%;}
.seg button{flex:1;border:0;background:transparent;color:rgba(255,255,255,.65);font-weight:500;font-size:12px;font-family:inherit;padding:7px 4px;border-radius:8px;cursor:pointer;transition:background .15s,color .15s;}
.seg button:hover{color:#fff;}
.seg button.on{background:var(--a);color:var(--on-a);font-weight:600;box-shadow:0 2px 10px color-mix(in srgb,var(--a) 40%,transparent);}
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.thumb{position:relative;aspect-ratio:16/10;border-radius:11px;overflow:hidden;cursor:pointer;background:#111;border:2px solid transparent;transition:transform .15s,border-color .15s;}
.thumb:hover{transform:translateY(-2px);}
.thumb.on{border-color:var(--a);box-shadow:0 0 14px color-mix(in srgb,var(--a) 50%,transparent);}
.thumb img,.thumb video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;}
.thumb .badge{position:absolute;left:5px;bottom:5px;font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;background:rgba(0,0,0,.65);}
.thumb .del{position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:7px;border:0;background:rgba(0,0,0,.65);color:#fff;font-size:12px;cursor:pointer;opacity:0;transition:opacity .15s;}
.thumb:hover .del{opacity:1;}
.thumb .del:hover{background:#e5484d;}
.thumb .dn{position:absolute;top:4px;left:4px;display:flex;gap:3px;}
.thumb .dn button{width:20px;height:20px;border-radius:7px;border:0;background:rgba(0,0,0,.6);color:#fff;font-size:11px;cursor:pointer;padding:0;}
.thumb .dn button.on{background:var(--a);color:var(--on-a);}
.add{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;border:2px dashed rgba(255,255,255,.18);background:transparent;color:rgba(255,255,255,.6);font-size:22px;}
.add small{font-size:10px;}
.add:hover{border-color:var(--a);color:var(--a);}
.btn{border:0;border-radius:11px;padding:9px 14px;font-weight:600;font-size:12px;font-family:inherit;cursor:pointer;background:rgba(255,255,255,.08);color:#fff;transition:background .15s,transform .1s;}
.btn:hover{background:rgba(255,255,255,.15);}
.btn:active{transform:scale(.97);}
.btn.pri{background:var(--a);color:var(--on-a);box-shadow:0 4px 14px color-mix(in srgb,var(--a) 40%,transparent);}
.btn.pri:hover{filter:brightness(1.08);}
.btns{display:flex;gap:8px;flex-wrap:wrap;}
.btns .btn{flex:1;}
.swatches{display:flex;gap:8px;flex-wrap:wrap;padding:6px 0 10px;}
.swatch{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.15);cursor:pointer;transition:transform .12s;}
.swatch:hover{transform:scale(1.12);}
.swatch.on{border-color:#fff;box-shadow:0 0 0 2px var(--a);}
.picker{width:34px;height:26px;border:0;padding:0;background:none;cursor:pointer;}
.picker::-webkit-color-swatch-wrapper{padding:0;}
.picker::-webkit-color-swatch{border:2px solid rgba(255,255,255,.2);border-radius:8px;}
.preview{height:46px;border-radius:12px;margin:8px 0 4px;background:linear-gradient(90deg,var(--a),color-mix(in oklab,var(--a) 50%,#fff));box-shadow:0 6px 22px color-mix(in srgb,var(--a) 45%,transparent);display:flex;align-items:center;justify-content:center;color:var(--on-a);font-weight:700;font-size:13px;}
.plist{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.pcard{position:relative;border-radius:13px;padding:12px;cursor:pointer;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);transition:transform .15s,border-color .15s;min-height:62px;}
.pcard:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.18);}
.pcard.on{border-color:var(--a);background:color-mix(in srgb,var(--a) 12%,transparent);}
.pcard .dot{width:14px;height:14px;border-radius:50%;margin-bottom:8px;}
.pcard .n{font-size:13px;font-weight:600;}
.pcard .k{font-size:10px;opacity:.45;margin-top:2px;}
.pcard .del{position:absolute;top:6px;right:6px;border:0;background:transparent;color:rgba(255,255,255,.4);cursor:pointer;font-size:13px;}
.pcard .del:hover{color:#e5484d;}
.save{display:flex;gap:8px;margin-top:10px;}
.inp{flex:1;min-width:0;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:11px;color:#fff;padding:9px 12px;font-size:13px;font-family:inherit;outline:none;}
.inp:focus{border-color:var(--a);}
.keys{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;align-items:center;font-size:12px;padding:8px 0;}
kbd{font:600 10px ui-monospace,monospace;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-bottom-width:2px;border-radius:6px;padding:2px 6px;white-space:nowrap;}
.status{display:inline-flex;align-items:center;gap:6px;font-size:11px;opacity:.75;}
.status i{width:7px;height:7px;border-radius:50%;background:#666;}
.status.ok i{background:#3ddc84;box-shadow:0 0 8px #3ddc84;}
.status.warn i{background:#ffb224;}
.foot{font-size:10px;opacity:.35;text-align:center;padding:10px 0 2px;}
.toast{position:fixed;left:50%;bottom:120px;transform:translate(-50%,10px);opacity:0;z-index:2147483647;padding:9px 16px;border-radius:12px;font-size:13px;font-weight:600;
  background:rgba(18,18,22,.92);backdrop-filter:blur(14px);border:1px solid color-mix(in srgb,var(--a) 40%,transparent);box-shadow:0 10px 30px rgba(0,0,0,.5);transition:opacity .2s,transform .2s;pointer-events:none;}
.toast.show{opacity:1;transform:translate(-50%,0);}
a{color:var(--a);}
`;
  const ui = {
    host: null, shadow: null, panel: null, body: null, handle: null, open: false, tab: "bg",
    mount() {
      this.host = h("div", { id: "ymmod-host" });
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.shadow.append(h("style", {}, PANEL_CSS));
      this.handle = h("button", { class: "handle", title: "Кастомизация (Ctrl+Shift+Y)", onclick: () => this.toggle(), html: `<svg viewBox="0 0 24 24">${ICONS.color}</svg>` });
      this.panel = h("div", { class: "panel", role: "dialog", "aria-label": "Кастомизация" });
      this.shadow.append(this.handle, this.panel);
      document.body.append(this.host);
      document.addEventListener("pointerdown", (e) => {
        if (this.open && !e.composedPath().includes(this.host)) this.toggle(false);
      }, true);
    },
    toggle(v = !this.open) {
      this.open = v;
      this.panel.classList.toggle("open", v);
      this.handle.classList.toggle("active", v);
      if (v) this.render();
    },
    setButtonHidden(hidden) {
      if (this.handle) this.handle.classList.toggle("hidden", hidden && !this.open);
    },
    render() {
      if (!this.panel || !cfg) return;
      const scroll = this.body ? this.body.scrollTop : 0;
      this.panel.replaceChildren(
        h("div", { class: "head" },
          h("div", { class: "logo" }),
          h("div", {}, h("div", { class: "title" }, "Кастомизация"), h("div", { class: "sub" }, cfg.activePreset ? `Пресет: ${cfg.activePreset}` : "Свои настройки")),
          h("button", { class: "x", title: "Закрыть (Esc)", onclick: () => this.toggle(false) }, "✕")),
        h("div", { class: "tabs" }, TABS.map(([id, label]) => h("button", { class: `tab${this.tab === id ? " on" : ""}`, onclick: () => {
          this.tab = id;
          this.body.scrollTop = 0;
          this.render();
        }, html: `<svg viewBox="0 0 24 24">${ICONS[id]}</svg><span>${label}</span>` }))),
        (this.body = h("div", { class: "body" }, this[`tab_${this.tab}`]()))
      );
      this.body.scrollTop = scroll;
    },
    sync() {
      if (this.open) this.render();
    },
    refreshStatus() {
      if (!this.open || !this.shadow) return;
      const a = this.shadow.querySelector("[data-st=audio]");
      if (a) this.setStatus(a, audio.attached > 0 ? ["ok", "Звук захвачен"] : audio.needed() ? ["warn", "Ждём воспроизведения…"] : ["", "Выключено"]);
      const d = this.shadow.querySelector("[data-st=discord]");
      if (d) this.setStatus(d, this.discordStatus());
    },
    setStatus(el, [cls, text]) {
      el.className = `status ${cls}`;
      el.replaceChildren(h("i"), text);
    },
    discordStatus() {
      if (!cfg.discordRpc) return ["", "Выключено"];
      if (!cfg.discordClientId) return ["warn", "Нужен Client ID"];
      if (state.discord && state.discord.connected) return ["ok", state.discord.user ? `Подключено · ${state.discord.user}` : "Подключено"];
      return ["warn", (state.discord && state.discord.error) || "Подключение…"];
    },
    // controls
    range(key, label, min, max, unit = "", step = 1, fmt) {
      const show = (v) => (fmt ? fmt(v) : `${v}${unit}`);
      const val = h("span", { class: "val" }, show(cfg[key]));
      const input = h("input", { type: "range", min, max, step, value: cfg[key] });
      const paint = () => input.style.setProperty("--p", `${((input.value - min) / (max - min)) * 100}%`);
      paint();
      input.addEventListener("input", () => {
        paint();
        val.textContent = show(Number(input.value));
        setOpt({ [key]: Number(input.value) }, { silent: true });
      });
      return h("label", { class: "range" }, h("div", { class: "top" }, h("span", { class: "lbl" }, label), val), input);
    },
    toggleRow(key, label, hint) {
      const input = h("input", { type: "checkbox" });
      input.checked = Boolean(cfg[key]);
      input.addEventListener("change", () => setOpt({ [key]: input.checked }));
      return h("label", { class: "row" }, h("div", {}, h("div", { class: "lbl" }, label), hint ? h("div", { class: "hint" }, hint) : null), h("span", { class: "sw" }, input, h("span")));
    },
    seg(key, options, onPick) {
      return h("div", { class: "seg" }, options.map(([v, l]) => h("button", { class: cfg[key] === v ? "on" : "", onclick: () => (onPick ? onPick(v) : setOpt({ [key]: v })) }, l)));
    },
    card(...kids) {
      return h("div", { class: "card" }, ...kids);
    },
    sec(title, ...kids) {
      return h("div", { class: "sec" }, h("div", { class: "sec-t" }, title), ...kids);
    },
    // tabs
    tab_bg() {
      const files = state.files;
      const dn = cfg.bgMode === "daynight";
      const gallery = h("div", { class: "gallery" },
        files.map((f) => {
          const on = dn ? f.name === bg.currentName : f.name === cfg.backgroundFile;
          const media = f.kind === "video" ? h("video", { src: f.url, muted: true, preload: "metadata" }) : h("img", { src: f.url, loading: "lazy", decoding: "async" });
          if (f.kind === "video") {
            media.muted = true;
            media.addEventListener("mouseenter", () => media.play().catch(() => {}));
          }
          const t = h("div", { class: `thumb${on ? " on" : ""}`, title: f.name, onclick: () => setOpt({ backgroundFile: f.name, bgMode: cfg.bgMode === "daynight" ? "single" : cfg.bgMode }) },
            media,
            h("span", { class: "badge" }, f.kind === "video" ? "VIDEO" : f.name.split(".").pop().toUpperCase()),
            h("button", { class: "del", title: "Удалить", onclick: async (e) => {
              e.stopPropagation();
              replaceState(await api.removeBackground(f.name));
            } }, "✕"));
          if (dn) {
            t.append(h("div", { class: "dn" },
              h("button", { class: cfg.dayFile === f.name ? "on" : "", title: "Днём", onclick: (e) => {
                e.stopPropagation();
                setOpt({ dayFile: f.name });
              } }, "☀"),
              h("button", { class: cfg.nightFile === f.name ? "on" : "", title: "Ночью", onclick: (e) => {
                e.stopPropagation();
                setOpt({ nightFile: f.name });
              } }, "☾")));
          }
          return t;
        }),
        h("button", { class: "thumb add", title: "Добавить фото, GIF или видео", onclick: async () => replaceState(await api.addBackgrounds()) }, "+", h("small", {}, "фото / видео")));
      return [
        this.sec("Галерея", gallery,
          h("div", { class: "btns", style: "margin-top:10px" },
            h("button", { class: "btn", onclick: () => setOpt({ backgroundFile: null, bgMode: "single" }) }, "Без фона"),
            h("button", { class: "btn", onclick: () => bg.next(1), disabled: files.length < 2 }, "Следующий ›"))),
        this.sec("Режим", this.seg("bgMode", [["single", "Один"], ["slideshow", "Слайдшоу"], ["daynight", "День / ночь"]]),
          cfg.bgMode === "slideshow" ? this.card(this.range("slideInterval", "Смена каждые", 1, 120, " мин")) : null,
          dn ? this.card(
            h("div", { class: "hint", style: "padding:8px 0 0" }, "Отметь в галерее ☀ дневной и ☾ ночной фон"),
            this.range("dayStartHour", "День с", 0, 23, ":00"),
            this.range("nightStartHour", "Ночь с", 0, 23, ":00")) : null),
        this.sec("Картинка", this.card(
          this.range("blur", "Размытие", 0, 60, "px"),
          this.range("dim", "Затемнение", 0, 95, "%"),
          this.range("saturation", "Насыщенность", 0, 200, "%"),
          this.range("contentAlpha", "Плотность панелей", 0, 100, "%"))),
        this.sec("Моя волна", this.card(
          this.toggleRow("cleanVibe", "Чистая Волна", "Без портретов артистов, переливающейся анимации и кислотного градиента"),
          this.toggleRow("hideWaveArt", "Скрыть оформление трека", "Чтобы был виден ваш фон")))
      ];
    },
    tab_color() {
      const fixed = cfg.accentMode === "fixed";
      const picker = h("input", { type: "color", class: "picker", value: cfg.accent });
      picker.addEventListener("input", () => setOpt({ accent: picker.value, accentMode: "fixed" }, { silent: true }));
      picker.addEventListener("change", () => this.render());
      return [
        this.sec("Акцентный цвет", this.seg("accentMode", [["off", "Стандарт"], ["fixed", "Свой"], ["cover", "Из обложки"]]),
          h("div", { class: "preview" }, cfg.accentMode === "cover" ? "Цвет текущей обложки" : cfg.accentMode === "fixed" ? cfg.accent.toUpperCase() : "Жёлтый Яндекса")),
        this.sec("Палитра", this.card(
          h("div", { class: "swatches" }, SWATCHES.map((c) => h("button", { class: `swatch${fixed && cfg.accent === c ? " on" : ""}`, style: `background:${c}`, title: c, onclick: () => setOpt({ accent: c, accentMode: "fixed" }) })),
            h("label", { title: "Любой цвет", style: "display:flex;align-items:center" }, picker)),
          h("div", { class: "hint", style: "padding-bottom:10px" }, "В режиме «Из обложки» цвет плавно меняется с каждым треком, а выбранный здесь служит запасным."))),
      ];
    },
    tab_player() {
      return [
        this.sec("Плеер", this.card(
          this.range("playerGlass", "Стекло (размытие под плеером)", 0, 40, "px"),
          this.toggleRow("rounded", "Скруглённые углы"),
          this.toggleRow("glow", "Свечение плеера", "Дышит в такт, когда включён пульс"),
          this.toggleRow("volumeWheel", "Громкость колёсиком", "Крути колесо мыши над иконкой громкости"))),
        this.sec("Ползунок прогресса", this.seg("thumbStyle", [["pinwheel", "Пропеллер"], ["orb", "Сфера"], ["default", "Обычный"]]),
          this.card(this.toggleRow("thumbRainbow", "Радужный перелив"))),
      ];
    },
    tab_fx() {
      return [
        this.sec("Звук", this.card(h("div", { class: "row" }, h("div", { class: "lbl" }, "Анализатор"), h("span", { class: "status", "data-st": "audio" })))),
        this.sec("Пульс под бит", this.card(
          this.toggleRow("beatSync", "Пульс обложки и свечения"),
          this.range("beatIntensity", "Сила", 0, 100, "%"),
          this.toggleRow("bgPulse", "Фон тоже качается"))),
        this.sec("Визуализатор", this.seg("visualizer", [["off", "Выкл"], ["bars", "Полосы"], ["wave", "Волна"], ["mirror", "Зеркало"]]),
          cfg.visualizer !== "off" ? this.card(this.range("visualizerOpacity", "Яркость", 10, 100, "%")) : null),
        this.sec("Производительность", this.card(this.toggleRow("reducedMotion", "Меньше анимаций", "Выключает пульс, визуализатор, вращение, свечение и останавливает видео-фон")))
      ];
    },
    tab_presets() {
      const inp = h("input", { class: "inp", placeholder: "Название пресета", maxlength: 40 });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") presets.save(inp.value);
      });
      return [
        this.sec("Пресеты", h("div", { class: "plist" }, presets.all().map((p) => {
          const col = p.data.accentMode === "cover" ? "conic-gradient(#ff5c4d,#ffd23f,#2dffa8,#5c7cff,#ff2d95,#ff5c4d)" : p.data.accent || "#ffdb4d";
          return h("div", { class: `pcard${cfg.activePreset === p.name ? " on" : ""}`, onclick: () => presets.apply(p.name) },
            h("div", { class: "dot", style: `background:${col}` }),
            h("div", { class: "n" }, p.name),
            h("div", { class: "k" }, p.builtin ? "встроенный" : "свой"),
            p.builtin ? null : h("button", { class: "del", title: "Удалить", onclick: (e) => {
              e.stopPropagation();
              presets.remove(p.name);
            } }, "✕"));
        })),
          h("div", { class: "save" }, inp, h("button", { class: "btn pri", onclick: () => presets.save(inp.value) }, "Сохранить"))),
        this.sec("Обмен", h("div", { class: "btns" },
          h("button", { class: "btn", onclick: async () => {
            if (await api.exportPresets()) toast("Пресеты сохранены в файл");
          } }, "⬇ Экспорт JSON"),
          h("button", { class: "btn", onclick: async () => {
            replaceState(await api.importPresets());
            toast("Пресеты импортированы");
          } }, "⬆ Импорт JSON"))),
        h("div", { class: "hint" }, "Ctrl+Shift+P — следующий пресет по кругу.")
      ];
    },
    tab_more() {
      const idInp = h("input", { class: "inp", placeholder: "Application ID из Discord Developer Portal", value: cfg.discordClientId, inputmode: "numeric" });
      idInp.addEventListener("change", () => setOpt({ discordClientId: idInp.value.replace(/\D/g, "") }));
      return [
        this.sec("Мини-плеер", h("div", { class: "btns" }, h("button", { class: "btn pri", onclick: () => mini.toggle() }, mini.on ? "⤢ Обычный режим" : "▣ Мини-плеер поверх окон")),
          this.card(this.toggleRow("miniAutoHide", "Прятать в играх", "Скрывается, когда открыта полноэкранная игра или видео"),
            h("div", { class: "keys" }, h("kbd", {}, "Ctrl+Alt+M"), h("span", {}, "спрятать / показать (работает и в игре)"), h("kbd", {}, "Ctrl+Alt+G"), h("span", {}, "режим «призрак»: полупрозрачный, клики проходят сквозь")))),
        this.sec("Горячие клавиши", this.card(h("div", { class: "keys" }, HOTKEYS.flatMap(([k, label]) => [h("kbd", {}, `Ctrl+Shift+${k}`), h("span", {}, label)])))),
        this.sec("Интерфейс", this.card(this.toggleRow("hideButton", "Спрятать язычок слева", "Панель открывается по Ctrl+Shift+Y"))),
        this.sec("Discord", this.card(
          this.toggleRow("discordRpc", "Статус «Слушает» в Discord"),
          h("div", { class: "row" }, h("div", { class: "lbl" }, "Состояние"), h("span", { class: "status", "data-st": "discord" })),
          h("div", { style: "padding:4px 0 10px" }, h("div", { class: "save", style: "margin-top:0" }, idInp)),
          h("div", { class: "hint", style: "padding-bottom:10px" }, "Работает из коробки. Если статуса не видно — в Discord: Настройки → Конфиденциальность активности → «Делиться активностью». Свой Application ID можно вписать выше."))),
        this.sec("Файлы", h("div", { class: "btns" }, h("button", { class: "btn", onclick: () => api.openFolder() }, "📁 Папка мода"))),
        h("div", { class: "foot" }, `YMusicMod ${state.modVersion} · Яндекс Музыка ${state.appVersion}`)
      ];
    }
  };
  // Перерисовываем статусы после рендера вкладок.
  const origRender = ui.render.bind(ui);
  ui.render = function () {
    origRender();
    ui.refreshStatus();
  };

  // watchers
  function refreshTargets() {
    const p = $(SEL.playerRoot);
    if (p !== targets.player) {
      targets.player = p;
      layoutCanvas();
    }
    if (bg.host && !bg.host.isConnected) {
      bg.host = null;
      bg.ensure();
      bg.currentName = null;
      bg.show(bg.fileFor());
    }
    if (ui.host && !ui.host.isConnected) document.body.append(ui.host);
    volume.scan();
    if (cfg && cfg.cleanVibe) {
      document.querySelectorAll('[class*="WheelItem_root"]').forEach((el) => el.classList.toggle("ymm-artist", /В стиле/i.test(el.textContent || "")));
    }
  }
  let lastTitle = "";
  function pollTrack() {
    track.read();
    if (track.cover) accent.onCover(track.cover);
    const key = `${track.title}|${track.artist}`;
    if (key !== lastTitle) {
      lastTitle = key;
      discord.push(true);
    } else discord.push(false);
  }

  async function boot() {
    ui.mount();
    audio.init();
    try {
      state = await api.get();
    } catch (e) {
      console.warn("[YMusicMod] config", e);
      return;
    }
    cfg = { ...state.config };
    applyAll();
    refreshTargets();
    new MutationObserver(debounce(refreshTargets, 250)).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", debounce(layoutCanvas, 100));
    document.addEventListener("visibilitychange", () => {
      bg.syncVideo();
      loop.kick();
    });
    setInterval(() => audio.pollPlaying(), 300);
    setInterval(pollTrack, 1500);
    setInterval(layoutCanvas, 1000);
    pollTrack();
    Object.defineProperty(window, "__ymmDebug", { value: { setOpt, get cfg() {
      return cfg;
    }, audio, beat, accent, mini, presets, ui }, configurable: true });
    console.log(`[YMusicMod] v${state.modVersion} ready`);
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
})();
