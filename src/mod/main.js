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
  ".bmp": "image/bmp", ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".m4v": "video/mp4"
};
const YMM_HEX = /^#[0-9a-fA-F]{6}$/;

const YMM_PRESET_KEYS = [
  "blur", "dim", "saturation", "contentAlpha", "bgMode", "slideInterval", "accentMode", "accent", "rounded", "glow",
  "playerGlass", "hideWaveArt", "beatSync", "beatIntensity", "bgPulse", "thumbStyle", "thumbRainbow",
  "visualizer", "visualizerOpacity", "reducedMotion", "cleanVibe"
];
const YMM_DEFAULTS = {
  version: 2,
  backgroundFile: null, backgrounds: [], bgMode: "single", slideInterval: 10,
  dayFile: null, nightFile: null, dayStartHour: 8, nightStartHour: 20,
  blur: 0, dim: 30, saturation: 100, contentAlpha: 55,
  accentMode: "cover", accent: "#ff5c4d",
  rounded: true, glow: true, playerGlass: 18, hideWaveArt: true,
  beatSync: true, beatIntensity: 70, bgPulse: true,
  thumbStyle: "pinwheel", thumbRainbow: false,
  visualizer: "bars", visualizerOpacity: 70,
  reducedMotion: false, hideButton: false, volumeWheel: true,
  discordRpc: true, discordClientId: "1558904911515754496",
  cleanVibe: true, miniAutoHide: true, miniPos: null,
  presets: {}, activePreset: null
};
const ymmClamp = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d;
};
const ymmEnum = (v, list, d) => (list.includes(v) ? v : d);
const ymmSafeFile = (v) => (typeof v === "string" && /^[\w.-]+$/.test(v) && ymmFs.existsSync(ymmPath.join(YMM_ASSETS, v)) ? v : null);

