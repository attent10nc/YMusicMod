/*YMMOD-BEGIN main*/
;(() => {
const ymmElectron = require("electron");
const ymmPath = require("node:path");
const ymmFs = require("node:fs");
const ymmNet = require("node:net");
const ymmCrypto = require("node:crypto");
const { Readable: ymmReadable } = require("node:stream");

const YMM_VERSION = "__YMMOD_VERSION__";
const YMM_DIR = ymmPath.join(ymmElectron.app.getPath("userData"), "YMusicMod");
const YMM_ASSETS = ymmPath.join(YMM_DIR, "assets");
const YMM_CONFIG = ymmPath.join(YMM_DIR, "config.json");
const YMM_SCHEME = "ymmod";
const YMM_IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"];
const YMM_VIDEO_EXT = [".mp4", ".webm", ".mov", ".m4v"];
const YMM_MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".bmp": "image/bmp", ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4v": "video/mp4",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};
const YMM_FONT_EXT = [".ttf", ".otf", ".woff", ".woff2"];
const YMM_LOGO_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".bmp"];
const YMM_STATS = ymmPath.join(YMM_DIR, "stats.json");
const YMM_BACKUPS = ymmPath.join(YMM_DIR, "backups");
const YMM_LOGO_PNG = "__YMMOD_LOGO_PNG__";
const YMM_HEX = /^#[0-9a-fA-F]{6}$/;

const YMM_PRESET_KEYS = [
  "blur", "dim", "saturation", "contentAlpha", "bgMode", "slideInterval", "accentMode", "accent", "rounded", "glow",
  "playerGlass", "hideWaveArt", "beatSync", "beatIntensity", "bgPulse", "thumbStyle", "thumbRainbow",
  "visualizer", "visualizerOpacity", "reducedMotion", "cleanVibe",
  "visPlace", "visHeight", "visColor", "visColor1", "visColor2", "visSym", "visGlow", "visSens", "visSmooth"
];
const YMM_VIS_MODES = ["off", "bars", "wave", "mirror", "aurora", "scope", "rings", "stars"];
const YMM_DEFAULTS = {
  version: 2,
  backgroundFile: null, backgrounds: [], bgMode: "single", slideInterval: 10,
  dayFile: null, nightFile: null, dayStartHour: 8, nightStartHour: 20,
  blur: 0, dim: 30, saturation: 100, contentAlpha: 55,
  accentMode: "fixed", accent: "#f2f2f2",
  rounded: true, glow: true, playerGlass: 18, hideWaveArt: true,
  beatSync: true, beatIntensity: 70, bgPulse: true,
  thumbStyle: "default", thumbRainbow: false,
  visualizer: "wave", visualizerOpacity: 70,
  reducedMotion: false, hideButton: false, volumeWheel: true,
  discordRpc: true, discordClientId: "1558904911515754496",
  cleanVibe: true, miniAutoHide: true, miniPos: null,
  presets: {}, activePreset: null,
  sound: "studio", studioAmount: 60, studioWidth: 50, studioAmbience: 20, leveler: false, playMode: "normal",
  fontFamily: "", fontSource: "", fontFile: null, fontHeadings: true, fontFiles: [],
  logoMode: "mod", logoFile: null, logoText: "YMusicMod", logoWindowIcon: false,
  hideKids: true, hidePodcasts: true,
  prefetchCovers: true, scrollBoost: true,
  // Визуализатор
  visPlace: "bar", visHeight: 120, visColor: "accent", visColor1: "#ffffff", visColor2: "#8c8c8c",
  visSym: true, visGlow: 60, visSens: 55, visSmooth: 50, visFps: 60, visFsMode: "rings",
  // Интерфейс
  uiMotion: true, splash: true, panelPeek: true, trackToast: false, notifyTrack: false,
  globalKeys: true, taskbarTitle: true, taskbarProgress: false, fullscreenFx: true, seenVersion: "",
  recentColors: [],
  // Звук
  soundProfile: "balanced", studioBass: 0, balance: 0, playRate: 100, preservePitch: true, loudnessNorm: false,
  // Discord
  discordShow: "title", discordLine1: "{title}", discordLine2: "{artist}", discordArtistIcon: true,
  discordArtistButton: true, discordAlbumInfo: true, discordOnPause: "show", discordPauseHide: 10,
  modVersion: ""
};
const YMM_LINE = (v, d) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").slice(0, 80) : d);
const ymmClamp = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d;
};
const ymmEnum = (v, list, d) => (list.includes(v) ? v : d);
// Имя шрифта попадает в CSS - вырезаем всё, что может закрыть строку или правило.
const ymmCssName = (v, n) => String(v).replace(/["'\\;{}<>()]/g, "").trim().slice(0, n);
const ymmSafeFile = (v) => (typeof v === "string" && /^[\w.-]+$/.test(v) && ymmFs.existsSync(ymmPath.join(YMM_ASSETS, v)) ? v : null);

const ymmSanitize = (raw, base = YMM_DEFAULTS) => {
  const c = { ...base };
  const r = raw && typeof raw === "object" ? raw : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(r, k);
  if (has("backgroundFile")) c.backgroundFile = r.backgroundFile === null ? null : ymmSafeFile(r.backgroundFile);
  if (has("backgrounds") && Array.isArray(r.backgrounds)) c.backgrounds = [...new Set(r.backgrounds.map(ymmSafeFile).filter(Boolean))];
  if (has("dayFile")) c.dayFile = ymmSafeFile(r.dayFile);
  if (has("nightFile")) c.nightFile = ymmSafeFile(r.nightFile);
  if (has("bgMode")) c.bgMode = ymmEnum(r.bgMode, ["single", "slideshow", "daynight", "cover"], c.bgMode);
  if (has("slideInterval")) c.slideInterval = ymmClamp(r.slideInterval, 1, 240, c.slideInterval);
  if (has("dayStartHour")) c.dayStartHour = Math.round(ymmClamp(r.dayStartHour, 0, 23, c.dayStartHour));
  if (has("nightStartHour")) c.nightStartHour = Math.round(ymmClamp(r.nightStartHour, 0, 23, c.nightStartHour));
  if (has("blur")) c.blur = ymmClamp(r.blur, 0, 60, c.blur);
  if (has("dim")) c.dim = ymmClamp(r.dim, 0, 95, c.dim);
  if (has("saturation")) c.saturation = ymmClamp(r.saturation, 0, 200, c.saturation);
  if (has("contentAlpha")) c.contentAlpha = ymmClamp(r.contentAlpha, 0, 100, c.contentAlpha);
  if (has("accentMode")) c.accentMode = ymmEnum(r.accentMode, ["off", "fixed", "cover"], c.accentMode);
  if (has("accent")) c.accent = typeof r.accent === "string" && YMM_HEX.test(r.accent) ? r.accent.toLowerCase() : c.accent;
  for (const k of ["rounded", "glow", "hideWaveArt", "beatSync", "bgPulse", "thumbRainbow", "reducedMotion", "hideButton", "volumeWheel", "discordRpc", "cleanVibe", "miniAutoHide"]) {
    if (has(k)) c[k] = Boolean(r[k]);
  }
  if (has("playerGlass")) c.playerGlass = ymmClamp(r.playerGlass, 0, 40, c.playerGlass);
  if (has("beatIntensity")) c.beatIntensity = ymmClamp(r.beatIntensity, 0, 100, c.beatIntensity);
  if (has("thumbStyle")) c.thumbStyle = ymmEnum(r.thumbStyle, ["pinwheel", "orb", "default"], c.thumbStyle);
  if (has("visualizer")) c.visualizer = ymmEnum(r.visualizer, YMM_VIS_MODES, c.visualizer);
  if (has("visualizerOpacity")) c.visualizerOpacity = ymmClamp(r.visualizerOpacity, 10, 100, c.visualizerOpacity);
  if (has("visPlace")) c.visPlace = ymmEnum(r.visPlace, ["bar", "full"], c.visPlace);
  if (has("visHeight")) c.visHeight = ymmClamp(r.visHeight, 48, 280, c.visHeight);
  if (has("visColor")) c.visColor = ymmEnum(r.visColor, ["cover", "accent", "rainbow", "custom"], c.visColor);
  for (const k of ["visColor1", "visColor2"]) if (has(k) && typeof r[k] === "string" && YMM_HEX.test(r[k])) c[k] = r[k].toLowerCase();
  if (has("visGlow")) c.visGlow = ymmClamp(r.visGlow, 0, 100, c.visGlow);
  if (has("visSens")) c.visSens = ymmClamp(r.visSens, 0, 100, c.visSens);
  if (has("visSmooth")) c.visSmooth = ymmClamp(r.visSmooth, 0, 100, c.visSmooth);
  if (has("visFps")) c.visFps = ymmEnum(Number(r.visFps), [30, 60, 120], c.visFps);
  if (has("visFsMode")) c.visFsMode = ymmEnum(r.visFsMode, YMM_VIS_MODES.filter((m) => m !== "off"), c.visFsMode);
  for (const k of ["visSym", "uiMotion", "splash", "panelPeek", "trackToast", "notifyTrack", "globalKeys", "taskbarTitle", "taskbarProgress", "fullscreenFx", "preservePitch", "loudnessNorm", "discordArtistIcon", "discordArtistButton", "discordAlbumInfo"]) {
    if (has(k)) c[k] = Boolean(r[k]);
  }
  if (has("seenVersion")) c.seenVersion = typeof r.seenVersion === "string" ? r.seenVersion.slice(0, 40) : c.seenVersion;
  if (has("modVersion")) c.modVersion = typeof r.modVersion === "string" ? r.modVersion.slice(0, 40) : c.modVersion;
  if (has("recentColors") && Array.isArray(r.recentColors)) c.recentColors = r.recentColors.filter((x) => typeof x === "string" && YMM_HEX.test(x)).slice(0, 8);
  if (has("soundProfile")) c.soundProfile = ymmEnum(r.soundProfile, ["balanced", "warm", "club", "vocal", "night"], c.soundProfile);
  if (has("studioBass")) c.studioBass = ymmClamp(r.studioBass, -6, 9, c.studioBass);
  if (has("balance")) c.balance = ymmClamp(r.balance, -100, 100, c.balance);
  if (has("playRate")) c.playRate = ymmClamp(r.playRate, 50, 200, c.playRate);
  if (has("discordShow")) c.discordShow = ymmEnum(r.discordShow, ["title", "artist", "app"], c.discordShow);
  if (has("discordLine1")) c.discordLine1 = YMM_LINE(r.discordLine1, c.discordLine1);
  if (has("discordLine2")) c.discordLine2 = YMM_LINE(r.discordLine2, c.discordLine2);
  if (has("discordOnPause")) c.discordOnPause = ymmEnum(r.discordOnPause, ["show", "hide"], c.discordOnPause);
  if (has("discordPauseHide")) c.discordPauseHide = ymmClamp(r.discordPauseHide, 1, 120, c.discordPauseHide);
  if (has("discordClientId")) c.discordClientId = typeof r.discordClientId === "string" && /^\d{0,24}$/.test(r.discordClientId.trim()) ? r.discordClientId.trim() : c.discordClientId;
  if (has("presets") && r.presets && typeof r.presets === "object") {
    const out = {};
    for (const [name, p] of Object.entries(r.presets).slice(0, 50)) {
      const n = String(name).slice(0, 40).trim();
      if (n) out[n] = ymmPickPreset(ymmSanitize(p, c));
    }
    c.presets = out;
  }
  if (has("miniPos")) c.miniPos = r.miniPos && Number.isFinite(r.miniPos.x) && Number.isFinite(r.miniPos.y) ? { x: Math.round(r.miniPos.x), y: Math.round(r.miniPos.y) } : null;
  if (has("sound")) c.sound = ymmEnum(r.sound, ["off", "studio"], c.sound);
  if (has("studioAmount")) c.studioAmount = ymmClamp(r.studioAmount, 0, 100, c.studioAmount);
  if (has("studioWidth")) c.studioWidth = ymmClamp(r.studioWidth, 0, 100, c.studioWidth);
  if (has("studioAmbience")) c.studioAmbience = ymmClamp(r.studioAmbience, 0, 100, c.studioAmbience);
  if (has("playMode")) c.playMode = ymmEnum(r.playMode, ["normal", "slowed", "nightcore", "8d"], c.playMode);
  for (const k of ["leveler", "fontHeadings", "logoWindowIcon", "hideKids", "hidePodcasts", "prefetchCovers", "scrollBoost"]) {
    if (has(k)) c[k] = Boolean(r[k]);
  }
  if (has("fontFamily")) c.fontFamily = typeof r.fontFamily === "string" ? ymmCssName(r.fontFamily, 80) : "";
  if (has("fontSource")) c.fontSource = ymmEnum(r.fontSource, ["", "google", "system", "file"], c.fontSource);
  if (has("fontFile")) c.fontFile = r.fontFile === null ? null : ymmSafeFile(r.fontFile);
  if (has("fontFiles") && Array.isArray(r.fontFiles)) {
    c.fontFiles = r.fontFiles.filter((f) => f && ymmSafeFile(f.file)).map((f) => ({ file: f.file, name: ymmCssName(String(f.name || f.file), 60) })).slice(0, 100);
  }
  if (has("logoMode")) c.logoMode = ymmEnum(r.logoMode, ["original", "mod", "custom"], c.logoMode);
  if (has("logoFile")) c.logoFile = r.logoFile === null ? null : ymmSafeFile(r.logoFile);
  if (has("logoText")) c.logoText = typeof r.logoText === "string" ? r.logoText.slice(0, 24) : c.logoText;
  if (has("activePreset")) c.activePreset = typeof r.activePreset === "string" ? r.activePreset.slice(0, 40) : null;
  if (c.backgroundFile && !c.backgrounds.includes(c.backgroundFile)) c.backgrounds.push(c.backgroundFile);
  return c;
};
const ymmPickPreset = (c) => {
  const p = {};
  for (const k of YMM_PRESET_KEYS) p[k] = c[k];
  if (c.backgroundFile) p.backgroundFile = c.backgroundFile;
  return p;
};

const ymmEnsureDirs = () => ymmFs.mkdirSync(YMM_ASSETS, { recursive: true });
// Резервные копии настроек: при смене версии мода и раз в день, храним последние 20.
const ymmBackupList = () => {
  try {
    return ymmFs.readdirSync(YMM_BACKUPS).filter((f) => /^config-[\w.-]+\.json$/.test(f)).sort().reverse();
  } catch {
    return [];
  }
};
const ymmStamp = () => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const ymmBackup = (reason) => {
  try {
    if (!ymmFs.existsSync(YMM_CONFIG)) return null;
    ymmFs.mkdirSync(YMM_BACKUPS, { recursive: true });
    const name = `config-${ymmStamp()}-${String(reason).replace(/[^\w.-]/g, "")}.json`;
    ymmFs.copyFileSync(YMM_CONFIG, ymmPath.join(YMM_BACKUPS, name));
    for (const old of ymmBackupList().slice(20)) ymmFs.unlinkSync(ymmPath.join(YMM_BACKUPS, old));
    return name;
  } catch (e) {
    console.warn("[YMusicMod] backup failed", e);
    return null;
  }
};
const ymmReadJson = (file) => {
  const v = JSON.parse(ymmFs.readFileSync(file, "utf8"));
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
  return v;
};
// Битый config.json не должен стирать настройки: откладываем его и берём свежую копию.
const ymmReadConfig = () => {
  if (!ymmFs.existsSync(YMM_CONFIG)) return null;
  try {
    return ymmReadJson(YMM_CONFIG);
  } catch (e) {
    console.warn("[YMusicMod] config is broken, restoring from backup", e && e.message);
    try {
      ymmFs.renameSync(YMM_CONFIG, ymmPath.join(YMM_DIR, `config.broken-${ymmStamp()}.json`));
    } catch {
    }
    for (const name of ymmBackupList()) {
      try {
        return ymmReadJson(ymmPath.join(YMM_BACKUPS, name));
      } catch {
      }
    }
    return null;
  }
};
const ymmWriteConfigNow = (cfg) => {
  ymmEnsureDirs();
  const tmp = YMM_CONFIG + ".tmp";
  ymmFs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
  ymmFs.renameSync(tmp, YMM_CONFIG);
};
let ymmConfigCache = null;
const ymmLoad = () => {
  if (ymmConfigCache) return ymmConfigCache;
  ymmEnsureDirs();
  let raw = ymmReadConfig();
  if (raw && raw.modVersion !== YMM_VERSION) ymmBackup(`before-${YMM_VERSION}`);
  else if (raw && !ymmBackupList().some((f) => f.startsWith(`config-${ymmStamp().slice(0, 10)}`))) ymmBackup("daily");
  // Миграция нужна только старым конфигам без поля version; первый запуск получает дефолты.
  if (!raw || typeof raw !== "object") raw = { version: 2 };
  else if (!raw.version) {
    raw = { ...raw, accentMode: raw.accent ? "fixed" : "off", thumbStyle: "pinwheel", visualizer: "off" };
    const existing = ymmFs.readdirSync(YMM_ASSETS).filter((f) => [...YMM_IMAGE_EXT, ...YMM_VIDEO_EXT].includes(ymmPath.extname(f).toLowerCase()));
    raw.backgrounds = existing;
  }
  const upgraded = raw.modVersion !== YMM_VERSION;
  ymmConfigCache = ymmSanitize({ ...raw, modVersion: YMM_VERSION });
  // Сразу записываем новую версию, иначе копия «перед обновлением» делалась бы при каждом запуске.
  if (upgraded) ymmSave(ymmConfigCache);
  return ymmConfigCache;
};
let ymmSaveTimer = null;
const ymmSave = (cfg) => {
  ymmConfigCache = cfg;
  clearTimeout(ymmSaveTimer);
  ymmSaveTimer = setTimeout(() => {
    ymmSaveTimer = null;
    try {
      ymmWriteConfigNow(cfg);
    } catch (e) {
      console.warn("[YMusicMod] save failed", e);
    }
  }, 300);
};
const ymmFlushSave = () => {
  if (!ymmSaveTimer || !ymmConfigCache) return;
  clearTimeout(ymmSaveTimer);
  ymmSaveTimer = null;
  try {
    ymmWriteConfigNow(ymmConfigCache);
  } catch {
  }
};
ymmElectron.app.on("before-quit", ymmFlushSave);

const ymmPayload = () => {
  const cfg = ymmLoad();
  const files = cfg.backgrounds.map((name) => {
    const ext = ymmPath.extname(name).toLowerCase();
    let size = 0;
    let mtime = 0;
    try {
      const st = ymmFs.statSync(ymmPath.join(YMM_ASSETS, name));
      size = st.size;
      mtime = Math.round(st.mtimeMs);
    } catch {
    }
    return { name, kind: YMM_VIDEO_EXT.includes(ext) ? "video" : "image", size, url: `${YMM_SCHEME}://assets/${encodeURIComponent(name)}?v=${mtime}` };
  });
  let appVersion = "";
  try {
    appVersion = ymmElectron.app.getVersion();
  } catch {
  }
  const assetUrl = (name) => {
    if (!name) return null;
    let mtime = 0;
    try {
      mtime = Math.round(ymmFs.statSync(ymmPath.join(YMM_ASSETS, name)).mtimeMs);
    } catch {
      return null;
    }
    return `${YMM_SCHEME}://assets/${encodeURIComponent(name)}?v=${mtime}`;
  };
  const fonts = cfg.fontFiles.map((f) => ({ ...f, url: assetUrl(f.file) })).filter((f) => f.url);
  return { config: cfg, defaults: YMM_DEFAULTS, files, fonts, logoUrl: assetUrl(cfg.logoFile), modVersion: YMM_VERSION, appVersion, discord: ymmDiscord.status() };
};

// Протокол ymmod:// (фоны и окно мини-плеера)
const ymmServeAsset = async (request) => {
  try {
    const url = new URL(request.url);
    if (url.hostname === "mini") return new Response(YMM_MINI_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
    if (url.hostname !== "assets") return new Response("not found", { status: 404 });
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!/^[\w.-]+$/.test(name)) return new Response("bad name", { status: 400 });
    const file = ymmPath.join(YMM_ASSETS, name);
    const st = await ymmFs.promises.stat(file);
    const type = YMM_MIME[ymmPath.extname(name).toLowerCase()] || "application/octet-stream";
    const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" };
    const range = request.headers.get("range");
    const m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] ? Number(m[1]) : 0;
      let end = m[2] ? Number(m[2]) : st.size - 1;
      if (!m[1] && m[2]) {
        start = Math.max(0, st.size - Number(m[2]));
        end = st.size - 1;
      }
      end = Math.min(end, st.size - 1);
      if (start > end || start >= st.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
      const stream = ymmReadable.toWeb(ymmFs.createReadStream(file, { start, end }));
      return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": String(end - start + 1) } });
    }
    return new Response(ymmReadable.toWeb(ymmFs.createReadStream(file)), { status: 200, headers: { ...headers, "Content-Length": String(st.size) } });
  } catch {
    return new Response("not found", { status: 404 });
  }
};
ymmElectron.app.whenReady().then(() => {
  try {
    ymmElectron.protocol.handle(YMM_SCHEME, ymmServeAsset);
  } catch (e) {
    console.warn("[YMusicMod] protocol failed", e);
  }
});

// Discord Rich Presence
const ymmDiscord = (() => {
  let sock = null, ready = false, clientId = "", wanted = false, lastActivity = null, retryTimer = null, buf = Buffer.alloc(0);
  let lastError = "", user = "", lastAck = 0, lastSent = 0, sendTimer = null, retryDelay = 5000, plain = false;
  const frame = (op, obj) => {
    const json = Buffer.from(JSON.stringify(obj), "utf8");
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0);
    head.writeInt32LE(json.length, 4);
    return Buffer.concat([head, json]);
  };
  const send = (op, obj) => {
    if (sock && !sock.destroyed) sock.write(frame(op, obj));
  };
  // Discord пропускает 5 обновлений за 20 секунд и молча глотает лишнее. Новый трек уходит сразу,
  // серия перемоток склеивается: через паузу отправится только последнее состояние.
  const YMM_RPC_GAP = 4200;
  const pushActivity = () => {
    if (!ready) return;
    clearTimeout(sendTimer);
    const wait = lastSent + YMM_RPC_GAP - Date.now();
    if (wait > 0) {
      sendTimer = setTimeout(pushActivity, wait);
      return;
    }
    lastSent = Date.now();
    let activity = lastActivity || undefined;
    if (activity && plain) {
      activity = { ...activity, assets: { ...activity.assets } };
      delete activity.assets.large_url;
      delete activity.assets.small_url;
    }
    send(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity }, nonce: ymmCrypto.randomUUID() });
  };
  const cleanup = () => {
    ready = false;
    if (sock) {
      sock.removeAllListeners();
      sock.destroy();
    }
    sock = null;
    buf = Buffer.alloc(0);
  };
  // Discord перезапустили - подхватываем быстро, если его долго нет - стучимся реже.
  const scheduleRetry = () => {
    clearTimeout(retryTimer);
    if (!wanted) return;
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 1.6, 60000);
  };
  const onMessage = (op, msg) => {
    if (op === 1 && msg && msg.evt === "READY") {
      ready = true;
      lastError = "";
      retryDelay = 5000;
      lastSent = 0;
      user = (msg.data && msg.data.user && (msg.data.user.global_name || msg.data.user.username)) || "";
      pushActivity();
    } else if (op === 1 && msg && msg.evt === "ERROR") {
      lastError = (msg.data && msg.data.message) || "ошибка Discord";
      console.warn("[YMusicMod] discord error", lastError);
      // Старая версия Discord может не знать про ссылки на картинках. Лучше статус без них, чем никакого.
      if (msg.cmd === "SET_ACTIVITY" && !plain) {
        plain = true;
        lastSent = 0;
        pushActivity();
      }
    } else if (op === 1 && msg && msg.cmd === "SET_ACTIVITY" && msg.evt !== "ERROR") {
      lastAck = Date.now();
      lastError = "";
    } else if (op === 2) {
      lastError = (msg && msg.message) || "Discord закрыл соединение (проверь Application ID)";
      cleanup();
      scheduleRetry();
    } else if (op === 3) {
      send(4, msg);
    }
  };
  const tryPipe = (i) => {
    if (i > 9) {
      lastError = "Discord не запущен";
      scheduleRetry();
      return;
    }
    const s = ymmNet.createConnection(`\\\\?\\pipe\\discord-ipc-${i}`);
    s.once("error", () => {
      s.destroy();
      tryPipe(i + 1);
    });
    s.once("connect", () => {
      s.removeAllListeners("error");
      sock = s;
      s.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 8) {
          const op = buf.readInt32LE(0);
          const len = buf.readInt32LE(4);
          if (buf.length < 8 + len) break;
          let msg = null;
          try {
            msg = JSON.parse(buf.subarray(8, 8 + len).toString("utf8"));
          } catch {
          }
          buf = buf.subarray(8 + len);
          onMessage(op, msg);
        }
      });
      const drop = () => {
        cleanup();
        scheduleRetry();
      };
      s.on("error", drop);
      s.on("close", drop);
      send(0, { v: 1, client_id: clientId });
    });
  };
  function connect() {
    cleanup();
    if (!wanted || !clientId) return;
    tryPipe(0);
  }
  return {
    configure(enabled, id) {
      const changed = id !== clientId;
      wanted = Boolean(enabled && id);
      clientId = id || "";
      if (!wanted) {
        clearTimeout(retryTimer);
        if (ready) send(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid }, nonce: ymmCrypto.randomUUID() });
        setTimeout(cleanup, 200);
        lastError = "";
        return;
      }
      if (changed || !sock) connect();
    },
    setActivity(a) {
      lastActivity = a;
      pushActivity();
    },
    status() {
      return { connected: ready, error: lastError, user, lastAck, hasActivity: Boolean(lastActivity) };
    }
  };
})();
const ymmFmtTime = (sec) => {
  const t = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const YMM_MUSIC_URL = /^https:\/\/music\.yandex\.(ru|com|by|kz|uz)\//;
const ymmBuildActivity = (p, cfg) => {
  if (!p || typeof p !== "object" || !p.title) return null;
  const s = (v, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const pad = (v) => (v.length < 2 ? v.padEnd(2, " ") : v);
  const link = (v) => (typeof v === "string" && YMM_MUSIC_URL.test(v) && v.length < 256 ? v : "");
  const title = s(p.title);
  const artist = s(p.artist) || "Яндекс Музыка";
  const firstArtist = s(p.artistName) || artist.split(",")[0].trim();
  const album = s(p.album);
  const year = Number.isFinite(p.year) && p.year > 1800 ? String(p.year) : "";
  const genre = s(p.genre, 40);
  const mode = s(p.mode, 20);
  const fill = (tpl) => String(tpl).replace(/\{(title|artist|album|year|genre|mode)\}/g, (_, k) => ({ title, artist, album, year, genre, mode })[k] || "").replace(/\s+·\s+$/, "").replace(/\s{2,}/g, " ").trim();
  const search = `https://music.yandex.ru/search?text=${encodeURIComponent(`${artist} ${title}`.trim())}`;
  const trackUrl = link(p.trackUrl) || search;
  const artistUrl = link(p.artistUrl) || `https://music.yandex.ru/search?text=${encodeURIComponent(firstArtist)}`;
  const albumUrl = link(p.albumUrl) || trackUrl;
  const rate = Number.isFinite(p.rate) && p.rate > 0 ? p.rate : 1;
  const line1 = fill(cfg.discordLine1) || title;
  let line2 = fill(cfg.discordLine2) || artist;
  if (mode && !/\{mode\}/.test(cfg.discordLine2)) line2 = `${line2} · ${mode}`;
  const info = [album, cfg.discordAlbumInfo ? year : "", cfg.discordAlbumInfo ? genre : ""].filter(Boolean).join(" · ");
  const a = {
    type: 2,
    status_display_type: { app: 0, artist: 1, title: 2 }[cfg.discordShow],
    details: pad(line1.slice(0, 120)),
    details_url: trackUrl,
    state: pad((p.paused ? `На паузе · ${ymmFmtTime(p.position / rate)} / ${ymmFmtTime(p.duration / rate)}` : line2).slice(0, 120)),
    state_url: artistUrl,
    assets: { large_text: pad((info || "Яндекс Музыка").slice(0, 120)), large_url: albumUrl },
    buttons: [{ label: "Слушать трек", url: trackUrl }],
    instance: false
  };
  if (cfg.discordArtistButton && firstArtist) a.buttons.push({ label: `Артист: ${firstArtist}`.slice(0, 32), url: artistUrl });
  // Discord сам забирает картинку по ссылке. 1000x1000 вместо 400x400 - обложка не мылится на больших экранах.
  const hd = (u) => u.replace(/\/\d+x\d+$/, "/1000x1000");
  if (typeof p.cover === "string" && /^https:\/\//.test(p.cover) && p.cover.length < 256) a.assets.large_image = hd(p.cover);
  const icon = cfg.discordArtistIcon && typeof p.artistCover === "string" && /^https:\/\//.test(p.artistCover) && p.artistCover.length < 256 && p.artistCover !== p.cover ? p.artistCover : "";
  a.assets.small_image = icon || "https://raw.githubusercontent.com/attent10nc/YMusicMod/main/assets/logo-256.png";
  a.assets.small_text = pad((p.paused ? "На паузе" : icon ? firstArtist : mode || "Яндекс Музыка").slice(0, 120));
  if (icon) a.assets.small_url = artistUrl;
  // На slowed и nightcore трек реально длится дольше или короче - полоска в Discord должна это знать.
  const now = Date.now();
  if (!p.paused && Number.isFinite(p.position) && Number.isFinite(p.duration) && p.duration > 0) {
    a.timestamps = { start: Math.round(now - (p.position / rate) * 1000), end: Math.round(now + ((p.duration - p.position) / rate) * 1000) };
  }
  return a;
};

// Мини-плеер
const YMM_MINI_HTML = __YMMOD_MINI_HTML__;
const YMM_MINI_PRELOAD = 'const { contextBridge, ipcRenderer } = require("electron");\n' +
  'contextBridge.exposeInMainWorld("ymmMini", { cmd: (c, v) => ipcRenderer.send("ymmod-mini:cmd", c, v), onState: (cb) => ipcRenderer.on("ymmod-mini:state", (_e, s) => cb(s)) });\n';
const YMM_MINI_W = 480, YMM_MINI_H = 156;
const ymmMini = { win: null, main: null, pos: null, userHidden: false, fsHidden: false, ghost: false, watcher: null, quitting: false };
const YMM_FS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class YmmW {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int cb; public R m; public R w; public uint f; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MI i);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static string State(uint self) {
    IntPtr h = GetForegroundWindow(); if (h == IntPtr.Zero) return "0";
    uint pid; GetWindowThreadProcessId(h, out pid);
    StringBuilder sb = new StringBuilder(64); GetClassName(h, sb, 64); string c = sb.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return "0";
    R r; GetWindowRect(h, out r); MI mi = new MI(); mi.cb = Marshal.SizeOf(typeof(MI));
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return "0";
    bool covers = r.L <= mi.m.L && r.T <= mi.m.T && r.Rt >= mi.m.Rt && r.B >= mi.m.B;
    bool caption = (GetWindowLong(h, -16) & 0x00C00000) == 0x00C00000;
    return (covers && !caption) ? "1:" + pid : "0";
  }
}
'@
$parent = [int]$args[0]
$last = ''
while ($true) {
  if (-not (Get-Process -Id $parent -ErrorAction SilentlyContinue)) { exit }
  $s = [YmmW]::State(0)
  if ($s -ne $last) { [Console]::Out.WriteLine($s); [Console]::Out.Flush(); $last = $s }
  Start-Sleep -Milliseconds 1000
}
`;
const ymmOwnPids = () => {
  try {
    return new Set(ymmElectron.app.getAppMetrics().map((m) => m.pid));
  } catch {
    return new Set([process.pid]);
  }
};
const ymmStartFsWatcher = () => {
  if (ymmMini.watcher || process.platform !== "win32") return;
  const cfg = ymmLoad();
  if (!cfg.miniAutoHide) return;
  try {
    const cp = require("node:child_process");
    const script = YMM_FS_SCRIPT.replace("[int]$args[0]", String(process.pid));
    const child = cp.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let acc = "";
    child.stdout.on("data", (d) => {
      acc += d.toString();
      let i;
      while ((i = acc.indexOf("\n")) >= 0) {
        const line = acc.slice(0, i).trim();
        acc = acc.slice(i + 1);
        const [flag, pid] = line.split(":");
        const fs = flag === "1" && !ymmOwnPids().has(Number(pid));
        ymmMini.fsHidden = fs;
        ymmApplyMiniVisibility();
      }
    });
    child.on("exit", () => {
      if (ymmMini.watcher === child) ymmMini.watcher = null;
    });
    ymmMini.watcher = child;
  } catch (e) {
    console.warn("[YMusicMod] fs watcher", e);
  }
};
const ymmStopFsWatcher = () => {
  if (ymmMini.watcher) {
    try {
      ymmMini.watcher.kill();
    } catch {
    }
  }
  ymmMini.watcher = null;
  ymmMini.fsHidden = false;
};
const ymmApplyMiniVisibility = () => {
  const win = ymmMini.win;
  if (!win || win.isDestroyed()) return;
  const hide = ymmMini.userHidden || ymmMini.fsHidden;
  if (hide && win.isVisible()) win.hide();
  else if (!hide && !win.isVisible()) win.showInactive();
};
const ymmSetGhost = (on) => {
  ymmMini.ghost = on;
  const win = ymmMini.win;
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(on, { forward: true });
  win.setOpacity(on ? 0.55 : 1);
  win.webContents.send("ymmod-mini:state", { ghost: on, partial: true });
};
const ymmMiniShortcuts = (on) => {
  const gs = ymmElectron.globalShortcut;
  try {
    if (on) {
      gs.register("CommandOrControl+Alt+M", () => {
        ymmMini.userHidden = !ymmMini.userHidden;
        ymmApplyMiniVisibility();
      });
      gs.register("CommandOrControl+Alt+G", () => ymmSetGhost(!ymmMini.ghost));
    } else {
      gs.unregister("CommandOrControl+Alt+M");
      gs.unregister("CommandOrControl+Alt+G");
    }
  } catch (e) {
    console.warn("[YMusicMod] shortcuts", e);
  }
};
const ymmSetMini = (mainWin, on) => {
  const open = ymmMini.win && !ymmMini.win.isDestroyed();
  if (!on) {
    if (open) ymmMini.win.close();
    return false;
  }
  if (open) {
    ymmMini.userHidden = false;
    ymmApplyMiniVisibility();
    return true;
  }
  ymmEnsureDirs();
  const preload = ymmPath.join(YMM_DIR, "mini-preload.js");
  ymmFs.writeFileSync(preload, YMM_MINI_PRELOAD, "utf8");
  const area = ymmElectron.screen.getDisplayMatching(mainWin.getBounds()).workArea;
  const saved = ymmLoad().miniPos;
  let pos = ymmMini.pos || saved || { x: area.x + area.width - YMM_MINI_W - 12, y: area.y + area.height - YMM_MINI_H - 12 };
  // Позиция могла остаться с отключённого монитора.
  const onScreen = ymmElectron.screen.getAllDisplays().some((d) => pos.x >= d.workArea.x - 50 && pos.y >= d.workArea.y - 50 && pos.x < d.workArea.x + d.workArea.width - 100 && pos.y < d.workArea.y + d.workArea.height - 60);
  if (!onScreen) pos = { x: area.x + area.width - YMM_MINI_W - 12, y: area.y + area.height - YMM_MINI_H - 12 };
  const win = new ymmElectron.BrowserWindow({
    ...pos, width: YMM_MINI_W, height: YMM_MINI_H, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false,
    fullscreenable: false, alwaysOnTop: true, show: false, hasShadow: false, focusable: false, skipTaskbar: true,
    backgroundColor: "#00000000", title: "Яндекс Музыка · мини",
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.setAlwaysOnTop(true, "floating");
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.loadURL(`${YMM_SCHEME}://mini/`);
  win.once("ready-to-show", () => ymmApplyMiniVisibility());
  win.on("moved", () => {
    const b = win.getBounds();
    ymmMini.pos = { x: b.x, y: b.y };
    const c = { ...ymmLoad(), miniPos: ymmMini.pos };
    ymmSave(c);
  });
  win.on("closed", () => {
    ymmMini.win = null;
    ymmMini.ghost = false;
    ymmMini.userHidden = false;
    ymmStopFsWatcher();
    ymmMiniShortcuts(false);
    if (mainWin && !mainWin.isDestroyed() && !ymmMini.quitting) {
      mainWin.webContents.setBackgroundThrottling(true);
      mainWin.show();
      mainWin.webContents.executeJavaScript("window.__ymmMiniClosed && window.__ymmMiniClosed()").catch(() => {});
    }
  });
  ymmMini.win = win;
  ymmMini.main = mainWin;
  ymmMini.userHidden = false;
  ymmMiniShortcuts(true);
  ymmStartFsWatcher();
  // Скрытое окно Chromium притормаживает, и плеер реагирует на кнопки с задержкой.
  mainWin.webContents.setBackgroundThrottling(false);
  mainWin.hide();
  return true;
};
ymmElectron.app.on("will-quit", () => {
  ymmStopFsWatcher();
  ymmGlobalKeysOn = false;
  try {
    ymmElectron.globalShortcut.unregisterAll();
  } catch {
  }
});
ymmElectron.ipcMain.on("ymmod-mini:cmd", (e, cmd, val) => {
  const { win, main } = ymmMini;
  if (!win || win.isDestroyed() || e.sender !== win.webContents) return;
  if (cmd === "restore") {
    win.close();
    return;
  }
  if (cmd === "hide") {
    ymmMini.userHidden = true;
    ymmApplyMiniVisibility();
    return;
  }
  if (cmd === "ghost") {
    ymmSetGhost(!ymmMini.ghost);
    return;
  }
  if (!main || main.isDestroyed() || !YMM_PLAYER_CMDS.includes(cmd)) return;
  ymmPlayerCmd(main, cmd, val);
});
const YMM_PLAYER_CMDS = ["toggle", "next", "prev", "like", "seek", "volup", "voldown"];
const ymmPlayerCmd = (win, cmd, val) => {
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(`window.__ymmMiniCmd && window.__ymmMiniCmd(${JSON.stringify(cmd)}, ${Number(val) || 0})`).catch(() => {});
};

// Глобальные клавиши: работают, даже если окно свёрнуто или открыта игра.
const YMM_GLOBAL_KEYS = { "CommandOrControl+Alt+Space": "toggle", "CommandOrControl+Alt+Right": "next", "CommandOrControl+Alt+Left": "prev", "CommandOrControl+Alt+Up": "volup", "CommandOrControl+Alt+Down": "voldown", "CommandOrControl+Alt+L": "like" };
let ymmGlobalKeysOn = false;
const ymmSetGlobalKeys = (on) => {
  if (on === ymmGlobalKeysOn) return;
  ymmGlobalKeysOn = on;
  for (const [key, cmd] of Object.entries(YMM_GLOBAL_KEYS)) {
    try {
      if (on) ymmElectron.globalShortcut.register(key, () => ymmPlayerCmd(ymmWin(), cmd, 0));
      else ymmElectron.globalShortcut.unregister(key);
    } catch (e) {
      console.warn("[YMusicMod] global key", key, e && e.message);
    }
  }
};

// Кнопки на превью в панели задач. Значки рисуем сами, чтобы не тащить файлы в установщик.
const ymmGlyph = (draw) => {
  const size = 20;
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let i = 0; i < SS; i++) for (let j = 0; j < SS; j++) if (draw((x + (i + 0.5) / SS) / size, (y + (j + 0.5) / SS) / size)) hit++;
      const o = (y * size + x) * 4;
      buf[o] = buf[o + 1] = buf[o + 2] = 255;
      buf[o + 3] = Math.round((hit / (SS * SS)) * 255);
    }
  }
  return ymmElectron.nativeImage.createFromBitmap(buf, { width: size, height: size });
};
const ymmTri = (x, y, x0, x1) => {
  const t = (x - x0) / (x1 - x0);
  return t >= 0 && t <= 1 && Math.abs(y - 0.5) <= 0.32 * (1 - t);
};
const ymmRect = (x, y, x0, x1) => x >= x0 && x <= x1 && y >= 0.18 && y <= 0.82;
let ymmThumbIcons = null;
const ymmThumbbar = (win, playing) => {
  if (process.platform !== "win32" || !win || win.isDestroyed()) return;
  ymmThumbIcons = ymmThumbIcons || {
    prev: ymmGlyph((x, y) => ymmRect(x, y, 0.18, 0.28) || ymmTri(1 - x, y, 0.18, 0.72)),
    next: ymmGlyph((x, y) => ymmRect(x, y, 0.72, 0.82) || ymmTri(x, y, 0.18, 0.72)),
    play: ymmGlyph((x, y) => ymmTri(x, y, 0.26, 0.86)),
    pause: ymmGlyph((x, y) => ymmRect(x, y, 0.26, 0.42) || ymmRect(x, y, 0.58, 0.74))
  };
  try {
    win.setThumbarButtons([
      { tooltip: "Предыдущий", icon: ymmThumbIcons.prev, click: () => ymmPlayerCmd(win, "prev", 0) },
      { tooltip: playing ? "Пауза" : "Играть", icon: playing ? ymmThumbIcons.pause : ymmThumbIcons.play, click: () => ymmPlayerCmd(win, "toggle", 0) },
      { tooltip: "Следующий", icon: ymmThumbIcons.next, click: () => ymmPlayerCmd(win, "next", 0) }
    ]);
  } catch (e) {
    console.warn("[YMusicMod] thumbar", e && e.message);
  }
};

