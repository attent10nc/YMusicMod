(function () {
  if (window.__ymmAudio) return;
  const elements = new Set();
  const listeners = new Set();
  const reg = {
    elements,
    onAdd(fn) {
      listeners.add(fn);
      elements.forEach((el) => fn(el));
      return () => listeners.delete(fn);
    }
  };
  const add = (el) => {
    // Только <audio>: видео-фон мода и прочие видео не трогаем.
    if (!(el instanceof HTMLAudioElement) || elements.has(el)) return;
    elements.add(el);
    listeners.forEach((fn) => {
      try {
        fn(el);
      } catch (e) {
        console.warn("[YMusicMod] audio listener", e);
      }
    });
  };
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    add(this);
    return origPlay.apply(this, arguments);
  };
  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag) {
    const el = origCreate.apply(this, arguments);
    if (typeof tag === "string" && tag.toLowerCase() === "audio") add(el);
    return el;
  };
  const OrigAudio = window.Audio;
  if (OrigAudio) {
    const Wrapped = function (src) {
      const el = arguments.length ? new OrigAudio(src) : new OrigAudio();
      add(el);
      return el;
    };
    Wrapped.prototype = OrigAudio.prototype;
    window.Audio = Wrapped;
  }
  Object.defineProperty(window, "__ymmAudio", { value: reg, configurable: false, enumerable: false });

  // Звуковой движок. Плеер сам строит Web Audio граф на каждый <audio> (свой эквалайзер,
  // фейды) и в конце подключает его к ctx.destination. Мы встаём между ним и destination,
  // так что встроенный эквалайзер Яндекса продолжает работать, а наша обработка идёт после него.
  const origConnect = AudioNode.prototype.connect;
  const origDisconnect = AudioNode.prototype.disconnect;
  const chains = new Map();
  let fx = { studio: false, amount: 60, width: 50, ambience: 20, leveler: false, mode: "normal" };

  const makeImpulse = (ctx, seconds, decay) => {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const pre = Math.floor(rate * 0.012);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        // Хвост темнеет со временем, как в настоящей комнате.
        const k = 0.55 + 0.4 * t;
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        d[i] = lp * Math.pow(1 - t, decay) * 2.2;
      }
    }
    return buf;
  };
  const makeCurve = (drive) => {
    const n = 2048;
    const c = new Float32Array(n);
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * drive) / norm;
    }
    return c;
  };

  const build = (ctx) => {
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const biquad = (type, freq, q, gain) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = freq;
      if (q != null) b.Q.value = q;
      if (gain != null) b.gain.value = gain;
      return b;
    };
    const link = (...nodes) => {
      for (let i = 0; i < nodes.length - 1; i++) origConnect.call(nodes[i], nodes[i + 1]);
    };
    const c = { ctx };
    c.input = g();
    c.bypass = g(1);
    c.wet = g(0);
    c.master = g(1);

    // Тон: чистим инфранизы, добавляем тепла и воздуха, убираем "бубнящую" середину.
    c.pre = g(1);
    c.sub = biquad("highpass", 20, 0.7);
    c.low = biquad("lowshelf", 95, null, 0);
    c.mud = biquad("peaking", 280, 0.9, 0);
    c.presence = biquad("peaking", 3200, 0.8, 0);
    c.air = biquad("highshelf", 11000, null, 0);
    link(c.input, c.pre, c.sub, c.low, c.mud, c.presence, c.air);

    // Эксайтер: мягкие гармоники только на верхах - деталь без резкости.
    c.exHp = biquad("highpass", 4200, 0.7);
    c.exShape = ctx.createWaveShaper();
    c.exShape.curve = makeCurve(3);
    c.exShape.oversample = "4x";
    c.exLp = biquad("lowpass", 16000, 0.7);
    c.exGain = g(0);
    link(c.sub, c.exHp, c.exShape, c.exLp, c.exGain);

    // Ширина сцены: усиливаем только боковой сигнал выше 180 Гц, бас остаётся в центре.
    c.toneSum = g(1);
    origConnect.call(c.air, c.toneSum);
    origConnect.call(c.exGain, c.toneSum);
    c.split = ctx.createChannelSplitter(2);
    c.sideL = g(0.5);
    c.sideR = g(-0.5);
    c.side = g(1);
    c.sideHp = biquad("highpass", 180, 0.7);
    c.wideL = g(0);
    c.wideR = g(0);
    c.merge = ctx.createChannelMerger(2);
    c.wideOut = g(1);
    origConnect.call(c.toneSum, c.split);
    origConnect.call(c.split, c.sideL, 0);
    origConnect.call(c.split, c.sideR, 1);
    origConnect.call(c.sideL, c.side);
    origConnect.call(c.sideR, c.side);
    link(c.side, c.sideHp);
    origConnect.call(c.sideHp, c.wideL);
    origConnect.call(c.sideHp, c.wideR);
    origConnect.call(c.wideL, c.merge, 0, 0);
    origConnect.call(c.wideR, c.merge, 0, 1);
    origConnect.call(c.toneSum, c.wideOut);
    origConnect.call(c.merge, c.wideOut);

    // Пространство.
    c.revSend = g(0);
    c.reverb = ctx.createConvolver();
    c.reverb.buffer = makeImpulse(ctx, 2.2, 3.2);
    c.revHp = biquad("highpass", 220, 0.7);
    c.post = g(1);
    origConnect.call(c.wideOut, c.post);
    link(c.wideOut, c.revSend, c.revHp, c.reverb, c.post);

    // Выравнивание громкости и лимитер, чтобы подъёмы не давали клиппинга.
    c.level = ctx.createDynamicsCompressor();
    c.makeup = g(1);
    c.limiter = ctx.createDynamicsCompressor();
    c.limiter.threshold.value = -1;
    c.limiter.knee.value = 0;
    c.limiter.ratio.value = 20;
    c.limiter.attack.value = 0.001;
    c.limiter.release.value = 0.12;
    link(c.post, c.level, c.makeup, c.limiter, c.wet);

    // 8D: панорама гуляет по кругу.
    c.pan = ctx.createStereoPanner();
    c.lfo = ctx.createOscillator();
    c.lfo.frequency.value = 0.07;
    c.lfoDepth = g(0);
    origConnect.call(c.lfo, c.lfoDepth);
    origConnect.call(c.lfoDepth, c.pan.pan);
    c.lfo.start();

    origConnect.call(c.input, c.bypass);
    origConnect.call(c.bypass, c.master);
    origConnect.call(c.wet, c.master);
    link(c.master, c.pan);
    origConnect.call(c.pan, ctx.destination);
    c.meter = ctx.createAnalyser();
    c.meter.fftSize = 512;
    origConnect.call(c.pan, c.meter);
    apply(c, true);
    return c;
  };

  const dbAmt = (db, amt) => db * amt;
  const apply = (c, instant) => {
    const t = c.ctx.currentTime;
    const set = (param, v) => {
      if (instant) param.value = v;
      else param.setTargetAtTime(v, t, 0.08);
    };
    const special = fx.mode !== "normal";
    const on = fx.studio || special || fx.leveler;
    const a = fx.studio ? fx.amount / 100 : 0;
    set(c.bypass.gain, on ? 0 : 1);
    set(c.wet.gain, on ? 1 : 0);
    // Запас по уровню под подъёмы эквалайзера, лимитер потом аккуратно возвращает громкость.
    set(c.pre.gain, Math.pow(10, -dbAmt(3, a) / 20));
    set(c.low.gain, dbAmt(3.2, a));
    set(c.mud.gain, dbAmt(-1.8, a));
    set(c.presence.gain, dbAmt(1.2, a));
    set(c.air.gain, dbAmt(3, a));
    set(c.exGain.gain, 0.16 * a);
    const k = fx.studio ? (fx.width / 100) * 0.7 : 0;
    set(c.wideL.gain, k);
    set(c.wideR.gain, -k);
    let rev = fx.studio ? (fx.ambience / 100) * 0.28 : 0;
    if (fx.mode === "slowed") rev = Math.max(rev, 0.42);
    if (fx.mode === "8d") rev = Math.max(rev, 0.22);
    set(c.revSend.gain, rev);
    const lv = c.level;
    if (fx.leveler) {
      lv.threshold.value = -26;
      lv.knee.value = 12;
      lv.ratio.value = 3;
      lv.attack.value = 0.008;
      lv.release.value = 0.35;
      set(c.makeup.gain, Math.pow(10, 6 / 20));
    } else {
      lv.threshold.value = 0;
      lv.knee.value = 0;
      lv.ratio.value = 1;
      set(c.makeup.gain, Math.pow(10, dbAmt(2.2, a) / 20));
    }
    set(c.lfoDepth.gain, fx.mode === "8d" ? 0.85 : 0);
  };

  AudioNode.prototype.connect = function (dest) {
    if (dest instanceof AudioDestinationNode) {
      let c = chains.get(dest.context);
      if (!c) {
        try {
          c = build(dest.context);
          chains.set(dest.context, c);
        } catch (e) {
          console.warn("[YMusicMod] fx build", e);
          return origConnect.apply(this, arguments);
        }
      }
      const args = [...arguments];
      args[0] = c.input;
      origConnect.apply(this, args);
      return dest;
    }
    return origConnect.apply(this, arguments);
  };
  AudioNode.prototype.disconnect = function (dest) {
    if (dest instanceof AudioDestinationNode) {
      const c = chains.get(dest.context);
      if (c) {
        const args = [...arguments];
        args[0] = c.input;
        return origDisconnect.apply(this, args);
      }
    }
    return origDisconnect.apply(this, arguments);
  };

  const RATE = { normal: 1, slowed: 0.85, nightcore: 1.2, "8d": 1 };
  const applyRate = (el) => {
    const want = RATE[fx.mode] || 1;
    try {
      el.preservesPitch = want === 1;
      if (Math.abs(el.playbackRate - want) > 0.001) el.playbackRate = want;
    } catch {
    }
  };
  reg.onAdd((el) => {
    el.addEventListener("play", () => applyRate(el));
    el.addEventListener("loadedmetadata", () => applyRate(el));
    // Плеер сбрасывает скорость на 1 при смене трека.
    el.addEventListener("ratechange", () => {
      const want = RATE[fx.mode] || 1;
      if (Math.abs(el.playbackRate - want) > 0.001) setTimeout(() => applyRate(el), 0);
    });
  });

  const api = {
    set(next) {
      fx = { ...fx, ...next };
      chains.forEach((c) => {
        try {
          if (c.ctx.state !== "closed") apply(c, false);
        } catch (e) {
          console.warn("[YMusicMod] fx apply", e);
        }
      });
      elements.forEach(applyRate);
    },
    // Плавно увести общую громкость (для таймера сна).
    fade(to, seconds) {
      chains.forEach((c) => {
        const p = c.master.gain;
        const t = c.ctx.currentTime;
        p.cancelScheduledValues(t);
        p.setValueAtTime(p.value, t);
        p.linearRampToValueAtTime(to, t + Math.max(0.01, seconds));
      });
    },
    // Пиковый уровень на выходе обработки: 0 - тишина.
    peak() {
      let max = 0;
      const buf = new Float32Array(512);
      chains.forEach((c) => {
        c.meter.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]));
      });
      return max;
    },
    get active() {
      return [...chains.values()].filter((c) => c.ctx.state === "running").length;
    },
    get count() {
      return chains.size;
    }
  };
  Object.defineProperty(window, "__ymmFx", { value: api, configurable: false, enumerable: false });

  // Предзагрузка обложек. Списки треков у Яндекса виртуальные: строка создаётся только
  // когда до неё долистали, и лишь тогда начинает грузиться картинка. Но данные треков
  // приходят пачками заранее (api.music.yandex.net) - вытаскиваем оттуда coverUri и тихо
  // качаем + декодируем обложки в фоне, пока пользователь до них не дошёл.
  const covers = {
    enabled: true,
    queue: [],
    seen: new Set(),
    pool: [],
    active: 0,
    sizes: ["100x100"],
    loaded: 0,
    COVER: /"(?:coverUri|ogImage|cover)"\s*:\s*"(avatars\.yandex\.net(?:\\?\/)get-music-content(?:\\?\/)[^"%]+)%%"/g,
    take(text, urgent) {
      if (!this.enabled || typeof text !== "string" || text.length > 6e6) return;
      const fresh = [];
      this.COVER.lastIndex = 0;
      let m;
      while ((m = this.COVER.exec(text))) {
        const base = "https://" + m[1].replace(/\\\//g, "/");
        for (const size of this.sizes) {
          const url = base + size;
          if (this.seen.has(url)) continue;
          this.seen.add(url);
          fresh.push(url);
        }
      }
      if (!fresh.length) return;
      // То, что запросило само приложение, нужно прямо сейчас - вперёд очереди.
      // Фоновые пачки всего плейлиста идут в конец, по порядку списка.
      this.queue = urgent ? fresh.concat(this.queue) : this.queue.concat(fresh);
      if (this.queue.length > 4000) this.queue.length = 4000;
      if (this.seen.size > 20000) this.seen.clear();
      this.pump();
    },
    pump() {
      while (this.enabled && this.active < 6 && this.queue.length) {
        const url = this.queue.shift();
        this.active++;
        const img = new Image();
        img.decoding = "async";
        try {
          img.fetchPriority = "low";
        } catch {
        }
        img.src = url;
        const done = () => {
          this.active--;
          this.loaded++;
          // Держим ссылки на последние картинки, чтобы декодированный кадр остался в памяти.
          this.pool.push(img);
          if (this.pool.length > 500) this.pool.shift();
          if (window.requestIdleCallback) requestIdleCallback(() => this.pump(), { timeout: 300 });
          else setTimeout(() => this.pump(), 16);
        };
        img.decode().then(done, done);
      }
    }
  };
  // Данные треков всего плейлиста. Плейлист приходит списком {id, albumId}, а подробности
  // (с обложками) приложение добирает по ~20 штук прямо перед показом строки. Мы заранее
  // запрашиваем их сами крупными пачками - так обложки успевают загрузиться до прокрутки.
  // Кэш данных треков: лежат в памяти до того, как понадобятся.
  const trackCache = {
    map: new Map(),
    TTL: 20 * 60 * 1000,
    hits: 0,
    misses: 0,
    put(text) {
      let arr;
      try {
        arr = JSON.parse(text);
      } catch {
        return;
      }
      if (!Array.isArray(arr)) arr = arr && Array.isArray(arr.result) ? arr.result : null;
      if (!arr) return;
      const now = Date.now();
      for (const t of arr) if (t && t.id != null) this.map.set(String(t.id), { t, at: now });
      if (this.map.size > 8000) {
        const drop = [...this.map.keys()].slice(0, this.map.size - 6000);
        drop.forEach((k) => this.map.delete(k));
      }
    },
    get(id) {
      const e = this.map.get(String(id).split(":")[0]);
      if (!e || Date.now() - e.at > this.TTL) return null;
      return e.t;
    }
  };
  // Разбор тела запроса /tracks (multipart, urlencoded или JSON) в {trackIds, extra}.
  const parseTracksBody = (text, type) => {
    const ids = [];
    const extra = {};
    const add = (k, v) => {
      if (k === "trackIds" || k === "track-ids") String(v).split(",").forEach((x) => x && ids.push(x.trim()));
      else extra[k] = String(v);
    };
    if (/multipart/.test(type)) {
      for (const m of text.matchAll(/name="([^"]+)"\r?\n\r?\n([^\r\n]*)/g)) add(m[1], m[2]);
    } else if (/json/.test(type)) {
      const o = JSON.parse(text);
      for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => add(k, x));
    } else {
      new URLSearchParams(text).forEach((v, k) => add(k, v));
    }
    return { ids, extra };
  };
  const sameExtra = (a, b) => {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
  };

  const bulk = {
    extra: { removeDuplicates: "false", withProgress: "true" },
    headers: null,
    done: new Set(),
    pending: [],
    running: false,
    rememberHeaders(h) {
      if (!h || !h.get("authorization")) return;
      const out = {};
      h.forEach((v, k) => {
        if (k !== "x-request-id" && k !== "content-type" && k !== "content-length") out[k] = v;
      });
      this.headers = out;
    },
    fromPlaylist(text) {
      if (!this.headers || typeof text !== "string" || text.length > 8e6) return;
      const re = /"id"\s*:\s*"?(\d+)"?\s*,\s*"albumId"\s*:\s*"?(\d+)"?/g;
      const ids = [];
      let m;
      while ((m = re.exec(text)) && ids.length < 3000) {
        const key = `${m[1]}:${m[2]}`;
        if (this.done.has(key)) continue;
        this.done.add(key);
        ids.push(key);
      }
      if (ids.length < 8) return;
      this.pending.push(...ids);
      this.run();
    },
    run() {
      if (this.running) return;
      this.running = true;
      Promise.all([this.worker(), this.worker()]).finally(() => (this.running = false));
    },
    async worker() {
      {
        while (covers.enabled && this.pending.length) {
          const chunk = this.pending.splice(0, 100);
          try {
            const r = await origFetch("https://api.music.yandex.net/tracks", {
              method: "POST",
              // API принимает только форму: trackIds=id:albumId повторяется на каждый трек.
              headers: { ...this.headers, "content-type": "application/x-www-form-urlencoded", "x-request-id": crypto.randomUUID() },
              body: new URLSearchParams([...chunk.map((id) => ["trackIds", id]), ...Object.entries(this.extra)])
            });
            if (!r.ok) {
              bulk.error = `HTTP ${r.status}`;
              break;
            }
            const text = await r.text();
            trackCache.put(text);
            covers.take(text, false);
          } catch (e) {
            bulk.error = String(e && e.message);
            break;
          }
          // Не забиваем сеть: следующая пачка - когда браузер свободен.
          await new Promise((res) => (window.requestIdleCallback ? requestIdleCallback(res, { timeout: 1000 }) : setTimeout(res, 200)));
          await new Promise((res) => setTimeout(res, 150));
        }
      }
    }
  };
  const origFetch = window.fetch;
  const serveTracks = async (self, args) => {
    const input = args[0];
    try {
      const type = input.headers.get("content-type") || "";
      const { ids, extra } = parseTracksBody(await input.clone().text(), type);
      if (Object.keys(extra).length) bulk.extra = extra;
      if (!bulk.headers) bulk.rememberHeaders(input.headers);
      if (ids.length && sameExtra(extra, bulk.extra)) {
        let list = ids;
        if (extra.removeDuplicates === "true") list = [...new Set(ids.map((x) => x.split(":")[0]))];
        const hit = list.map((id) => trackCache.get(id));
        if (hit.every(Boolean)) {
          trackCache.hits++;
          return new Response(JSON.stringify(hit), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
        }
      }
      trackCache.misses++;
    } catch {
    }
    const res = await origFetch.apply(self, args);
    try {
      if (res.ok) res.clone().text().then((t) => {
        trackCache.put(t);
        covers.take(t, true);
      }, () => {});
    } catch {
    }
    return res;
  };
  if (origFetch) {
    window.fetch = function (input) {
      if (covers.enabled && input && typeof input !== "string" && input.method === "POST" && /^https:\/\/api\.music\.yandex\.(net|ru)\/tracks(\?|$)/.test(input.url)) {
        return serveTracks(this, arguments);
      }
      const res = origFetch.apply(this, arguments);
      try {
        const url = typeof input === "string" ? input : input && input.url;
        if (covers.enabled && url && /^https:\/\/api\.music\.yandex\.(net|ru)\//.test(url)) {
          if (!bulk.headers) {
            const init = arguments[1];
            bulk.rememberHeaders(typeof input !== "string" && input.headers ? input.headers : new Headers((init && init.headers) || {}));
          }
          const isPlaylist = /\/(playlist|playlists|albums?)\b|\/users\/[^/]+\/playlists\//.test(url);
          res.then((r) => {
            const type = r.headers.get("content-type") || "";
            if (!r.ok || !/json/.test(type)) return;
            r.clone().text().then((t) => {
              const run = () => {
                covers.take(t, true);
                if (isPlaylist) bulk.fromPlaylist(t);
              };
              if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 500 });
              else setTimeout(run, 0);
            }, () => {});
          }, () => {});
        }
      } catch {
      }
      return res;
    };
  }
  covers.bulk = bulk;
  covers.cache = trackCache;
  Object.defineProperty(window, "__ymmCovers", { value: covers, configurable: false, enumerable: false });
})();
