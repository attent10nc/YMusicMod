// Dev-патчер (Node). Для пользователей есть YMusicMod-Setup.exe — он делает то же самое без Node.
//   node scripts/patch.mjs                 — пропатчить установленную Яндекс Музыку (приложение должно быть закрыто)
//   node scripts/patch.mjs --dry-run       — собрать во временную папку, ничего не трогая
//   node scripts/patch.mjs --restore       — вернуть оригинал
//   node scripts/patch.mjs --status        — "ok" / "needed"
//   node scripts/patch.mjs --emit-payload <dir>  — выгрузить куски мода для сборки установщика
//   --app-dir <path>                       — нестандартная папка установки
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as asar from "@electron/asar";
import { flipFuses, FuseVersion, FuseV1Options, getCurrentFuseWire } from "@electron/fuses";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = path.join(ROOT, "src", "mod");
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const log = (...a) => console.log("[ymmod]", ...a);
const die = (m) => {
  console.error(`[ymmod] ${m}`);
  process.exit(1);
};

const rd = (f) => fs.readFileSync(path.join(MOD, f), "utf8");
const buildPayload = () => ({
  scheme: rd("scheme.js"),
  main: rd("main.js")
    .replace("__YMMOD_VERSION__", VERSION)
    .replace("__YMMOD_LOGO_PNG__", () => `data:image/png;base64,${fs.readFileSync(path.join(ROOT, "assets", "logo-256.png")).toString("base64")}`)
    .replace("__YMMOD_RENDERER__", () => JSON.stringify(rd("renderer.js").replace("__YMMOD_LOGO__", `data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, "assets", "logo.svg")).toString("base64")}`)))
    .replace("__YMMOD_MINI_HTML__", () => JSON.stringify(rd("mini.html"))),
  preload: rd("preload.js").replace("__YMMOD_EARLY__", () => rd("early.js"))
});

const payload = buildPayload();
const emit = opt("--emit-payload");
if (emit) {
  fs.mkdirSync(emit, { recursive: true });
  fs.writeFileSync(path.join(emit, "scheme.js"), payload.scheme);
  fs.writeFileSync(path.join(emit, "main.js"), payload.main);
  fs.writeFileSync(path.join(emit, "preload.js"), payload.preload);
  fs.writeFileSync(path.join(emit, "version.txt"), VERSION);
  log(`payload → ${emit}`);
  process.exit(0);
}

const APP = opt("--app-dir") || path.join(process.env.LOCALAPPDATA || "", "Programs", "YandexMusic");
const ASAR = path.join(APP, "resources", "app.asar");
const BAK = ASAR + ".bak";
if (!fs.existsSync(ASAR)) die(`не найден ${ASAR} (укажи --app-dir)`);

const text = (archive, file) => asar.extractFile(archive, file).toString("utf8");
const pkgOf = (archive) => JSON.parse(text(archive, "package.json"));
const entryOf = (archive) => (pkgOf(archive).main || "index.js").replace(/^\.\//, "");
const modded = (archive) => /YMMOD-BEGIN|YMusicMod/.test(text(archive, entryOf(archive)));

if (flag("--status")) {
  const m = /const YMM_VERSION = "([^"]+)"/.exec(text(ASAR, entryOf(ASAR)));
  console.log(m && m[1] === VERSION ? "ok" : "needed");
  process.exit(0);
}
if (flag("--restore")) {
  if (!fs.existsSync(BAK)) die("нет app.asar.bak");
  fs.copyFileSync(BAK, ASAR);
  log("оригинал восстановлен");
  process.exit(0);
}

const version = pkgOf(ASAR).version;
let base = ASAR;
if (modded(ASAR)) {
  if (!fs.existsSync(BAK) || modded(BAK) || pkgOf(BAK).version !== version) die("нет чистой копии app.asar.bak этой версии — переустанови Яндекс Музыку");
  base = BAK;
} else if (!flag("--dry-run")) {
  if (fs.existsSync(BAK) && pkgOf(BAK).version !== version) fs.renameSync(BAK, `${BAK}-${pkgOf(BAK).version}`);
  fs.copyFileSync(ASAR, BAK);
}
log(`Яндекс Музыка ${version}`);

const work = fs.mkdtempSync(path.join(os.tmpdir(), "ymmod-"));
const src = path.join(work, "app");
asar.extractAll(base, src);

const entry = entryOf(base);
const entryCode = fs.readFileSync(path.join(src, entry), "utf8");
const preloadName = (/preload:\s*[\w$.]+\.join\(\s*__dirname\s*,\s*["']([^"']+)["']\s*\)/.exec(entryCode) || [])[1] || "preload.js";
if (!fs.existsSync(path.join(src, preloadName))) die(`не найден preload (${preloadName})`);

// Схему регистрируем до кода приложения, сам мод — после него.
const strict = /^(\s*["']use strict["'];?\s*\n)/.exec(entryCode);
const head = strict ? strict[1] : "";
fs.writeFileSync(path.join(src, entry), `${head}${payload.scheme}\n${entryCode.slice(head.length)}\n${payload.main}\n`);
fs.appendFileSync(path.join(src, preloadName), `\n${payload.preload}\n`);

// Плавные списки: виртуальный список треков ждёт 300 мс после прокрутки, прежде чем
// запросить данные, и рендерит строки всего на 700 px вперёд - отсюда серые заглушки.
// Данные теперь отдаёт кэш мода, так что ждать не нужно; строки готовим заранее.
const TUNE = [
  [/debounceDurationInMs:300(?![0-9])/g, "debounceDurationInMs:40"],
  [/overscan:([A-Za-z_$][\w$]*)=700(?![0-9])/g, "overscan:$1=1600"]
];
let tuned = 0;
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith(".js")) {
      const before = fs.readFileSync(p, "utf8");
      if (!before.includes("debounceDurationInMs") && !before.includes("overscan:")) continue;
      let after = before;
      for (const [re, to] of TUNE) {
        tuned += (after.match(re) || []).length;
        after = after.replace(re, to);
      }
      if (after !== before) fs.writeFileSync(p, after);
    }
  }
};
walk(path.join(src, "app", "_next", "static", "chunks"));
log(`списки: ${tuned} правок`);
for (const f of [entry, preloadName]) execFileSync(process.execPath, ["--check", path.join(src, f)], { stdio: "inherit" });
log(`entry: ${entry}, preload: ${preloadName}`);

const out = path.join(work, "app.asar");
await asar.createPackage(src, out);
if (flag("--dry-run")) {
  log(`dry run: ${out}`);
  process.exit(0);
}

const exe = fs.readdirSync(APP).find((f) => f.endsWith(".exe") && !/^(Uninstall|elevate)/i.test(f));
const wire = await getCurrentFuseWire(path.join(APP, exe));
if (wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation] === 49) {
  await flipFuses(path.join(APP, exe), { version: FuseVersion.V1, [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false });
  log("asar integrity fuse выключен");
}
fs.copyFileSync(out, ASAR);
fs.rmSync(work, { recursive: true, force: true });
log(`готово: YMusicMod ${VERSION}`);