const ymmDialogFilters = [
  { name: "Картинки и видео", extensions: [...YMM_IMAGE_EXT, ...YMM_VIDEO_EXT].map((e) => e.slice(1)) },
  { name: "Картинки", extensions: YMM_IMAGE_EXT.map((e) => e.slice(1)) },
  { name: "Видео", extensions: YMM_VIDEO_EXT.map((e) => e.slice(1)) }
];
const ymmImportFile = (src) => {
  const ext = ymmPath.extname(src).toLowerCase();
  if (![...YMM_IMAGE_EXT, ...YMM_VIDEO_EXT].includes(ext)) return null;
  const hash = ymmCrypto.createHash("sha1").update(ymmFs.readFileSync(src)).digest("hex").slice(0, 10);
  const name = `bg-${hash}${ext}`;
  const dest = ymmPath.join(YMM_ASSETS, name);
  if (!ymmFs.existsSync(dest)) ymmFs.copyFileSync(src, dest);
  return name;
};

const ymmImportAs = (src, prefix, exts) => {
  const ext = ymmPath.extname(src).toLowerCase();
  if (!exts.includes(ext)) return null;
  const hash = ymmCrypto.createHash("sha1").update(ymmFs.readFileSync(src)).digest("hex").slice(0, 10);
  const name = `${prefix}-${hash}${ext}`;
  const dest = ymmPath.join(YMM_ASSETS, name);
  if (!ymmFs.existsSync(dest)) ymmFs.copyFileSync(src, dest);
  return name;
};