const ymmSanitize = (raw, base = YMM_DEFAULTS) => {
  const c = { ...base };
  const r = raw && typeof raw === "object" ? raw : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(r, k);
  if (has("backgroundFile")) c.backgroundFile = r.backgroundFile === null ? null : ymmSafeFile(r.backgroundFile);
  if (has("backgrounds") && Array.isArray(r.backgrounds)) c.backgrounds = [...new Set(r.backgrounds.map(ymmSafeFile).filter(Boolean))];
  if (has("dayFile")) c.dayFile = ymmSafeFile(r.dayFile);
  if (has("nightFile")) c.nightFile = ymmSafeFile(r.nightFile);
  if (has("bgMode")) c.bgMode = ymmEnum(r.bgMode, ["single", "slideshow", "daynight"], c.bgMode);
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
  if (has("visualizer")) c.visualizer = ymmEnum(r.visualizer, ["off", "bars", "wave", "mirror"], c.visualizer);
  if (has("visualizerOpacity")) c.visualizerOpacity = ymmClamp(r.visualizerOpacity, 10, 100, c.visualizerOpacity);
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
let ymmConfigCache = null;
const ymmLoad = () => {
  if (ymmConfigCache) return ymmConfigCache;
  ymmEnsureDirs();
  let raw = null;
  try {
    raw = JSON.parse(ymmFs.readFileSync(YMM_CONFIG, "utf8"));
  } catch {
  }
  // Миграция нужна только старым конфигам без поля version; первый запуск получает дефолты.
  if (!raw || typeof raw !== "object") raw = { version: 2 };
  else if (!raw.version) {
    raw = { ...raw, accentMode: raw.accent ? "fixed" : "off", thumbStyle: "pinwheel", visualizer: "off" };
    const existing = ymmFs.readdirSync(YMM_ASSETS).filter((f) => [...YMM_IMAGE_EXT, ...YMM_VIDEO_EXT].includes(ymmPath.extname(f).toLowerCase()));
    raw.backgrounds = existing;
  }
  ymmConfigCache = ymmSanitize(raw);
  return ymmConfigCache;
};
let ymmSaveTimer = null;
const ymmSave = (cfg) => {
  ymmConfigCache = cfg;
  clearTimeout(ymmSaveTimer);
  ymmSaveTimer = setTimeout(() => {
    try {
      ymmEnsureDirs();
      const tmp = YMM_CONFIG + ".tmp";
      ymmFs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
      ymmFs.renameSync(tmp, YMM_CONFIG);
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
    ymmFs.writeFileSync(YMM_CONFIG, JSON.stringify(ymmConfigCache, null, 2), "utf8");
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
  return { config: cfg, files, modVersion: YMM_VERSION, appVersion, discord: ymmDiscord.status() };
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

// Цвет обложки
const ymmCoverCache = new Map();
const ymmRgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
};
const ymmHslToHex = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
const ymmCoverColor = async (url) => {
  if (typeof url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !/(^|\.)(yandex\.net|yandex\.ru|yastatic\.net)$/.test(parsed.hostname)) return null;
  if (ymmCoverCache.has(url)) return ymmCoverCache.get(url);
  const res = await ymmElectron.net.fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const img = ymmElectron.nativeImage.createFromBuffer(buf);
  if (img.isEmpty()) return null;
  const px = img.resize({ width: 40, height: 40, quality: "good" }).toBitmap(); // BGRA
  const bins = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let ar = 0, ag = 0, ab = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const b = px[i], g = px[i + 1], r = px[i + 2];
    ar += r; ag += g; ab += b; n++;
    const [h, s, l] = ymmRgbToHsl(r, g, b);
    const w = s * s * (1 - Math.abs(l - 0.5) * 1.6);
    if (w <= 0.02) continue;
    const bin = bins[Math.floor(h / 10) % 36];
    bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
  }
  let best = bins[0];
  for (const bin of bins) if (bin.w > best.w) best = bin;
  let [h, s, l] = best.w > n * 0.015 ? ymmRgbToHsl(best.r / best.w, best.g / best.w, best.b / best.w) : ymmRgbToHsl(ar / n, ag / n, ab / n);
  s = s < 0.12 ? s : Math.min(1, Math.max(s, 0.62));
  l = Math.min(Math.max(l, 0.52), 0.66);
  const hex = ymmHslToHex(h, s, l);
  if (ymmCoverCache.size > 200) ymmCoverCache.clear();
  ymmCoverCache.set(url, hex);
  return hex;
};

// Discord Rich Presence
const ymmDiscord = (() => {
  let sock = null, ready = false, clientId = "", wanted = false, lastActivity = null, retryTimer = null, buf = Buffer.alloc(0);
  let lastError = "", user = "", lastAck = 0;
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
  const pushActivity = () => {
    if (!ready) return;
    send(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: lastActivity || undefined }, nonce: ymmCrypto.randomUUID() });
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
  const scheduleRetry = () => {
    clearTimeout(retryTimer);
    if (wanted) retryTimer = setTimeout(connect, 10000);
  };
  const onMessage = (op, msg) => {
    if (op === 1 && msg && msg.evt === "READY") {
      ready = true;
      lastError = "";
      user = (msg.data && msg.data.user && (msg.data.user.global_name || msg.data.user.username)) || "";
      pushActivity();
    } else if (op === 1 && msg && msg.evt === "ERROR") {
      lastError = (msg.data && msg.data.message) || "ошибка Discord";
      console.warn("[YMusicMod] discord error", lastError);
    } else if (op === 1 && msg && msg.cmd === "SET_ACTIVITY") {
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
const ymmBuildActivity = (p) => {
  if (!p || typeof p !== "object" || !p.title) return null;
  const s = (v, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const pad = (v) => (v.length < 2 ? v.padEnd(2, " ") : v);
  const title = s(p.title);
  const artist = s(p.artist) || "Яндекс Музыка";
  const search = `https://music.yandex.ru/search?text=${encodeURIComponent(`${artist} ${title}`.trim())}`;
  const trackUrl = typeof p.trackUrl === "string" && /^https:\/\/music\.yandex\.(ru|com|by|kz|uz)\//.test(p.trackUrl) && p.trackUrl.length < 256 ? p.trackUrl : search;
  const a = {
    type: 2,
    status_display_type: 1,
    details: pad(title),
    details_url: trackUrl,
    state: pad(p.paused ? `⏸ ${ymmFmtTime(p.position)} / ${ymmFmtTime(p.duration)} · ${artist}`.slice(0, 120) : artist),
    state_url: `https://music.yandex.ru/search?text=${encodeURIComponent(artist)}`,
    assets: { large_text: pad(s(p.album) || "Яндекс Музыка") },
    buttons: [{ label: "Слушать в Яндекс Музыке", url: trackUrl }],
    instance: false
  };
  if (typeof p.cover === "string" && /^https:\/\//.test(p.cover) && p.cover.length < 256) a.assets.large_image = p.cover;
  a.assets.small_image = "https://raw.githubusercontent.com/attent10nc/YMusicMod/main/assets/logo-256.png";
  a.assets.small_text = p.paused ? "На паузе" : "YMusicMod";
  const now = Date.now();
  if (!p.paused && Number.isFinite(p.position) && Number.isFinite(p.duration) && p.duration > 0) {
    a.timestamps = { start: Math.round(now - p.position * 1000), end: Math.round(now + (p.duration - p.position) * 1000) };
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
  if (!main || main.isDestroyed() || !["toggle", "next", "prev", "like", "seek"].includes(cmd)) return;
  main.webContents.executeJavaScript(`window.__ymmMiniCmd && window.__ymmMiniCmd(${JSON.stringify(cmd)}, ${Number(val) || 0})`).catch(() => {});
});

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
  ymmHandle("desktop:ymmod:get", async () => ymmPayload());
  ymmHandle("desktop:ymmod:set", async (_e, patch) => {
    const prev = ymmLoad();
    const next = ymmSanitize(patch, prev);
    ymmSave(next);
    if (prev.discordRpc !== next.discordRpc || prev.discordClientId !== next.discordClientId) ymmDiscord.configure(next.discordRpc, next.discordClientId);
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
  ymmHandle("desktop:ymmod:cover-color", async (_e, url) => {
    try {
      return await ymmCoverColor(url);
    } catch {
      return null;
    }
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
    ymmDiscord.setActivity(ymmBuildActivity(p));
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

const YMM_RENDERER = __YMMOD_RENDERER__;
const ymmOnLoad = (wc) => {
  if (!wc || wc.isDestroyed() || wc.getType() !== "window") return;
  if (/^(https?|ymmod|file|data|about|devtools):/i.test(wc.getURL())) return;
  wc.executeJavaScript(YMM_RENDERER).catch((e) => console.warn("[YMusicMod] inject failed", e && e.message));
};
ymmElectron.app.on("web-contents-created", (_e, wc) => wc.on("did-finish-load", () => ymmOnLoad(wc)));
})();
/*YMMOD-END main*/
