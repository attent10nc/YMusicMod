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
  const LOGO = "__YMMOD_LOGO__";
  const GOOGLE_FONTS = [["Inter", "sans"], ["Inter Tight", "sans"], ["Manrope", "sans"], ["Montserrat", "sans"], ["Montserrat Alternates", "display"], ["Rubik", "sans"], ["Nunito", "sans"], ["Nunito Sans", "sans"], ["Raleway", "sans"], ["Roboto", "sans"], ["Roboto Condensed", "sans"], ["Open Sans", "sans"], ["Onest", "sans"], ["Golos Text", "sans"], ["Geologica", "sans"], ["Geist", "sans"], ["Commissioner", "sans"], ["Jost", "sans"], ["Mulish", "sans"], ["Overpass", "sans"], ["Fira Sans", "sans"], ["IBM Plex Sans", "sans"], ["Ubuntu", "sans"], ["Noto Sans", "sans"], ["Source Sans 3", "sans"], ["PT Sans", "sans"], ["PT Sans Narrow", "sans"], ["Arimo", "sans"], ["Sofia Sans", "sans"], ["Sofia Sans Condensed", "sans"], ["Sofia Sans Extra Condensed", "sans"], ["Wix Madefor Display", "sans"], ["Wix Madefor Text", "sans"], ["Exo 2", "sans"], ["Play", "sans"], ["Jura", "sans"], ["Didact Gothic", "sans"], ["Scada", "sans"], ["Cuprum", "sans"], ["Tenor Sans", "sans"], ["Ysabeau", "sans"], ["Ysabeau Office", "sans"], ["Lunasima", "sans"], ["Advent Pro", "sans"], ["Oswald", "sans"], ["Yanone Kaffeesatz", "sans"], ["Comfortaa", "sans"], ["Bellota Text", "sans"], ["Kosugi Maru", "sans"], ["Shantell Sans", "hand"], ["PT Serif", "serif"], ["Lora", "serif"], ["Playfair Display", "serif"], ["Merriweather", "serif"], ["Roboto Slab", "serif"], ["IBM Plex Serif", "serif"], ["Noto Serif", "serif"], ["Source Serif 4", "serif"], ["Literata", "serif"], ["Spectral", "serif"], ["Tinos", "serif"], ["Vollkorn", "serif"], ["Cormorant", "serif"], ["Cormorant Garamond", "serif"], ["Alice", "serif"], ["Forum", "serif"], ["Ledger", "serif"], ["Bona Nova", "serif"], ["Oranienbaum", "serif"], ["Podkova", "serif"], ["Kelly Slab", "serif"], ["Kurale", "serif"], ["Philosopher", "serif"], ["Gabriela", "serif"], ["Yeseva One", "display"], ["Unbounded", "display"], ["Russo One", "display"], ["Dela Gothic One", "display"], ["Prosto One", "display"], ["Ruslan Display", "display"], ["Seymour One", "display"], ["Stalinist One", "display"], ["Rubik Mono One", "display"], ["Tektur", "display"], ["Handjet", "display"], ["Climate Crisis", "display"], ["Train One", "display"], ["Press Start 2P", "display"], ["Poiret One", "display"], ["Bellota", "display"], ["Stick", "display"], ["Underdog", "display"], ["Pattaya", "display"], ["Rubik Glitch", "display"], ["Rubik Wet Paint", "display"], ["Rubik Beastly", "display"], ["Rubik Doodle Shadow", "display"], ["Rubik Microbe", "display"], ["Rubik Puddles", "display"], ["Caveat", "hand"], ["Pacifico", "hand"], ["Lobster", "hand"], ["Marck Script", "hand"], ["Bad Script", "hand"], ["Neucha", "hand"], ["Pangolin", "hand"], ["Amatic SC", "hand"], ["Comforter", "hand"], ["JetBrains Mono", "mono"], ["Fira Code", "mono"], ["IBM Plex Mono", "mono"], ["Roboto Mono", "mono"], ["Ubuntu Mono", "mono"], ["PT Mono", "mono"], ["Victor Mono", "mono"], ["Martian Mono", "mono"], ["Geist Mono", "mono"]];
  const FONT_CATS = [["all", "Все"], ["sans", "Гротески"], ["serif", "С засечками"], ["display", "Акцидентные"], ["hand", "Рукописные"], ["mono", "Моно"], ["system", "Windows"], ["file", "Мои"]];
  const gfUrl = (name, extra = "") => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}${extra}&display=swap`;
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
    if (!opts.noHistory && cfg) history.remember(patch);
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
  const PRESET_KEYS = ["blur", "dim", "saturation", "contentAlpha", "bgMode", "slideInterval", "accentMode", "accent", "rounded", "glow", "playerGlass", "hideWaveArt", "beatSync", "beatIntensity", "bgPulse", "thumbStyle", "thumbRainbow", "visualizer", "visualizerOpacity", "reducedMotion", "cleanVibe", "visPlace", "visHeight", "visColor", "visColor1", "visColor2", "visSym", "visGlow", "visSens", "visSmooth"];
  const BUILTIN_PRESETS = {
    "Контраст": { blur: 6, dim: 45, saturation: 0, contentAlpha: 50, accentMode: "fixed", accent: "#ffffff", rounded: true, glow: true, playerGlass: 22, beatSync: true, beatIntensity: 85, bgPulse: true, thumbStyle: "default", thumbRainbow: false, visualizer: "mirror", visualizerOpacity: 85, reducedMotion: false, visColor: "accent" },
    "Стекло": { blur: 28, dim: 25, saturation: 120, contentAlpha: 35, accentMode: "cover", rounded: true, glow: false, playerGlass: 32, beatSync: true, beatIntensity: 45, bgPulse: false, thumbStyle: "orb", thumbRainbow: false, visualizer: "wave", visualizerOpacity: 55, reducedMotion: false },
    "Обложка": { blur: 12, dim: 40, saturation: 110, contentAlpha: 55, accentMode: "cover", rounded: true, glow: true, playerGlass: 18, beatSync: true, beatIntensity: 70, bgPulse: true, thumbStyle: "pinwheel", thumbRainbow: false, visualizer: "bars", visualizerOpacity: 70, reducedMotion: false },
    "Минимал": { blur: 0, dim: 55, saturation: 90, contentAlpha: 75, accentMode: "fixed", accent: "#e6e6e6", rounded: true, glow: false, playerGlass: 10, beatSync: false, beatIntensity: 40, bgPulse: false, thumbStyle: "default", thumbRainbow: false, visualizer: "off", visualizerOpacity: 50, reducedMotion: true },
    "Аврора": { blur: 24, dim: 62, saturation: 130, contentAlpha: 30, accentMode: "cover", rounded: true, glow: false, playerGlass: 24, beatSync: true, beatIntensity: 40, bgPulse: false, thumbStyle: "default", thumbRainbow: false, visualizer: "aurora", visualizerOpacity: 90, reducedMotion: false, visPlace: "full", visColor: "cover", visGlow: 70, visSym: false },
    "Кино": { blur: 40, dim: 70, saturation: 120, contentAlpha: 20, bgMode: "cover", accentMode: "cover", rounded: true, glow: false, playerGlass: 30, beatSync: true, beatIntensity: 35, bgPulse: false, thumbStyle: "default", thumbRainbow: false, visualizer: "wave", visualizerOpacity: 60, reducedMotion: false, visPlace: "bar", visHeight: 130, visColor: "cover", visGlow: 55, visSym: true },
    "Графит": { blur: 8, dim: 55, saturation: 0, contentAlpha: 40, accentMode: "fixed", accent: "#bdbdbd", rounded: true, glow: true, playerGlass: 20, beatSync: true, beatIntensity: 80, bgPulse: true, thumbStyle: "default", thumbRainbow: false, visualizer: "bars", visualizerOpacity: 90, reducedMotion: false, visPlace: "bar", visHeight: 140, visColor: "custom", visColor1: "#ffffff", visColor2: "#7a7a7a", visGlow: 85, visSym: true },
    "Космос": { blur: 30, dim: 75, saturation: 110, contentAlpha: 25, accentMode: "cover", rounded: true, glow: false, playerGlass: 26, beatSync: true, beatIntensity: 45, bgPulse: false, thumbStyle: "default", thumbRainbow: false, visualizer: "stars", visualizerOpacity: 95, reducedMotion: false, visPlace: "full", visColor: "cover", visGlow: 70, visSym: true }
  };

  // accent
  try {
    CSS.registerProperty({ name: "--ymm-accent", syntax: "<color>", inherits: true, initialValue: "#f2f2f2" });
    CSS.registerProperty({ name: "--ymm-accent-ui", syntax: "<color>", inherits: true, initialValue: "#f2f2f2" });
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
  // Палитра обложки: основной цвет и ещё два заметно других оттенка. Считаем здесь на canvas:
  // сервер отдаёт браузеру WebP, а встроенный декодер Electron его не понимает.
  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [hh * 60, s, l];
  };
  const hslToHex = (hh, s, l) => {
    const k = (n) => (n + hh / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
  };
  const paletteCache = new Map();
  const coverPalette = (url) => {
    if (paletteCache.has(url)) return Promise.resolve(paletteCache.get(url));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = () => reject(new Error("cover load failed"));
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 40;
        const c = cv.getContext("2d", { willReadFrequently: true });
        c.drawImage(img, 0, 0, 40, 40);
        const px = c.getImageData(0, 0, 40, 40).data;
        const bins = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        let ar = 0, ag = 0, ab = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) {
          const R = px[i], G = px[i + 1], B = px[i + 2];
          ar += R; ag += G; ab += B; n++;
          const [hh, s, l] = rgbToHsl(R, G, B);
          const w = s * s * (1 - Math.abs(l - 0.5) * 1.6);
          if (w <= 0.02) continue;
          const bin = bins[Math.floor(hh / 10) % 36];
          bin.w += w; bin.r += R * w; bin.g += G * w; bin.b += B * w;
        }
        const ranked = bins.filter((b) => b.w > n * 0.015).sort((a, b) => b.w - a.w);
        const best = ranked[0];
        let [hh, s, l] = best ? rgbToHsl(best.r / best.w, best.g / best.w, best.b / best.w) : rgbToHsl(ar / n, ag / n, ab / n);
        const hue0 = hh;
        s = s < 0.12 ? s : Math.min(1, Math.max(s, 0.62));
        l = Math.min(Math.max(l, 0.52), 0.66);
        const hex = hslToHex(hh, s, l);
        const palette = [hex];
        const hues = [hue0];
        for (const bin of ranked.slice(1)) {
          if (palette.length >= 3) break;
          const [bh, bs, bl] = rgbToHsl(bin.r / bin.w, bin.g / bin.w, bin.b / bin.w);
          if (hues.some((x) => Math.min(Math.abs(x - bh), 360 - Math.abs(x - bh)) < 28)) continue;
          hues.push(bh);
          palette.push(hslToHex(bh, Math.min(1, Math.max(bs, 0.58)), Math.min(Math.max(bl, 0.5), 0.7)));
        }
        // Чёрно-белая обложка остаётся серебристой, одноцветная получает соседние оттенки.
        if (s < 0.12) while (palette.length < 3) palette.push(palette.length === 1 ? "#f2f2f6" : "#8f8f9c");
        else while (palette.length < 3) palette.push(hslToHex((hue0 + (palette.length === 1 ? 38 : -38) + 360) % 360, s, Math.min(0.74, l + 0.08)));
        if (paletteCache.size > 300) paletteCache.clear();
        const out = { hex, palette };
        paletteCache.set(url, out);
        resolve(out);
      };
      img.src = url;
    });
  };
  const accent = {
    current: "#f2f2f2",
    ui: "#f2f2f2",
    coverUrl: null,
    coverHex: null,
    coverHexUrl: null,
    palette: null,
    set(hex) {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
      this.current = hex;
      this.ui = readable(hex);
      root.style.setProperty("--ymm-accent", hex);
      root.style.setProperty("--ymm-accent-ui", this.ui);
      root.style.setProperty("--ymm-on-accent", luminance(hex) > 0.42 ? "#0b0b0b" : "#ffffff");
      // Порог ниже, чем у акцента: на средне-серой кнопке белый текст читается плохо.
      root.style.setProperty("--ymm-on-accent-ui", luminance(this.ui) > 0.3 ? "#0b0b0b" : "#ffffff");
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
      // Палитра нужна и волне, и полноэкранному плееру, поэтому качаем её при любом акценте.
      this.fetchCover(url);
    },
    async fetchCover(url) {
      if (this.fetching === url) return;
      this.fetching = url;
      try {
        const res = await coverPalette(url);
        if (res && url === this.coverUrl) {
          this.coverHex = res.hex;
          this.coverHexUrl = url;
          this.palette = res.palette;
          res.palette.forEach((c, i) => root.style.setProperty(`--ymm-c${i + 1}`, c));
          if (cfg.accentMode === "cover") this.set(res.hex);
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

  // Подробности о треке: ссылки берём из плеера, год и жанр из данных, которые приложение уже загрузило.
  const GENRES = { rusrap: "Русский рэп", rap: "Рэп", foreignrap: "Зарубежный рэп", hiphop: "Хип-хоп", pop: "Поп", ruspop: "Русская поп-музыка", rock: "Рок", rusrock: "Русский рок", alternative: "Альтернатива", indie: "Инди", electronics: "Электроника", dance: "Танцевальная", house: "Хаус", techno: "Техно", trance: "Транс", dnb: "Драм-н-бэйс", dubstep: "Дабстеп", metal: "Метал", jazz: "Джаз", classical: "Классика", soundtrack: "Саундтрек", folk: "Фолк", rnb: "R&B", soul: "Соул", reggae: "Регги", punk: "Панк", lofi: "Лоу-фай", phonk: "Фонк", ambient: "Эмбиент", videogame: "Музыка из игр", films: "Из фильмов", estrada: "Эстрада" };
  const trackMeta = {
    id: "", albumId: "", artistId: "", data: null, asked: "",
    read() {
      const scope = $('[data-test-id="PLAYERBAR_DESKTOP"]') || $('[class*="VibePlayerBar_root"]') || $('[class*="VibePage_root"]');
      const link = scope && scope.querySelector('a[href*="trackId="]');
      const artist = scope && scope.querySelector('a[href*="artistId="]');
      const q = (a) => new URLSearchParams(((a && a.getAttribute("href")) || "").split("?")[1] || "");
      const tq = q(link);
      this.id = tq.get("trackId") || "";
      this.albumId = tq.get("albumId") || "";
      this.artistId = q(artist).get("artistId") || "";
      const cache = window.__ymmCovers && window.__ymmCovers.cache;
      this.data = this.id && cache ? cache.get(this.id) : null;
      if (!this.id && cache) {
        const hit = cache.find(track.title, track.artist);
        if (hit) {
          this.data = hit;
          this.id = String(hit.id);
          const al = hit.albums && hit.albums[0];
          const ar = hit.artists && hit.artists[0];
          if (al) this.albumId = String(al.id);
          if (ar) this.artistId = String(ar.id);
        }
      }
      if (this.id && !this.data && this.asked !== this.id && window.__ymmCovers) {
        this.asked = this.id;
        window.__ymmCovers.fetchTrack(this.albumId ? `${this.id}:${this.albumId}` : this.id);
      }
      return this;
    },
    get album() {
      return (this.data && this.data.albums && this.data.albums[0]) || null;
    },
    get artist() {
      return (this.data && this.data.artists && this.data.artists[0]) || null;
    },
    get artistCover() {
      const a = this.artist;
      const c = a && a.cover;
      // Обложка альбома вместо фото артиста ничего нового не покажет.
      if (!c || c.type === "from-album-cover" || !c.uri) return "";
      return `https://${c.uri.replace("%%", "200x200")}`;
    },
    get genre() {
      const g = this.album && this.album.genre;
      return g ? GENRES[g] || g[0].toUpperCase() + g.slice(1) : "";
    },
    get loudness() {
      const r = this.data && this.data.r128;
      return r && Number.isFinite(r.i) ? r.i : null;
    }
  };

  // audio engine
  const audio = {
    ctx: null, analyser: null, beatAn: null, freq: null, bass: null, nodes: new Map(), attached: 0, playing: false, el: null,
    needed() {
      return cfg && !cfg.reducedMotion && (cfg.beatSync || cfg.visualizer !== "off" || cfg.fullscreenFx);
    },
    ensureCtx() {
      if (this.ctx) return;
      this.ctx = new AudioContext({ latencyHint: "playback" });
      this.analyser = this.ctx.createAnalyser();
      // Окно FFT 4096: баз различается хорошо, а волна отстаёт от звука меньше чем на 50 мс (у 8192 было заметно).
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.45;
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
        discord.pausedAt = playing ? 0 : Date.now();
        discord.push(true);
        api.playback({ playing }).catch(() => {});
        loop.kick();
      }
    }
  };

  const scrolling = {
    until: 0, timer: 0,
    on() {
      if (!cfg || !cfg.scrollBoost) return;
      this.until = performance.now() + 220;
      if (!this.timer) root.classList.add("ymm-scrolling");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = 0;
        root.classList.remove("ymm-scrolling");
      }, 240);
    }
  };
  //@include vis.js

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
      if (cfg.bgMode === "cover") return track.cover ? `cover:${track.cover.replace(/\/\d+x\d+$/, "/400x400")}` : this.currentName;
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
      root.classList.toggle("ymm-has-bg", Boolean(name) || (cfg.visPlace === "full" && cfg.visualizer !== "off"));
      if (name === this.currentName) return;
      const coverUrl = name && name.startsWith("cover:") ? name.slice(6) : null;
      const file = name && !coverUrl ? state.files.find((f) => f.name === name) : null;
      if (name && !file && !coverUrl) return;
      this.currentName = name;
      const next = this.layers[1 - this.active];
      const prev = this.layers[this.active];
      next.replaceChildren();
      if (!name) {
        prev.classList.remove("on");
        next.classList.remove("on");
        return;
      }
      next.classList.toggle("ymm-cover", Boolean(coverUrl));
      let media;
      if (coverUrl) {
        media = h("img", { src: coverUrl, decoding: "async", alt: "" });
        media.addEventListener("load", () => this.reveal(next, prev), { once: true });
      } else if (file.kind === "video") {
        media = h("video", { src: file.url, muted: true, loop: true, playsinline: true, autoplay: true, preload: "auto", disablepictureinpicture: true });
        media.muted = true;
        media.addEventListener("canplay", () => this.reveal(next, prev), { once: true });
      } else {
        media = h("img", { src: file.url, decoding: "async", alt: "" });
        media.addEventListener("load", () => this.reveal(next, prev), { once: true });
      }
      media.addEventListener("error", () => console.warn("[YMusicMod] bg failed", name), { once: true });
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
#ymmod-bg .ymm-cover>img{filter:blur(max(var(--ymm-blur),46px)) saturate(calc(var(--ymm-sat) * 1.35));transform:scale(1.18);animation:ymmCoverDrift 38s ease-in-out infinite alternate;}
@keyframes ymmCoverDrift{from{transform:scale(1.18) translate(-2%,-1.5%) rotate(-1deg);}to{transform:scale(1.26) translate(2%,1.5%) rotate(1deg);}}
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
${P}root"]{border-radius:var(--ym-radius-size-l);box-shadow:0 0 calc(14px + var(--ymm-beat) * 30px) calc(var(--ymm-beat) * 4px) color-mix(in srgb,var(--ymm-accent-ui) calc(35% + var(--ymm-beat) * 40%),transparent);outline:1px solid color-mix(in srgb,var(--ymm-accent-ui) 28%,transparent);outline-offset:-1px;}`);
    }
    // Разделы меню: прячем только пункты навигации, сами страницы приложения не трогаем.
    // Без :has() - на «Моей волне» DOM меняется каждый кадр, и :has() заставлял
    // браузер пересчитывать стили без остановки (рост памяти и фризы на сборке мусора).
    // Пункт <li> помечает nav.scan(), здесь только сама ссылка на случай, если метки ещё нет.
    const hidden = [c.hideKids && "/kids", c.hidePodcasts && "/non-music"].filter(Boolean);
    if (hidden.length) parts.push(`.ymm-nav-hidden,${hidden.map((href) => `nav a[href^="${href}"]`).join(",")}{display:none !important;}`);
    if (c.logoMode !== "original") {
      parts.push(`
.ymm-logo-on>:not(.ymm-logo){display:none !important;}
.ymm-logo{display:flex;align-items:center;gap:12px;height:48px;min-width:0;overflow:hidden;}
.ymm-logo img{width:44px;height:44px;flex-shrink:0;border-radius:12px;object-fit:cover;filter:drop-shadow(0 4px 14px color-mix(in srgb,var(--ymm-accent-ui) 45%,transparent));}
.ymm-logo span{font-family:var(--ym-font-heading,"YSMusic Headline"),sans-serif;font-weight:800;font-size:22px;line-height:1;white-space:nowrap;letter-spacing:-.3px;
  background:linear-gradient(90deg,#fff 0%,color-mix(in oklab,var(--ymm-accent-ui) 70%,#fff) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;}`);
    }
    parts.push(`
.ymm-q [class*="QualitySettings_item_option"]:first-child{color:var(--ymm-accent-ui);font-weight:700;}
.ymm-q .ymm-check{margin-left:auto;padding-left:12px;font-size:16px;color:var(--ym-controls-color-primary-text-enabled,#fff);}
.ymm-q{position:relative;}
.ymm-q::before{content:"";position:absolute;inset:2px;border-radius:12px;pointer-events:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ymm-accent-ui) 40%,transparent);}
html:not(.ymm-studio) .ymm-q .ymm-check{visibility:hidden;}
html.ymm-studio [class*="QualitySettingsModal_modalContent"] [role=option]:not(.ymm-q) svg{visibility:hidden;}`);
    // Строки списка за краем экрана остаются смонтированными (данные и обложки готовы),
    // но не рисуются, пока не понадобятся. Высота строки фиксированная - 56 px.
    if (c.scrollBoost) parts.push(`[class*="VirtualScroll_scroller"] [data-index]>[class*="CommonTrack_root"]{content-visibility:auto;contain-intrinsic-size:auto 56px;}`);
    // Во время прокрутки ставим на паузу декоративные анимации.
    parts.push(`html.ymm-scrolling ${P}root"],html.ymm-scrolling ${P}thumb"]::before{animation-play-state:paused !important;}
html.ymm-scrolling #ymmod-bg .ymm-slot{transition:none !important;}`);
    if (c.reducedMotion) {
      parts.push(`${P}thumb"]::before,${P}root"]{animation:none !important;}#ymmod-bg .ymm-slot{transition:none !important;transform:none !important;}`);
    }
    return parts.join("\n");
  }
  const motionStyle = h("style", { id: "ymmod-motion" }, "__YMMOD_CSS:motion.css__");
  document.head.appendChild(motionStyle);
  const STRUCTURAL = ["hideWaveArt", "cleanVibe", "accentMode", "thumbStyle", "thumbRainbow", "rounded", "glow", "reducedMotion", "hideKids", "hidePodcasts", "logoMode", "scrollBoost"];
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
    root.classList.toggle("ymm-motion", cfg.uiMotion && !cfg.reducedMotion);
    if (cfg.visualizer !== "off") vis.init();
    layoutCanvas();
    fsFx.check();
    if (cfg.visualizer === "off" && !vis.inFs && vis.clear) vis.clear();
    loop.kick();
    splashPrefs();
    ui.setButtonHidden(cfg.hideButton);
    discord.push(false);
    sound.apply();
    font.apply();
    if (!cfg.taskbarTitle && titleSet) {
      titleSet = false;
      document.title = "Яндекс Музыка";
    }
    if (window.__ymmCovers) window.__ymmCovers.enabled = cfg.prefetchCovers;
    logo.scan();
    nav.scan();
  }

  // Заставка запускается раньше конфига: кладём её настройки туда, откуда она сможет их прочитать.
  let titleSet = false;
  const splashPrefs = () => {
    try {
      const v = JSON.stringify({ on: cfg.splash && !cfg.reducedMotion, logo: cfg.logoMode === "custom" ? state.logoUrl : "" });
      if (localStorage.getItem("ymm-splash") !== v) localStorage.setItem("ymm-splash", v);
    } catch {
    }
  };

  // студийный звук
  const sound = {
    normDb: 0,
    apply() {
      root.classList.toggle("ymm-studio", cfg.sound === "studio");
      if (!window.__ymmFx) return;
      window.__ymmFx.set({ studio: cfg.sound === "studio", amount: cfg.studioAmount, width: cfg.studioWidth, ambience: cfg.studioAmbience, leveler: cfg.leveler, mode: cfg.playMode, profile: cfg.soundProfile, bass: cfg.studioBass, balance: cfg.balance, rate: cfg.playRate, preserve: cfg.preservePitch, norm: cfg.loudnessNorm, normDb: this.normDb });
    },
    // Выравнивание по данным трека: Яндекс отдаёт измеренную громкость (R128), ведём её к -14 LUFS.
    updateNorm() {
      const i = trackMeta.loudness;
      const db = i == null ? 0 : clamp(-14 - i, -12, 9);
      if (db === this.normDb) return;
      this.normDb = db;
      if (cfg.loudnessNorm) this.apply();
    },
    status() {
      const fx = window.__ymmFx;
      if (!fx) return ["warn", "Движок не загрузился"];
      if (cfg.sound !== "studio" && cfg.playMode === "normal" && !cfg.leveler && !cfg.loudnessNorm && !cfg.studioBass) return ["", "Обработка выключена"];
      if (fx.count > 0 && fx.peak() > 0.0005) return ["ok", "Обработка работает"];
      if (fx.count > 0) return ["ok", "Подключено · ждёт музыку"];
      return ["warn", "Подключится с первым треком"];
    }
  };
  // Пункт «Студийное» в окне «Настройки звука» самого Яндекса.
  const quality = {
    bound: new WeakSet(),
    picking: false,
    scan() {
      const box = $('[class*="QualitySettingsModal_modalContent"]') || $('[class*="QualitySettings_root"]');
      if (!box || !cfg) return;
      const high = box.querySelector('[data-test-id="QUALITY_SETTINGS_CONTEXT_MENU_ITEM_HIGH_QUALITY"]');
      if (!high) return;
      let mine = box.querySelector(".ymm-q");
      if (!mine) {
        mine = high.cloneNode(true);
        mine.classList.add("ymm-q");
        mine.removeAttribute("data-test-id");
        mine.querySelectorAll("svg").forEach((x) => x.remove());
        const opts = mine.querySelectorAll('[class*="QualitySettings_item_option"]');
        if (opts.length < 2) return;
        const t = [...opts[0].childNodes].find((n) => n.nodeType === 3);
        if (t) t.nodeValue = "Студийное ✦ ";
        else opts[0].prepend("Студийное ✦ ");
        opts[1].textContent = "Lossless + студийная обработка: тёплый бас, воздух на верхах, широкая сцена и мягкий лимитер";
        const wrap = mine.querySelector('[class*="QualitySettings_itemWrapper"]');
        (wrap ? wrap.parentElement : mine).append(h("span", { class: "ymm-check", "aria-hidden": "true" }, "✓"));
        mine.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.pick();
        }, true);
        high.before(mine);
      }
      box.querySelectorAll("[role=option]:not(.ymm-q)").forEach((b) => {
        if (this.bound.has(b)) return;
        this.bound.add(b);
        b.addEventListener("click", () => {
          if (!this.picking && cfg.sound === "studio") {
            setOpt({ sound: "off" });
            toast("Студийная обработка выключена");
          }
        });
      });
      mine.setAttribute("aria-selected", String(cfg.sound === "studio"));
    },
    pick() {
      const high = $('[data-test-id="QUALITY_SETTINGS_CONTEXT_MENU_ITEM_HIGH_QUALITY"]');
      // Студийная обработка всегда поверх lossless.
      if (high && high.getAttribute("aria-selected") !== "true") {
        this.picking = true;
        high.click();
        setTimeout(() => (this.picking = false), 300);
      }
      setOpt({ sound: "studio" });
      toast("Студийное звучание ✦");
      setTimeout(() => this.scan(), 50);
    }
  };

  // шрифт
  const font = {
    style: null, link: null, key: "", system: null, previewed: new Set(),
    family() {
      return cfg.fontFamily;
    },
    apply() {
      const key = [cfg.fontSource, cfg.fontFamily, cfg.fontFile, cfg.fontHeadings, (state.fonts || []).length].join("|");
      if (key === this.key) return;
      this.key = key;
      if (!this.style) {
        this.style = h("style", { id: "ymmod-font" });
        document.head.appendChild(this.style);
      }
      if (this.link) this.link.remove();
      this.link = null;
      const fam = cfg.fontFamily;
      if (!fam) {
        this.style.textContent = "";
        return;
      }
      let face = "";
      if (cfg.fontSource === "google") {
        this.link = h("link", { rel: "stylesheet", href: gfUrl(fam, ":wght@400;500;700;800") });
        document.head.appendChild(this.link);
      } else if (cfg.fontSource === "file") {
        const f = (state.fonts || []).find((x) => x.file === cfg.fontFile);
        if (f) face = `@font-face{font-family:"${fam}";src:url("${f.url}");font-display:swap;}`;
      }
      const stack = `"${fam}","YS Text",system-ui,sans-serif`;
      // Переменные шрифта Яндекс задаёт на .ym-font-music - переопределяем там же, а не на «*»:
      // правило на каждом элементе удорожало отрисовку каждой новой строки списка.
      this.style.textContent = `${face}
:root,.ym-font-music{--ym-font-text:${stack} !important;${cfg.fontHeadings ? `--ym-font-heading:${stack} !important;` : ""}}
html,body,button,input,textarea,select{font-family:${stack} !important;}
${cfg.fontHeadings ? `h1,h2,h3,h4{font-family:${stack} !important;}` : ""}`;
    },
    preview(name) {
      if (this.previewed.has(name)) return;
      this.previewed.add(name);
      document.head.appendChild(h("link", { rel: "stylesheet", href: gfUrl(name, `&text=${encodeURIComponent(name + "Аа Яя0123")}`) }));
    },
    async systemList() {
      if (!this.system) {
        try {
          this.system = await api.systemFonts();
        } catch {
          this.system = [];
        }
      }
      return this.system;
    }
  };

  // скрытые разделы меню
  const nav = {
    scan() {
      if (!cfg) return;
      const hide = [cfg.hideKids && "/kids", cfg.hidePodcasts && "/non-music"].filter(Boolean);
      document.querySelectorAll(".ymm-nav-hidden").forEach((el) => {
        const a = el.querySelector("a[href]");
        if (!a || !hide.some((href) => a.getAttribute("href").startsWith(href))) el.classList.remove("ymm-nav-hidden");
      });
      for (const href of hide) {
        document.querySelectorAll(`a[href^="${href}"]`).forEach((a) => {
          const li = a.closest("li");
          if (li && !li.classList.contains("ymm-nav-hidden") && li.querySelectorAll("a[href]").length === 1) li.classList.add("ymm-nav-hidden");
        });
      }
    }
  };

  // логотип
  const logo = {
    scan() {
      if (!cfg) return;
      const link = $('[class*="NavbarDesktop_logoLink"]') || $('a[aria-label="Главная"]');
      if (!link) return;
      let el = link.querySelector(".ymm-logo");
      if (cfg.logoMode === "original") {
        if (el) el.remove();
        link.classList.remove("ymm-logo-on");
        return;
      }
      const src = cfg.logoMode === "custom" && state.logoUrl ? state.logoUrl : LOGO;
      const key = `${src}|${cfg.logoText}`;
      if (!el) {
        el = h("span", { class: "ymm-logo" });
        link.append(el);
      }
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.replaceChildren(h("img", { src, alt: "" }), cfg.logoText ? h("span", {}, cfg.logoText) : null);
      }
      link.classList.add("ymm-logo-on");
    }
  };

  // статистика
  const stats = {
    key: "", acc: 0, newPlay: false, meta: null, last: performance.now(),
    tick() {
      const now = performance.now();
      const dt = Math.min(5, (now - this.last) / 1000);
      this.last = now;
      if (!audio.playing) return;
      track.read();
      if (!track.title) return;
      const key = `${track.title}|${track.artist}`;
      if (key !== this.key) {
        this.flush();
        this.key = key;
        this.newPlay = true;
      }
      this.meta = { title: track.title, artist: track.artist, cover: track.cover };
      this.acc += dt;
      if (this.acc >= 30) this.flush();
    },
    flush() {
      if (this.acc >= 1 && this.meta) api.statsAdd({ ...this.meta, seconds: Math.round(this.acc), newPlay: this.newPlay }).catch(() => {});
      if (this.acc >= 1) this.newPlay = false;
      this.acc = 0;
    }
  };
  const fmtDur = (sec) => {
    const m = Math.round(sec / 60);
    if (m < 60) return `${m} мин`;
    const hh = Math.floor(m / 60);
    return `${hh} ч ${m % 60} мин`;
  };
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // таймер сна
  const sleep = {
    end: 0, trackEnd: false, trackKey: "", timer: 0, fading: false,
    get on() {
      return Boolean(this.end || this.trackEnd);
    },
    start(min) {
      this.cancel(true);
      if (min === "track") {
        track.read();
        this.trackEnd = true;
        this.trackKey = `${track.title}|${track.artist}`;
        toast("Пауза после этого трека");
      } else {
        this.end = Date.now() + min * 60000;
        this.min = min;
        toast(`Таймер сна: ${min} мин`);
      }
      this.timer = setInterval(() => this.check(), 1000);
      ui.sync();
    },
    check() {
      if (this.trackEnd) {
        track.read();
        if (`${track.title}|${track.artist}` !== this.trackKey) this.fire();
        return;
      }
      const left = this.end - Date.now();
      if (left <= 20000 && !this.fading) {
        this.fading = true;
        if (window.__ymmFx) window.__ymmFx.fade(0, Math.max(1, left / 1000));
      }
      if (left <= 0) this.fire();
      const lab = ui.shadow && ui.shadow.querySelector("[data-st=sleep]");
      if (lab) lab.textContent = this.label();
    },
    fire() {
      const pause = mini.btn(/^Пауза$/, true);
      if (pause) pause.click();
      this.cancel(false);
      setTimeout(() => window.__ymmFx && window.__ymmFx.fade(1, 0.4), 800);
      toast("Спокойной ночи 🌙");
    },
    cancel(silent) {
      clearInterval(this.timer);
      if (this.fading && window.__ymmFx) window.__ymmFx.fade(1, 0.4);
      this.end = 0;
      this.trackEnd = false;
      this.fading = false;
      if (!silent) ui.sync();
    },
    label() {
      if (this.trackEnd) return "до конца трека";
      if (!this.end) return "выключен";
      const s = Math.max(0, Math.round((this.end - Date.now()) / 1000));
      return `осталось ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
  };

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
    lastKey: "", timer: 0, pausedAt: 0, anchor: 0,
    push(force) {
      if (!cfg || !cfg.discordRpc) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.send(force), force ? 120 : 400);
    },
    // Всё, что знаем о текущем треке: и для статуса, и для предпросмотра в настройках.
    payload() {
      track.read();
      if (!track.title) return null;
      trackMeta.read();
      const el = audio.el || [...((window.__ymmAudio && window.__ymmAudio.elements) || [])].find((x) => x.currentTime > 0);
      const position = el ? el.currentTime : NaN;
      const duration = el && Number.isFinite(el.duration) ? el.duration : NaN;
      const origin = "https://music.yandex.ru";
      const album = trackMeta.album;
      const mode = { slowed: "Slowed", nightcore: "Nightcore", "8d": "8D" }[cfg.playMode] || "";
      return {
        title: track.title, artist: track.artist, album: track.album, cover: track.cover, position, duration, paused: !audio.playing, mode,
        rate: window.__ymmFx ? window.__ymmFx.rate : 1,
        year: album && album.year, genre: trackMeta.genre,
        artistCover: trackMeta.artistCover, artistName: (trackMeta.artist && trackMeta.artist.name) || "",
        trackUrl: trackMeta.id ? (trackMeta.albumId ? `${origin}/album/${trackMeta.albumId}/track/${trackMeta.id}` : `${origin}/track/${trackMeta.id}`) : "",
        albumUrl: trackMeta.albumId ? `${origin}/album/${trackMeta.albumId}` : "",
        artistUrl: trackMeta.artistId ? `${origin}/artist/${trackMeta.artistId}` : ""
      };
    },
    send(force) {
      const p = this.payload();
      const hide = p && p.paused && cfg.discordOnPause === "hide" && this.pausedAt && Date.now() - this.pausedAt > cfg.discordPauseHide * 60000;
      const info = p && !hide;
      // Отправляем только при настоящих изменениях: новый трек, пауза, перемотка, смена настроек строк.
      const anchor = info && !p.paused ? Date.now() / 1000 - (p.position || 0) / (p.rate || 1) : 0;
      const seeked = Math.abs(anchor - this.anchor) > 2.5;
      const key = info ? [p.title, p.artist, p.paused ? `p${Math.round(p.position || 0)}` : "", p.artistCover, p.year, p.genre, p.trackUrl, p.mode, cfg.discordShow, cfg.discordLine1, cfg.discordLine2, cfg.discordArtistIcon, cfg.discordArtistButton, cfg.discordAlbumInfo].join("|") : "none";
      if (!force && key === this.lastKey && !seeked) return;
      this.lastKey = key;
      this.anchor = anchor;
      api.discord(info ? p : null).then((st) => {
        state.discord = st;
        ui.refreshStatus();
      }).catch(() => {});
    }
  };

  // mini player
  const mini = {
    on: false, timer: 0, bandTimer: 0, lastBands: 0,
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
        accent: accent.ui, onAccent: luminance(accent.ui) > 0.42 ? "#0b0b0b" : "#ffffff", palette: accent.palette,
        rate: window.__ymmFx ? window.__ymmFx.rate : 1
      };
    },
    push() {
      api.miniState(this.snapshot()).catch(() => {});
    },
    async toggle(v = !this.on) {
      this.on = await api.mini(v);
      clearInterval(this.timer);
      clearInterval(this.bandTimer);
      if (this.on) {
        this.push();
        this.timer = setInterval(() => this.push(), 500);
        // В скрытом окне requestAnimationFrame стоит, поэтому полосы считаем по своему таймеру.
        this.bandTimer = setInterval(() => this.pushBands(), 66);
      }
      ui.sync();
    },
    pushBands() {
      if (!audio.analyser || !audio.playing || cfg.reducedMotion) return;
      const now = performance.now();
      spectrum.update(clamp((now - (this.lastBands || now - 66)) / 1000, 0.01, 0.2));
      this.lastBands = now;
      api.miniState({ partial: true, bands: spectrum.compact(28) }).catch(() => {});
    },
    volume(dir) {
      const rootEl = $(SEL.volRoot);
      const input = rootEl && rootEl.querySelector("input[type=range]");
      if (!input) return;
      const min = Number(input.min || 0), max = Number(input.max || 1);
      const v = clamp(Number(input.value) + dir * ((max - min) / 20), min, max);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      toast(`Громкость ${Math.round(((v - min) / (max - min || 1)) * 100)}%`, { ms: 900 });
    },
    command(cmd, val) {
      const click = (re) => {
        const b = this.btn(re, cmd !== "like");
        if (b) b.click();
      };
      if (cmd === "volup" || cmd === "voldown") return this.volume(cmd === "volup" ? 1 : -1);
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
    clearInterval(mini.bandTimer);
    ui.sync();
  };

  //@include ui.js

  // watchers
  function refreshTargets() {
    const p = $(SEL.playerRoot);
    if (p !== targets.player) {
      targets.player = p;
      if (playerResize) {
        playerResize.disconnect();
        if (p) playerResize.observe(p);
      }
      if (p && beat.level) p.style.setProperty("--ymm-beat", beat.level.toFixed(3));
    }
    if (bg.host && !bg.host.isConnected) {
      bg.host = null;
      bg.ensure();
      bg.currentName = null;
      bg.show(bg.fileFor());
    }
    if (ui.host && !ui.host.isConnected) document.body.append(ui.host);
    volume.scan();
    nav.scan();
    logo.scan();
    layoutCanvas();
    fsFx.check();
    markCurrentRow();
    if (cfg && cfg.cleanVibe) {
      document.querySelectorAll('[class*="WheelItem_root"]').forEach((el) => el.classList.toggle("ymm-artist", /В стиле/i.test(el.textContent || "")));
    }
  }
  const playerResize = window.ResizeObserver ? new ResizeObserver(() => layoutCanvas()) : null;
  let lastTitle = "";
  function pollTrack() {
    track.read();
    if (track.cover) accent.onCover(track.cover);
    const key = `${track.title}|${track.artist}`;
    if (key !== lastTitle) {
      const first = !lastTitle;
      lastTitle = key;
      discord.push(true);
      onTrackChange(first);
    } else {
      discord.push(false);
      // Данные о треке могли приехать позже него самого.
      trackMeta.read();
      sound.updateNorm();
    }
    if (cfg.taskbarProgress && audio.el && Number.isFinite(audio.el.duration) && audio.el.duration > 0) {
      api.playback({ progress: audio.el.currentTime / audio.el.duration, playing: audio.playing }).catch(() => {});
      taskbar.shown = true;
    } else if (taskbar.shown) {
      taskbar.shown = false;
      api.playback({ progress: -1 }).catch(() => {});
    }
    // Название трека в заголовке окна: его видно при наведении на значок в панели задач.
    if (cfg.taskbarTitle && track.title) {
      const wanted = `${track.title} — ${track.artist}`;
      if (document.title !== wanted) document.title = wanted;
      titleSet = true;
    }
  }
  const taskbar = { shown: false };
  function onTrackChange(first) {
    trackMeta.read();
    sound.updateNorm();
    markCurrentRow();
    bg.show(bg.fileFor());
    fsFx.updateCover();
    if (first || !track.title) return;
    const p = targets.player;
    if (p && cfg.uiMotion) {
      p.classList.remove("ymm-track-in");
      void p.offsetWidth;
      p.classList.add("ymm-track-in");
      setTimeout(() => p.classList.remove("ymm-track-in"), 700);
    }
    nowCard.show(track);
    if (cfg.notifyTrack && !document.hasFocus()) api.notify({ title: track.title, body: track.artist, cover: track.cover }).catch(() => {});
  }
  // Лайк: анимация только по настоящему нажатию.
  const likeFx = {
    pop(btn) {
      btn.classList.remove("ymm-like-pop");
      void btn.offsetWidth;
      btn.classList.add("ymm-like-pop");
      setTimeout(() => btn.classList.remove("ymm-like-pop"), 650);
    },
    onClick(e) {
      const btn = e.target.closest && e.target.closest('button[data-test-id="LIKE_BUTTON"]');
      if (!btn) return;
      const wasLiked = btn.getAttribute("aria-pressed") === "true";
      // Состояние кнопки приходит от приложения чуть позже клика.
      setTimeout(() => {
        if (!wasLiked && btn.getAttribute("aria-pressed") === "true") likeFx.pop(btn);
      }, 120);
    }
  };
  // Подсветка играющего трека в списке. Строки виртуальные и пересоздаются, поэтому метим заново.
  function markCurrentRow() {
    const id = trackMeta.id;
    document.querySelectorAll(".ymm-current-row").forEach((el) => {
      const a = el.querySelector('a[href*="trackId="]');
      if (!id || !a || !a.getAttribute("href").includes(`trackId=${id}`)) el.classList.remove("ymm-current-row");
    });
    if (!id) return;
    document.querySelectorAll(`main [class*="CommonTrack_root"] a[href*="trackId=${id}"]`).forEach((a) => {
      if (a.closest('[data-test-id="PLAYERBAR_DESKTOP"]')) return;
      const row = a.closest('[class*="CommonTrack_root"]');
      if (row) row.classList.add("ymm-current-row");
    });
  }
  // Смена страницы: плавно проявляем новое содержимое.
  const pageFx = {
    last: location.pathname + location.search,
    check() {
      const now = location.pathname + location.search;
      if (now === this.last) return;
      this.last = now;
      if (!cfg || !cfg.uiMotion || cfg.reducedMotion) return;
      const main = $("main");
      if (!main) return;
      main.classList.remove("ymm-page-in");
      void main.offsetWidth;
      main.classList.add("ymm-page-in");
      main.addEventListener("animationend", () => main.classList.remove("ymm-page-in"), { once: true });
    },
    init() {
      for (const m of ["pushState", "replaceState"]) {
        const orig = window.history[m];
        window.history[m] = function () {
          const r = orig.apply(this, arguments);
          setTimeout(() => pageFx.check(), 30);
          return r;
        };
      }
      window.addEventListener("popstate", () => setTimeout(() => this.check(), 30));
    }
  };
  // Плеер на весь экран: фон из обложки, холст с волной, наклон обложки за мышью.
  const fsFx = {
    root: null,
    check() {
      const fs = fsPlayer();
      if (fs === this.root) return;
      // Отключили эффект, пока плеер открыт: убираем свои слои, вёрстка Яндекса не должна их видеть.
      if (this.root && this.root.isConnected) this.root.querySelectorAll(".ymm-fs-bg,.ymm-fs-shade").forEach((el) => el.remove());
      this.root = fs;
      document.documentElement.classList.toggle("ymm-fsfx", Boolean(fs));
      // Волна проявляется заново и на новом месте, а не вспыхивает сразу на полную яркость.
      vis.fade = 0;
      if (fs) {
        if (!fs.querySelector(".ymm-fs-bg")) fs.append(h("div", { class: "ymm-fs-bg" }), h("div", { class: "ymm-fs-shade" }));
        this.updateCover();
        vis.init();
        audio.reconnectAll();
        // Окно выезжает с анимацией: центр колец считаем ещё раз, когда обложка встала на место.
        setTimeout(layoutCanvas, 450);
      }
      layoutCanvas();
      loop.kick();
    },
    updateCover() {
      const el = this.root && this.root.querySelector(".ymm-fs-bg");
      if (el && track.cover) el.style.backgroundImage = `url("${track.cover.replace(/\/\d+x\d+$/, "/400x400")}")`;
    },
    tilt(e) {
      const r = this.root;
      if (!r || !cfg.uiMotion || cfg.reducedMotion) return;
      const box = r.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width - 0.5;
      const y = (e.clientY - box.top) / box.height - 0.5;
      const poster = r.querySelector('[class*="FullscreenPlayerDesktopPoster_cover"]');
      if (!poster) return;
      poster.style.setProperty("--ymm-rx", `${(-y * 9).toFixed(2)}deg`);
      poster.style.setProperty("--ymm-ry", `${(x * 11).toFixed(2)}deg`);
    }
  };

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
    pageFx.init();
    const splashWait = setInterval(() => {
      if (!document.querySelector("nav, main") && performance.now() < 8000) return;
      clearInterval(splashWait);
      if (window.__ymmSplashDone) window.__ymmSplashDone();
    }, 120);
    whatsNew.check();
    document.addEventListener("pointermove", (e) => fsFx.root && fsFx.tilt(e), { passive: true });
    document.addEventListener("click", (e) => likeFx.onClick(e), true);
    setInterval(() => fsFx.check(), 700);
    api.playback({ playing: false }).catch(() => {});
    new MutationObserver(debounce(refreshTargets, 250)).observe(document.body, { childList: true, subtree: true });
    // Окно «Настройки звука» открывается только кликом/клавишей, поэтому ищем его после ввода,
    // а не на каждое изменение DOM (на «Моей волне» их десятки в секунду).
    const qCheck = () => {
      [0, 60, 200, 500, 1000].forEach((ms) => setTimeout(() => quality.scan(), ms));
      setTimeout(() => fsFx.check(), 60);
    };
    document.addEventListener("click", qCheck, true);
    document.addEventListener("keyup", (e) => (e.key === "Enter" || e.key === " ") && qCheck(), true);
    // Логотип и меню перерисовываются редко - дешёвой проверки раз в 2 с хватает.
    setInterval(() => {
      logo.scan();
      nav.scan();
    }, 2000);
    setInterval(() => stats.tick(), 1000);
    document.addEventListener("scroll", () => scrolling.on(), { capture: true, passive: true });
    document.addEventListener("wheel", () => scrolling.on(), { capture: true, passive: true });
    // Какие размеры обложек реально показывает приложение - такие и предзагружаем.
    const learnSizes = () => {
      const cv = window.__ymmCovers;
      if (!cv) return;
      const count = {};
      for (const img of document.images) {
        const m = /get-music-content\/.+\/(\d+x\d+)$/.exec(img.src);
        if (m) count[m[1]] = (count[m[1]] || 0) + 1;
      }
      const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
      if (top.length) cv.sizes = top;
    };
    setTimeout(learnSizes, 3000);
    setInterval(learnSizes, 15000);
    window.addEventListener("beforeunload", () => stats.flush());
    window.addEventListener("resize", debounce(layoutCanvas, 100));
    document.addEventListener("visibilitychange", () => {
      bg.syncVideo();
      loop.kick();
    });
    setInterval(() => audio.pollPlaying(), 300);
    setInterval(pollTrack, 1500);
    pollTrack();
    Object.defineProperty(window, "__ymmDebug", { value: { setOpt, get cfg() {
      return cfg;
    }, audio, beat, accent, mini, presets, ui, sound, font, logo, stats, sleep, scrolling, vis, spectrum, trackMeta, discord, history, cmdk, whatsNew, bg, fsFx, likeFx }, configurable: true });
    console.log(`[YMusicMod] v${state.modVersion} ready`);
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
})();