// Системные шрифты: список берём у .NET, один раз за запуск.
let ymmSystemFonts = null;
const ymmListSystemFonts = () => {
  if (ymmSystemFonts) return ymmSystemFonts;
  ymmSystemFonts = new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    const cp = require("node:child_process");
    const script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }";
    cp.execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, maxBuffer: 4 << 20, timeout: 20000 }, (err, out) => {
      if (err) {
        ymmSystemFonts = null;
        return resolve([]);
      }
      resolve([...new Set(String(out).split(/\r?\n/).map((x) => ymmCssName(x, 80)).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
    });
  });
  return ymmSystemFonts;
};

// Статистика прослушиваний (только локально).
let ymmStatsCache = null;
let ymmStatsTimer = null;
const ymmStatsLoad = () => {
  if (ymmStatsCache) return ymmStatsCache;
  try {
    ymmStatsCache = JSON.parse(ymmFs.readFileSync(YMM_STATS, "utf8"));
  } catch {
  }
  if (!ymmStatsCache || typeof ymmStatsCache !== "object") ymmStatsCache = {};
  for (const k of ["days", "tracks", "artists", "hours"]) if (!ymmStatsCache[k] || typeof ymmStatsCache[k] !== "object") ymmStatsCache[k] = {};
  return ymmStatsCache;
};
const ymmStatsSave = (now) => {
  clearTimeout(ymmStatsTimer);
  const write = () => {
    try {
      ymmEnsureDirs();
      ymmFs.writeFileSync(YMM_STATS + ".tmp", JSON.stringify(ymmStatsCache), "utf8");
      ymmFs.renameSync(YMM_STATS + ".tmp", YMM_STATS);
    } catch (e) {
      console.warn("[YMusicMod] stats save", e);
    }
  };
  if (now) write();
  else ymmStatsTimer = setTimeout(write, 5000);
};
const ymmStatsAdd = (p) => {
  if (!p || typeof p !== "object") return;
  const sec = ymmClamp(p.seconds, 0, 120, 0);
  const title = typeof p.title === "string" ? p.title.slice(0, 200) : "";
  if (!title || !sec) return;
  const artist = typeof p.artist === "string" ? p.artist.slice(0, 200) : "";
  const cover = typeof p.cover === "string" && /^https:\/\//.test(p.cover) ? p.cover.slice(0, 400) : "";
  const st = ymmStatsLoad();
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  st.days[day] = (st.days[day] || 0) + sec;
  st.hours[d.getHours()] = (st.hours[d.getHours()] || 0) + sec;
  const key = `${artist} — ${title}`;
  const t = st.tracks[key] || (st.tracks[key] = { title, artist, cover, sec: 0, plays: 0, last: 0 });
  t.sec += sec;
  if (cover) t.cover = cover;
  if (p.newPlay) t.plays += 1;
  t.last = Date.now();
  for (const a of artist.split(/,\s*/).filter(Boolean)) {
    const ar = st.artists[a] || (st.artists[a] = { sec: 0, plays: 0 });
    ar.sec += sec;
    if (p.newPlay) ar.plays += 1;
  }
  // Ограничиваем размер: давно не игравшие треки выкидываем.
  const keys = Object.keys(st.tracks);
  if (keys.length > 5000) {
    keys.sort((a, b) => st.tracks[a].last - st.tracks[b].last).slice(0, keys.length - 4000).forEach((k) => delete st.tracks[k]);
  }
  ymmStatsSave(false);
};
ymmElectron.app.on("before-quit", () => {
  if (ymmStatsCache) ymmStatsSave(true);
});

let ymmIconChanged = false;
const ymmApplyWindowIcon = () => {
  const cfg = ymmLoad();
  let img = null;
  if (cfg.logoWindowIcon) {
    if (cfg.logoMode === "custom" && cfg.logoFile && !/\.svg$/i.test(cfg.logoFile)) img = ymmElectron.nativeImage.createFromPath(ymmPath.join(YMM_ASSETS, cfg.logoFile));
    else img = ymmElectron.nativeImage.createFromDataURL(YMM_LOGO_PNG);
    if (img && img.isEmpty()) img = null;
  }
  if (!img) {
    if (!ymmIconChanged) return;
    // Вернуть родную иконку из exe.
    img = ymmElectron.nativeImage.createFromPath(process.execPath);
  }
  ymmIconChanged = Boolean(cfg.logoWindowIcon);
  for (const w of ymmElectron.BrowserWindow.getAllWindows()) {
    if (w === ymmMini.win || w.isDestroyed()) continue;
    try {
      if (img && !img.isEmpty()) w.setIcon(img);
    } catch {
    }
  }
};

const ymmTrusted = (e) => {
  try {
    const frame = e.senderFrame;
    if (!frame || frame !== e.sender.mainFrame) return false;
    return !/^(https?|file|ymmod|data|about):/i.test(frame.url);
  } catch {
    return false;
  }
};
let ymmLastWin = null;
const ymmWin = () => (ymmLastWin && !ymmLastWin.isDestroyed() ? ymmLastWin : ymmElectron.BrowserWindow.getAllWindows().find((w) => w !== ymmMini.win) || null);
const ymmHandle = (channel, fn) => {
  ymmElectron.ipcMain.removeHandler(channel);
  ymmElectron.ipcMain.handle(channel, async (e, ...args) => {
    if (!ymmTrusted(e)) return undefined;
    ymmLastWin = ymmElectron.BrowserWindow.fromWebContents(e.sender) || ymmLastWin;
    return fn(e, ...args);
  });
};
const ymmRegisterIpc = () => {
  const cfg0 = ymmLoad();
  ymmDiscord.configure(cfg0.discordRpc, cfg0.discordClientId);
  ymmSetGlobalKeys(cfg0.globalKeys);
  ymmHandle("desktop:ymmod:get", async () => ymmPayload());
  ymmHandle("desktop:ymmod:set", async (_e, patch) => {
    const prev = ymmLoad();
    const next = ymmSanitize(patch, prev);
    ymmSave(next);
    if (prev.discordRpc !== next.discordRpc || prev.discordClientId !== next.discordClientId) ymmDiscord.configure(next.discordRpc, next.discordClientId);
    if (prev.globalKeys !== next.globalKeys) ymmSetGlobalKeys(next.globalKeys);
    if (prev.logoWindowIcon !== next.logoWindowIcon || prev.logoMode !== next.logoMode || prev.logoFile !== next.logoFile) ymmApplyWindowIcon();
    if (prev.miniAutoHide !== next.miniAutoHide && ymmMini.win && !ymmMini.win.isDestroyed()) {
      if (next.miniAutoHide) ymmStartFsWatcher();
      else ymmStopFsWatcher();
      ymmApplyMiniVisibility();
    }
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:add-backgrounds", async () => {
    const res = await ymmElectron.dialog.showOpenDialog(ymmWin(), { title: "Добавить фоны", properties: ["openFile", "multiSelections"], filters: ymmDialogFilters });
    if (res.canceled || !res.filePaths.length) return ymmPayload();
    ymmEnsureDirs();
    const cfg = { ...ymmLoad() };
    const added = res.filePaths.map(ymmImportFile).filter(Boolean);
    cfg.backgrounds = [...new Set([...cfg.backgrounds, ...added])];
    if (added.length) cfg.backgroundFile = added[added.length - 1];
    ymmSave(cfg);
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:remove-background", async (_e, name) => {
    const cfg = { ...ymmLoad() };
    if (typeof name !== "string" || !cfg.backgrounds.includes(name)) return ymmPayload();
    cfg.backgrounds = cfg.backgrounds.filter((n) => n !== name);
    if (cfg.backgroundFile === name) cfg.backgroundFile = cfg.backgrounds[0] || null;
    if (cfg.dayFile === name) cfg.dayFile = null;
    if (cfg.nightFile === name) cfg.nightFile = null;
    const usedByPreset = Object.values(cfg.presets).some((p) => p.backgroundFile === name);
    if (!usedByPreset) {
      try {
        ymmFs.unlinkSync(ymmPath.join(YMM_ASSETS, name));
      } catch {
      }
    }
    ymmSave(cfg);
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:add-font", async () => {
    const res = await ymmElectron.dialog.showOpenDialog(ymmWin(), { title: "Добавить шрифт", properties: ["openFile", "multiSelections"], filters: [{ name: "Шрифты", extensions: YMM_FONT_EXT.map((e) => e.slice(1)) }] });
    if (res.canceled || !res.filePaths.length) return ymmPayload();
    ymmEnsureDirs();
    const cfg = { ...ymmLoad() };
    const list = [...cfg.fontFiles];
    let last = null;
    for (const src of res.filePaths) {
      const file = ymmImportAs(src, "font", YMM_FONT_EXT);
      if (!file) continue;
      const name = ymmCssName(ymmPath.basename(src, ymmPath.extname(src)).replace(/[_-]+/g, " "), 60) || file;
      if (!list.some((f) => f.file === file)) list.push({ file, name });
      last = list.find((f) => f.file === file);
    }
    cfg.fontFiles = list;
    if (last) Object.assign(cfg, { fontSource: "file", fontFile: last.file, fontFamily: last.name });
    ymmSave(ymmSanitize(cfg, ymmLoad()));
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:remove-font", async (_e, file) => {
    const cfg = { ...ymmLoad() };
    if (!cfg.fontFiles.some((f) => f.file === file)) return ymmPayload();
    cfg.fontFiles = cfg.fontFiles.filter((f) => f.file !== file);
    if (cfg.fontFile === file) Object.assign(cfg, { fontSource: "", fontFile: null, fontFamily: "" });
    try {
      ymmFs.unlinkSync(ymmPath.join(YMM_ASSETS, file));
    } catch {
    }
    ymmSave(cfg);
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:system-fonts", async () => ymmListSystemFonts());
  ymmHandle("desktop:ymmod:set-logo", async () => {
    const res = await ymmElectron.dialog.showOpenDialog(ymmWin(), { title: "Картинка для логотипа", properties: ["openFile"], filters: [{ name: "Картинки", extensions: YMM_LOGO_EXT.map((e) => e.slice(1)) }] });
    if (res.canceled || !res.filePaths[0]) return ymmPayload();
    ymmEnsureDirs();
    const file = ymmImportAs(res.filePaths[0], "logo", YMM_LOGO_EXT);
    if (file) {
      const prev = ymmLoad();
      if (prev.logoFile && prev.logoFile !== file) {
        try {
          ymmFs.unlinkSync(ymmPath.join(YMM_ASSETS, prev.logoFile));
        } catch {
        }
      }
      ymmSave(ymmSanitize({ logoFile: file, logoMode: "custom" }, prev));
      ymmApplyWindowIcon();
    }
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:stats-add", async (_e, p) => {
    ymmStatsAdd(p);
    return true;
  });
  ymmHandle("desktop:ymmod:stats-get", async () => ymmStatsLoad());
  ymmHandle("desktop:ymmod:stats-reset", async () => {
    ymmStatsCache = { days: {}, tracks: {}, artists: {}, hours: {} };
    ymmStatsSave(true);
    return ymmStatsCache;
  });
  // Резервные копии и перенос настроек.
  ymmHandle("desktop:ymmod:backups", async () => ymmBackupList().map((name) => {
    let size = 0;
    let at = 0;
    try {
      const st = ymmFs.statSync(ymmPath.join(YMM_BACKUPS, name));
      size = st.size;
      at = st.mtimeMs;
    } catch {
    }
    return { name, size, at };
  }));
  ymmHandle("desktop:ymmod:backup-now", async () => {
    ymmFlushSave();
    return ymmBackup("manual");
  });
  ymmHandle("desktop:ymmod:backup-restore", async (_e, name) => {
    if (typeof name !== "string" || !ymmBackupList().includes(name)) return ymmPayload();
    const raw = ymmReadJson(ymmPath.join(YMM_BACKUPS, name));
    ymmFlushSave();
    ymmBackup("before-restore");
    ymmSave(ymmSanitize({ ...raw, modVersion: YMM_VERSION }));
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:export-all", async () => {
    const res = await ymmElectron.dialog.showSaveDialog(ymmWin(), { title: "Экспорт всех настроек", defaultPath: "ymusicmod-settings.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (res.canceled || !res.filePath) return false;
    ymmFs.writeFileSync(res.filePath, JSON.stringify({ format: "ymusicmod-settings", version: 1, config: ymmLoad() }, null, 2), "utf8");
    return true;
  });
  ymmHandle("desktop:ymmod:import-all", async () => {
    const res = await ymmElectron.dialog.showOpenDialog(ymmWin(), { title: "Импорт настроек", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
    if (res.canceled || !res.filePaths[0]) return ymmPayload();
    try {
      const data = ymmReadJson(res.filePaths[0]);
      if (data.format !== "ymusicmod-settings" || !data.config) throw new Error("wrong format");
      ymmFlushSave();
      ymmBackup("before-import");
      // Файлы фонов и шрифтов с другого компьютера могут отсутствовать: ymmSanitize выкинет такие ссылки.
      ymmSave(ymmSanitize({ ...data.config, modVersion: YMM_VERSION }));
    } catch (e) {
      console.warn("[YMusicMod] settings import failed", e);
    }
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:export-stats", async (_e, csv) => {
    if (typeof csv !== "string") return false;
    const res = await ymmElectron.dialog.showSaveDialog(ymmWin(), { title: "Экспорт статистики", defaultPath: "ymusicmod-stats.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (res.canceled || !res.filePath) return false;
    ymmFs.writeFileSync(res.filePath, "﻿" + csv, "utf8");
    return true;
  });
  // Состояние плеера для панели задач Windows: кнопки, прогресс.
  ymmHandle("desktop:ymmod:playback", async (e, p) => {
    const win = ymmElectron.BrowserWindow.fromWebContents(e.sender);
    if (!win || !p || typeof p !== "object") return false;
    if ("playing" in p) ymmThumbbar(win, Boolean(p.playing));
    if ("progress" in p) {
      const v = Number(p.progress);
      win.setProgressBar(Number.isFinite(v) && v >= 0 ? Math.min(1, v) : -1, { mode: p.playing ? "normal" : "paused" });
    }
    return true;
  });
  ymmHandle("desktop:ymmod:notify", async (_e, p) => {
    if (!p || typeof p.title !== "string" || !ymmElectron.Notification.isSupported()) return false;
    let icon;
    try {
      const u = new URL(String(p.cover || ""));
      if (u.protocol === "https:" && /(^|\.)(yandex\.net|yandex\.ru)$/.test(u.hostname)) {
        const r = await ymmElectron.net.fetch(u.href, { headers: { Accept: "image/jpeg,image/png" } });
        if (r.ok) icon = ymmElectron.nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()));
      }
    } catch {
    }
    const n = new ymmElectron.Notification({ title: p.title.slice(0, 120), body: String(p.body || "").slice(0, 200), icon, silent: true });
    n.on("click", () => {
      const w = ymmWin();
      if (w && !w.isDestroyed()) {
        w.show();
        w.focus();
      }
    });
    n.show();
    return true;
  });
  ymmHandle("desktop:ymmod:export-presets", async () => {
    const cfg = ymmLoad();
    const res = await ymmElectron.dialog.showSaveDialog(ymmWin(), { title: "Экспорт пресетов", defaultPath: "ymusic-presets.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (res.canceled || !res.filePath) return false;
    const data = { format: "ymusicmod-presets", version: 2, current: ymmPickPreset(cfg), presets: cfg.presets };
    ymmFs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  });
  ymmHandle("desktop:ymmod:import-presets", async () => {
    const res = await ymmElectron.dialog.showOpenDialog(ymmWin(), { title: "Импорт пресетов", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
    if (res.canceled || !res.filePaths[0]) return ymmPayload();
    try {
      const data = JSON.parse(ymmFs.readFileSync(res.filePaths[0], "utf8"));
      const cfg = ymmLoad();
      const incoming = data && typeof data.presets === "object" ? data.presets : {};
      if (data && data.current && !Object.keys(incoming).length) incoming["Импорт"] = data.current;
      ymmSave(ymmSanitize({ presets: { ...cfg.presets, ...incoming } }, cfg));
    } catch (e) {
      console.warn("[YMusicMod] import failed", e);
    }
    return ymmPayload();
  });
  ymmHandle("desktop:ymmod:mini", async (_e, on) => ymmSetMini(ymmWin(), Boolean(on)));
  ymmHandle("desktop:ymmod:mini-state", async (_e, st) => {
    if (ymmMini.win && !ymmMini.win.isDestroyed() && st && typeof st === "object") ymmMini.win.webContents.send("ymmod-mini:state", st);
    return true;
  });
  ymmHandle("desktop:ymmod:discord", async (_e, p) => {
    ymmDiscord.setActivity(ymmBuildActivity(p, ymmLoad()));
    return ymmDiscord.status();
  });
  ymmHandle("desktop:ymmod:open-folder", async () => {
    ymmEnsureDirs();
    return ymmElectron.shell.openPath(YMM_DIR);
  });
};
ymmElectron.app.on("before-quit", () => {
  ymmMini.quitting = true;
  ymmDiscord.configure(false, "");
  if (ymmMini.win && !ymmMini.win.isDestroyed()) ymmMini.win.destroy();
});
ymmElectron.app.whenReady().then(ymmRegisterIpc);
ymmElectron.app.on("browser-window-created", () => setTimeout(ymmApplyWindowIcon, 500));

// Больше дискового кэша: обложки и данные треков не перекачиваются при каждом запуске.
try {
  if (!ymmElectron.app.commandLine.hasSwitch("disk-cache-size")) ymmElectron.app.commandLine.appendSwitch("disk-cache-size", String(512 * 1024 * 1024));
} catch {
}

const YMM_RENDERER = __YMMOD_RENDERER__;
const ymmOnLoad = (wc) => {
  if (!wc || wc.isDestroyed() || wc.getType() !== "window") return;
  if (/^(https?|ymmod|file|data|about|devtools):/i.test(wc.getURL())) return;
  wc.executeJavaScript(YMM_RENDERER).catch((e) => console.warn("[YMusicMod] inject failed", e && e.message));
  // Заранее открываем соединения к серверам обложек и API - первая картинка не ждёт TLS.
  try {
    for (const url of ["https://avatars.yandex.net", "https://api.music.yandex.net", "https://music.yandex.ru"]) wc.session.preconnect({ url, numSockets: url.includes("avatars") ? 6 : 2 });
  } catch {
  }
};
ymmElectron.app.on("web-contents-created", (_e, wc) => wc.on("did-finish-load", () => ymmOnLoad(wc)));
})();
/*YMMOD-END main*/
