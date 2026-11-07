  // ── Анализ звука ────────────────────────────────────────────────────────────
  // Всё считается от реального времени кадра, поэтому на 60 и 144 Гц движение одинаковое.
  const BANDS = 256;
  const spectrum = {
    table: null, db: null, td: null, top: -28, rms: 0.12, softGain: 1.4,
    raw: new Float32Array(BANDS), val: new Float32Array(BANDS), peak: new Float32Array(BANDS), hold: new Float32Array(BANDS), wave: new Float32Array(BANDS),
    tmp: new Float32Array(BANDS), soft: new Float32Array(BANDS), softTmp: new Float32Array(BANDS), bass: 0, mid: 0, treble: 0, energy: 0,
    build() {
      const an = audio.analyser;
      const binHz = audio.ctx.sampleRate / an.fftSize;
      const fmin = 32, fmax = 16000;
      this.db = new Float32Array(an.frequencyBinCount);
      this.td = new Float32Array(an.fftSize);
      this.table = [];
      for (let i = 0; i < BANDS; i++) {
        const f0 = fmin * (fmax / fmin) ** (i / BANDS);
        const f1 = fmin * (fmax / fmin) ** ((i + 1) / BANDS);
        const fc = Math.sqrt(f0 * f1);
        // Музыка теряет примерно 3,5 дБ на октаву: без поправки верхи почти не двигаются.
        this.table.push({ a: f0 / binHz, b: f1 / binHz, tilt: 3.5 * Math.log2(fc / 1000), fc });
      }
    },
    update(dt) {
      const an = audio.analyser;
      if (!this.table || this.db.length !== an.frequencyBinCount) this.build();
      an.getFloatFrequencyData(this.db);
      const db = this.db, raw = this.raw;
      let frameTop = -160;
      for (let i = 0; i < BANDS; i++) {
        const t = this.table[i];
        let v;
        if (t.b - t.a < 1) {
          // Низы уже одного бина FFT: интерполируем, иначе полосы идут ступеньками.
          const c = (t.a + t.b) / 2, k = Math.floor(c), fr = c - k;
          v = db[k] * (1 - fr) + db[Math.min(k + 1, db.length - 1)] * fr;
        } else {
          v = -160;
          const end = Math.min(Math.ceil(t.b), db.length);
          for (let j = Math.floor(t.a); j < end; j++) if (db[j] > v) v = db[j];
        }
        v += t.tilt;
        raw[i] = v;
        if (v > frameTop) frameTop = v;
      }
      // Автоуровень: тихий трек двигает волну так же живо, как громкий мастер.
      if (frameTop > this.top) this.top += (frameTop - this.top) * (1 - Math.exp(-dt / 0.06));
      else this.top -= 3.5 * dt;
      this.top = clamp(this.top, -62, 0);
      const silent = frameTop < -92;
      const range = 50;
      const sens = cfg.visSens / 100;
      const curve = 2.7 - sens * 1.5;
      const atk = 1 - Math.exp(-dt / 0.022);
      const rel = 1 - Math.exp(-dt / (0.08 + (cfg.visSmooth / 100) * 0.3));
      const tmp = this.tmp;
      for (let i = 0; i < BANDS; i++) {
        const n = silent ? 0 : clamp((raw[i] - (this.top - range)) / range, 0, 1) ** curve;
        tmp[i] += (n - tmp[i]) * (n > tmp[i] ? atk : rel);
      }
      // Сглаживание по частоте: соседние полосы связаны, волна получается цельной, а не «пилой».
      const val = this.val;
      for (let i = 0; i < BANDS; i++) {
        const a = tmp[Math.max(0, i - 2)], b = tmp[Math.max(0, i - 1)], c = tmp[i], d = tmp[Math.min(BANDS - 1, i + 1)], e = tmp[Math.min(BANDS - 1, i + 2)];
        val[i] = (a + 4 * b + 6 * c + 4 * d + e) / 16;
      }
      // Для волны и колец: три прохода скользящего среднего дают почти гауссову форму без острых пиков.
      const soft = this.soft, st = this.softTmp;
      soft.set(val);
      const rad = 7;
      for (let pass = 0; pass < 3; pass++) {
        let acc = 0;
        for (let i = -rad; i <= rad; i++) acc += soft[clamp(i, 0, BANDS - 1)];
        for (let i = 0; i < BANDS; i++) {
          st[i] = acc / (2 * rad + 1);
          acc += soft[Math.min(BANDS - 1, i + rad + 1)] - soft[Math.max(0, i - rad)];
        }
        soft.set(st);
      }
      // Сглаживание съедает высоту, возвращаем её, чтобы волна оставалась выразительной.
      let softMax = 0.001;
      for (let i = 0; i < BANDS; i++) if (soft[i] > softMax) softMax = soft[i];
      this.softGain += (Math.min(2.6, 0.82 / softMax) - this.softGain) * (1 - Math.exp(-dt / 1.2));
      for (let i = 0; i < BANDS; i++) soft[i] = Math.min(1, soft[i] * this.softGain);
      const peak = this.peak, hold = this.hold;
      let lo = 0, mi = 0, hi = 0, nl = 0, nm = 0, nh = 0, sum = 0;
      for (let i = 0; i < BANDS; i++) {
        const v = val[i], f = this.table[i].fc;
        sum += v;
        if (v >= peak[i]) {
          peak[i] = v;
          hold[i] = 0.28;
        } else if ((hold[i] -= dt) <= 0) peak[i] = Math.max(v, peak[i] - dt * 0.55);
        if (f < 150) { lo += v; nl++; } else if (f < 2600) { mi += v; nm++; } else { hi += v; nh++; }
      }
      const env = (cur, target) => cur + (target - cur) * (target > cur ? 1 - Math.exp(-dt / 0.03) : 1 - Math.exp(-dt / 0.2));
      this.bass = env(this.bass, nl ? lo / nl : 0);
      this.mid = env(this.mid, nm ? mi / nm : 0);
      this.treble = env(this.treble, nh ? hi / nh : 0);
      this.energy = sum / BANDS;
      this.updateWave(dt);
    },
    updateWave(dt) {
      const td = this.td, w = this.wave;
      audio.analyser.getFloatTimeDomainData(td);
      // Триггер как у осциллографа: начинаем с перехода через ноль, иначе линия дрожит.
      let start = 0;
      const span = td.length >> 1;
      for (let i = 1; i < span; i++) {
        if (td[i - 1] < 0 && td[i] >= 0) { start = i; break; }
      }
      const step = span / BANDS;
      let rms = 0;
      for (let i = 0; i < BANDS; i++) {
        const v = td[start + Math.floor(i * step)];
        rms += v * v;
        w[i] = v;
      }
      rms = Math.sqrt(rms / BANDS);
      this.rms += (Math.max(rms, 0.02) - this.rms) * (1 - Math.exp(-dt / 0.5));
      const g = 0.32 / this.rms;
      for (let i = 0; i < BANDS; i++) w[i] = clamp(w[i] * g, -1, 1);
    },
    // Короткая версия спектра для мини-плеера.
    compact(n) {
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = Math.floor((i / n) * BANDS * 0.9), b = Math.max(a + 1, Math.floor(((i + 1) / n) * BANDS * 0.9));
        let m = 0;
        for (let j = a; j < b; j++) m = Math.max(m, this.val[j]);
        out[i] = Math.round(m * 100) / 100;
      }
      return out;
    }
  };

  // ── Бит и темп ──────────────────────────────────────────────────────────────
  const beat = { prev: 0, hist: new Float32Array(72), idx: 0, pulse: 0, level: 0, last: 0, onsets: [], bpm: 0, bpmAt: 0, css: 0 };
  function updateBeat(dt, now) {
    const an = audio.beatAn;
    an.getByteFrequencyData(audio.bass);
    const binHz = audio.ctx.sampleRate / an.fftSize;
    const hi = Math.max(3, Math.ceil(170 / binHz));
    let e = 0;
    for (let i = 1; i <= hi; i++) e += audio.bass[i];
    e = e / hi / 255;
    const flux = Math.max(0, e - beat.prev);
    beat.prev = e;
    let mean = 0, varr = 0;
    const H = beat.hist, L = H.length;
    for (let i = 0; i < L; i++) mean += H[i];
    mean /= L;
    for (let i = 0; i < L; i++) varr += (H[i] - mean) ** 2;
    const thr = mean + 1.6 * Math.sqrt(varr / L) + 0.01;
    H[beat.idx++ % L] = flux;
    if (flux > thr && e > 0.16 && now - beat.last > 130) {
      beat.pulse = Math.max(beat.pulse, clamp(0.55 + flux * 4.5, 0, 1));
      beat.last = now;
      beat.onsets.push(now);
      if (beat.onsets.length > 48) beat.onsets.shift();
    } else beat.pulse *= Math.exp(-dt / 0.15);
    if (now - beat.bpmAt > 1000 && beat.onsets.length > 12) {
      beat.bpmAt = now;
      // Гистограмма интервалов между ударами, свёрнутая в привычный диапазон 70-170.
      const bins = new Float32Array(52);
      const o = beat.onsets;
      for (let i = 0; i < o.length; i++) {
        for (let j = i + 1; j < Math.min(o.length, i + 6); j++) {
          let b = 60000 / (o[j] - o[i]);
          while (b < 70) b *= 2;
          while (b >= 174) b /= 2;
          bins[Math.floor((b - 70) / 2)] += 1 / (j - i);
        }
      }
      let best = 0;
      for (let i = 1; i < bins.length; i++) if (bins[i] > bins[best]) best = i;
      const found = 70 + best * 2 + 1;
      beat.bpm = beat.bpm && Math.abs(found - beat.bpm) < 8 ? beat.bpm * 0.8 + found * 0.2 : found;
    }
    if (now - beat.last > 6000 && beat.onsets.length) {
      beat.onsets.length = 0;
      beat.bpm = 0;
    }
  }
  function setBeat(v) {
    if (Math.abs(v - beat.level) < 0.004 && v !== 0) return;
    if (v === 0 && beat.level === 0) return;
    beat.level = v;
    const s = v.toFixed(3);
    if (targets.bg) targets.bg.style.setProperty("--ymm-beat", s);
    if (targets.player) targets.player.style.setProperty("--ymm-beat", s);
    if (targets.fs) targets.fs.style.setProperty("--ymm-beat", s);
  }

  // ── Графика ─────────────────────────────────────────────────────────────────
  const GLSL_HEAD = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uCenter;
uniform vec3 uA, uB, uC;
uniform float uT, uBeat, uBass, uMid, uTre, uEn, uAlpha, uSym, uGlow, uRad, uFull, uTravel, uBoxK, uBoxH, uCorner, uReach;
out vec4 O;
const float N = ${BANDS}.;
const float PI = 3.14159265;
float row(float x, float r) { x = clamp(x, 0., 1.); return texture(uTex, vec2(x * (1. - 1. / N) + .5 / N, r)).r; }
float spec(float x) { return row(x, 1. / 8.); }
float peakv(float x) { return row(x, 3. / 8.); }
float wav(float x) { return row(x, 5. / 8.); }
float soft(float x) { return row(x, 7. / 8.); }
vec3 pal(float t) {
  t = fract(t) * 3.;
  if (t < 1.) return mix(uA, uB, smoothstep(0., 1., t));
  if (t < 2.) return mix(uB, uC, smoothstep(1., 2., t));
  return mix(uC, uA, smoothstep(2., 3., t));
}
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
// x: 0 - низы, 1 - верхи. В симметричном режиме низы в центре окна.
float axis(float x) { return uSym > .5 ? abs(x * 2. - 1.) : x; }
vec4 over(vec4 base, vec3 col, float a) { return vec4(base.rgb * (1. - a) + col * a, base.a * (1. - a) + a); }
`;
  const GLSL_MODES = {
    // Волна: несколько слоёв живой ткани со своей фазой. Ярче гребень, внизу мягко растворяется.
    wave: `
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float px = 1. / uRes.y;
  float yy = uFull > .5 ? uv.y / .62 : uv.y;
  vec4 c = vec4(0);
  float glow = uGlow;
  for (int k = 0; k < 4; k++) {
    float i = float(k);
    float depth = i / 3.;
    float t = uT * (.28 + .16 * i);
    float x = uv.x;
    float m = axis(x);
    float s = soft(pow(m, 1.15) * .9);
    float r1 = sin(x * (4. + i * 2.6) * PI + t * 2. + i * 1.9);
    float r2 = sin(x * (9. + i * 4.1) * PI - t * 1.35 + i * .7);
    float ripple = .62 * r1 + .38 * r2;
    float taper = smoothstep(0., .1, x) * smoothstep(1., .9, x);
    float amp = mix(.9, .46, depth);
    float h = (.035 + uBass * .07 + s * amp * (.82 + .18 * ripple) + ripple * (.012 + uEn * .05)) * taper;
    h = max(h, .004);
    float d = yy - h;
    vec3 col = pal(x * .55 + i * .14 + uT * .018);
    float under = smoothstep(px, -px, d);
    float rise = pow(clamp(yy / h, 0., 1.), 2.4);
    float fill = under * rise * mix(.42, .16, depth);
    c = over(c, col, fill);
    float w = (1.5 + uBeat * 1.3) * px * (uFull > .5 ? 1.6 : 1.);
    float line = exp(-abs(d) / w) * mix(.95, .4, depth) * taper;
    float halo = exp(-abs(d) / (w * 9.)) * glow * mix(.5, .16, depth) * taper;
    c.rgb += col * (line + halo);
    c.a = max(c.a, clamp(line + halo, 0., 1.));
  }
  O = vec4(c.rgb, clamp(c.a, 0., 1.)) * uAlpha;
}`,
    // Полосы: скруглённые столбики, падающие пики и отражённое свечение.
    bars: `
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float count = uSym > .5 ? floor(uRes.x / 18.) : floor(uRes.x / 11.);
  count = clamp(count, 24., 120.);
  float m = axis(uv.x);
  float id = floor(m * count);
  float f = fract(m * count) - .5;
  float cw = uRes.x / (count * (uSym > .5 ? 2. : 1.));
  float s = spec(pow((id + .5) / count, 1.2) * .94);
  float p = peakv(pow((id + .5) / count, 1.2) * .94);
  float H = uRes.y * (uFull > .5 ? .55 : 1.);
  float y = gl_FragCoord.y;
  float bh = max(3., (s * .94) * H);
  float d = box(vec2(f * cw, y - bh * .5), vec2(cw * .34, bh * .5), min(cw * .34, 5.));
  vec3 col = pal((id + .5) / count * .5 + uT * .018);
  col = mix(col, vec3(1), smoothstep(.2, 1., y / max(bh, 1.)) * .22);
  float a = 1. - smoothstep(-.6, .6, d);
  float g = exp(-max(d, 0.) / 9.) * .42 * uGlow * step(0., d);
  float py = max(3., p * .94 * H) + 3.;
  float cap = (1. - smoothstep(-.6, .6, box(vec2(f * cw, y - py), vec2(cw * .34, 1.2), 1.))) * .9;
  vec3 rgb = col * (a + g + cap);
  O = vec4(rgb, clamp(a + g + cap, 0., 1.)) * uAlpha;
}`,
    // Зеркало: тот же спектр вверх и вниз от центральной линии.
    mirror: `
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float count = clamp(floor(uRes.x / 13.), 24., 128.);
  float m = axis(uv.x);
  float id = floor(m * count);
  float f = abs(fract(m * count) - .5);
  float s = spec(pow((id + .5) / count, 1.2) * .94);
  float yc = abs(uv.y - .5) * 2.;
  float h = .03 + s * .92;
  float cell = 1. - smoothstep(.34, .42, f);
  float a = cell * smoothstep(h + .02, h - .02, yc);
  vec3 col = pal((id + .5) / count * .5 + uT * .018);
  col = mix(col, vec3(1), pow(1. - clamp(yc / h, 0., 1.), 3.) * .35);
  float g = exp(-abs(yc - h) * 16.) * .3 * uGlow * cell;
  O = vec4(col * (a * (.55 + .45 * yc / h) + g), clamp(a + g, 0., 1.)) * uAlpha;
}`,
    // Северное сияние: занавеси шума, которые раздувает спектр.
    aurora: `
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = vec3(0);
  for (int k = 0; k < 3; k++) {
    float i = float(k);
    float s = soft(abs(fract(uv.x * .9 + i * .29) * 2. - 1.) * .8);
    float n = fbm(vec2(uv.x * 2.6 + i * 3.1 + uT * .07, uT * .045 + i * 1.7));
    float base = .22 + .5 * n + .12 * s + uBass * .06;
    float dist = uv.y - base;
    float curtain = exp(-max(dist, 0.) * (3.2 - s * 1.6)) * smoothstep(-.04, .03, dist);
    float rays = .55 + .6 * fbm(vec2(uv.x * 19. + i * 5.3, uT * .2 + i));
    c += pal(uv.x * .35 + i * .22 + uT * .012) * curtain * rays * (.14 + s * .7);
  }
  // Мягкий предел яркости: сияние не должно выжигать текст поверх него.
  c = (1. - exp(-c * (1.15 + uBeat * .3))) * .78;
  float a = clamp(max(c.r, max(c.g, c.b)), 0., 1.);
  O = vec4(c, a) * uAlpha;
}`,
    // Осциллограф: настоящая форма сигнала, как на приборе.
    scope: `
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float e = 1.5 / N;
  float v = wav(uv.x);
  float taper = smoothstep(0., .06, uv.x) * smoothstep(1., .94, uv.x);
  float y = .5 + v * .42 * taper;
  float slope = (wav(uv.x + e) - wav(uv.x - e)) * .42 / (2. * e) * uRes.y / uRes.x;
  float d = abs(uv.y - y) * uRes.y / sqrt(1. + slope * slope);
  vec3 col = pal(uv.x * .6 + uT * .03);
  float w = 1.1 + uBeat * .9;
  float line = exp(-d / w);
  float halo = exp(-d / (w * 10.)) * .55 * uGlow;
  O = vec4(col * (line + halo) + vec3(line * .3), clamp(line + halo, 0., 1.)) * uAlpha;
}`,
    // Кольца: волна вокруг обложки и ударная волна на каждый бит. Форма плавно переходит от круга
    // к контуру вокруг обложки: в режиме с текстом для большого круга нет места.
    rings: `
void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float circle = length(p) - uRad;
  vec2 q = abs(p) - vec2(uBoxH - uCorner);
  float box = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - uCorner;
  float dist = mix(circle, box, uBoxK);
  float ang = atan(p.x, p.y);
  float m = abs(ang) / PI;
  vec4 c = vec4(0);
  for (int k = 0; k < 3; k++) {
    float i = float(k);
    float depth = i / 2.;
    float s = soft(pow(m, 1.15) * .9);
    float rip = sin(ang * (6. + i * 3.) + uT * (.5 + i * .4) + i * 2.) * .5 + .5;
    float R = 3. + uBass * uReach * .08 + s * uReach * mix(1., .484, depth) * (.8 + .2 * rip);
    float d = dist - R;
    vec3 col = pal(m * .5 + i * .16 + uT * .02);
    float under = smoothstep(1., -1., d) * step(0., dist);
    float fill = under * pow(clamp(dist / max(R, 1.), 0., 1.), 2.) * mix(.5, .2, depth);
    c = over(c, col, fill);
    float line = exp(-abs(d) / (1.4 + uBeat)) * mix(.95, .45, depth);
    float halo = exp(-abs(d) / 22.) * mix(.5, .18, depth) * uGlow;
    c.rgb += col * (line + halo);
    c.a = max(c.a, clamp(line + halo, 0., 1.));
  }
  float shock = exp(-abs(dist - (1. - uBeat) * uReach * 1.45) / 8.5) * uBeat * .55;
  c.rgb += pal(uT * .05) * shock;
  c.a = max(c.a, shock);
  O = vec4(c.rgb, clamp(c.a, 0., 1.)) * uAlpha;
}`,
    // Звёзды: полёт сквозь поле, скорость задаёт бас.
    stars: `
void main() {
  vec2 p = (gl_FragCoord.xy - uCenter) / min(uRes.x, uRes.y);
  float l = length(p) + 1e-4;
  float a = atan(p.y, p.x) / (2. * PI) + .5;
  vec3 c = vec3(0);
  for (int k = 0; k < 3; k++) {
    float i = float(k);
    float seg = 34. + i * 22.;
    vec2 g = vec2(a * seg, log(l) * (3.4 + i) - uTravel * (1. + i * .3));
    vec2 id = floor(g);
    id.x = mod(id.x, seg);
    vec2 f = fract(g) - .5;
    float h = hash(id + i * 17.);
    if (h < .72) continue;
    f.x += (hash(id + 3.1) - .5) * .7;
    f.y += (hash(id + 9.7) - .5) * .4;
    float stretch = 1. + uBass * 7.;
    float d = length(vec2(f.x * 3.2, f.y / stretch * 1.6));
    float s = spec(hash(id + 5.5) * .85);
    float star = exp(-d * d * 42.) * (.25 + s * 1.9) * smoothstep(.02, .3, l);
    c += pal(h * 2. + uT * .02) * star;
  }
  float core = exp(-l * 7.) * (uBass * .5 + uBeat * .35) * uGlow;
  c += pal(uT * .03) * core;
  O = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0., 1.)) * uAlpha;
}`
  };
  const GLSL_VS = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0, 1); }`;

  const srgb = (hex) => hexToRgb(hex).map((v) => v / 255);
  // Слишком тёмный цвет на тёмном фоне не виден: поднимаем яркость, оттенок сохраняем.
  const visible = (hex) => {
    const [r, g, b] = srgb(hex);
    const m = Math.max(r, g, b);
    if (m >= 0.45) return [r, g, b];
    if (m < 0.04) return [0.72, 0.72, 0.76];
    const k = 0.62 / m;
    return [r * k, g * k, b * k];
  };
  const hsl = (h, s, l) => {
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  };

  const vis = {
    canvas: null, gl: null, prog: {}, mode: "", tex: null, data: new Float32Array(BANDS * 4), w: 0, h: 0, dpr: 1, scale: 1, clear: null,
    energy: 0, fps: 0, frames: 0, fpsAt: 0, lastDraw: 0, lastTick: 0, slowFor: 0, cols: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], t: 0, travel: 0, renderer: "", ctx2d: null, inFs: false, center: [0, 0], radius: 100, fade: 0, fsAt: 0, fx: { cx: 0, cy: 0, box: 0, boxT: 0, boxH: 100, reach: 60, reachT: 60, rad: 100, snap: true },
    init() {
      if (this.canvas && this.canvas.isConnected) return true;
      if (this.canvas) {
        document.body.appendChild(this.canvas);
        return true;
      }
      this.canvas = h("canvas", { id: "ymmod-vis", "aria-hidden": "true" });
      document.body.appendChild(this.canvas);
      const gl = this.canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
      if (gl) this.setupGl(gl);
      else {
        console.warn("[YMusicMod] WebGL2 недоступен, визуализатор в простом режиме");
        this.ctx2d = this.canvas.getContext("2d");
      }
      this.canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this.gl = null;
      });
      this.canvas.addEventListener("webglcontextrestored", () => {
        this.prog = {};
        this.setupGl(this.canvas.getContext("webgl2"));
      });
      this.clear = () => {
        if (this.gl) {
          this.gl.clearColor(0, 0, 0, 0);
          this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        } else if (this.ctx2d) this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.energy = 0;
      };
      layoutCanvas();
      return true;
    },
    setupGl(gl) {
      this.gl = gl;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16F, BANDS, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      try {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        this.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      } catch {
      }
    },
    program(mode) {
      const gl = this.gl;
      if (this.prog[mode]) return this.prog[mode];
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${mode}: ${gl.getShaderInfoLog(s)}`);
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, GLSL_VS));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, GLSL_HEAD + GLSL_MODES[mode]));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${mode}: ${gl.getProgramInfoLog(p)}`);
      const u = {};
      for (const n of ["uTex", "uRes", "uCenter", "uA", "uB", "uC", "uT", "uBeat", "uBass", "uMid", "uTre", "uEn", "uAlpha", "uSym", "uGlow", "uRad", "uFull", "uTravel", "uBoxK", "uBoxH", "uCorner", "uReach"]) u[n] = gl.getUniformLocation(p, n);
      return (this.prog[mode] = { p, u });
    },
    targetColors() {
      if (cfg.visColor === "rainbow") {
        const t = (performance.now() / 1000) * 14;
        return [hsl(t % 360, 0.85, 0.62), hsl((t + 60) % 360, 0.85, 0.62), hsl((t + 130) % 360, 0.85, 0.62)];
      }
      if (cfg.visColor === "custom") {
        const a = visible(cfg.visColor1), b = visible(cfg.visColor2);
        return [a, b, a.map((v, i) => (v + b[i]) / 2)];
      }
      if (cfg.visColor === "cover" && accent.palette) return accent.palette.map(visible);
      const a = visible(accent.ui);
      const lift = a.map((v) => Math.min(1, v * 0.6 + 0.4));
      return [a, lift, a];
    },
    activeMode() {
      if (this.inFs) return cfg.visFsMode;
      return cfg.visualizer;
    },
    draw(dt) {
      this.t += dt;
      this.travel += dt * (0.12 + spectrum.bass * 1.5 + beat.pulse * 0.3);
      // Цвета переливаются к новой обложке, а не переключаются рывком.
      const tgt = this.targetColors();
      const k = 1 - Math.exp(-dt / 0.5);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.cols[i][j] += (tgt[i][j] - this.cols[i][j]) * k;
      if (!this.gl) return this.draw2d();
      const gl = this.gl, mode = this.activeMode();
      if (!this.w || !this.h) return;
      let prog;
      try {
        prog = this.program(mode);
      } catch (e) {
        console.warn("[YMusicMod] shader", e.message);
        return;
      }
      this.data.set(spectrum.val, 0);
      this.data.set(spectrum.peak, BANDS);
      this.data.set(spectrum.wave, BANDS * 2);
      this.data.set(spectrum.soft, BANDS * 3);
      gl.viewport(0, 0, this.w, this.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog.p);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BANDS, 4, gl.RED, gl.FLOAT, this.data);
      const u = prog.u;
      gl.uniform1i(u.uTex, 0);
      gl.uniform2f(u.uRes, this.w, this.h);
      // Обложка отъезжает влево при включении текста: кольца едут за ней, а не прыгают.
      const ease = 1 - Math.exp(-dt / 0.14);
      const f = this.fx;
      if (f.snap) {
        f.cx = this.center[0];
        f.cy = this.center[1];
        f.box = f.boxT;
        f.reach = f.reachT;
        f.rad = this.radius;
        f.snap = false;
      } else {
        f.cx += (this.center[0] - f.cx) * ease;
        f.cy += (this.center[1] - f.cy) * ease;
        f.box += (f.boxT - f.box) * ease;
        f.reach += (f.reachT - f.reach) * ease;
        f.rad += (this.radius - f.rad) * ease;
      }
      gl.uniform2f(u.uCenter, f.cx * this.pixel, this.h - f.cy * this.pixel);
      gl.uniform3fv(u.uA, this.cols[0]);
      gl.uniform3fv(u.uB, this.cols[1]);
      gl.uniform3fv(u.uC, this.cols[2]);
      gl.uniform1f(u.uT, this.t);
      gl.uniform1f(u.uBeat, beat.pulse);
      gl.uniform1f(u.uBass, spectrum.bass);
      gl.uniform1f(u.uMid, spectrum.mid);
      gl.uniform1f(u.uTre, spectrum.treble);
      gl.uniform1f(u.uEn, spectrum.energy);
      // Прозрачность по ощущениям: 20% на ползунке остаётся заметной, но ненавязчивой.
      // За интерфейсом волна чуть тише, чтобы текст оставался читаемым.
      const alpha = this.inFs ? 1 : (cfg.visualizerOpacity / 100) ** 0.62 * (cfg.visPlace === "full" ? 0.8 : 1);
      gl.uniform1f(u.uAlpha, alpha * this.fade);
      gl.uniform1f(u.uSym, cfg.visSym ? 1 : 0);
      gl.uniform1f(u.uGlow, cfg.visGlow / 100);
      gl.uniform1f(u.uRad, f.rad * this.pixel);
      gl.uniform1f(u.uBoxK, f.box);
      gl.uniform1f(u.uBoxH, f.boxH * this.pixel);
      gl.uniform1f(u.uCorner, 12 * this.pixel);
      gl.uniform1f(u.uReach, f.reach * this.pixel);
      gl.uniform1f(u.uFull, this.inFs || cfg.visPlace === "full" ? 1 : 0);
      gl.uniform1f(u.uTravel, this.travel);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    // Запасной вариант без WebGL: простые полосы.
    draw2d() {
      const c = this.ctx2d;
      if (!c) return;
      const { w, h: H } = this;
      c.clearRect(0, 0, w, H);
      const n = 72;
      const bw = w / n;
      c.fillStyle = accent.ui;
      c.globalAlpha = cfg.visualizerOpacity / 100;
      for (let i = 0; i < n; i++) {
        const v = spectrum.val[Math.floor((i / n) * BANDS * 0.94)];
        const bh = Math.max(2, v * H * 0.94);
        c.fillRect(i * bw + 1, H - bh, Math.max(1, bw - 2), bh);
      }
      c.globalAlpha = 1;
    },
    // Подстройка под видеокарту: если кадры не успевают, снижаем разрешение, а не плавность.
    adapt(delta) {
      const budget = 1000 / Math.min(cfg.visFps, 60);
      if (delta > 250) return;
      this.slowFor = delta > budget * 1.5 ? this.slowFor + delta : Math.max(0, this.slowFor - delta * 0.5);
      if (this.slowFor > 2500 && this.scale > 0.45) {
        this.scale = Math.max(0.45, this.scale * 0.8);
        this.slowFor = 0;
        layoutCanvas();
      }
    }
  };

  const fsPlayer = () => (cfg && cfg.fullscreenFx ? $('[class*="FullscreenPlayerDesktop_root"]') : null);
  function layoutCanvas() {
    const cv = vis.canvas;
    if (!cv || !cfg) return;
    const fs = fsPlayer();
    let cssW = 0, cssH = 0;
    if (fs) {
      if (cv.parentElement !== fs) fs.append(cv);
      if (!vis.inFs) vis.fx.snap = true;
      vis.inFs = true;
      targets.fs = fs;
      const r = fs.getBoundingClientRect();
      cssW = r.width;
      cssH = r.height;
      const poster = fs.querySelector('[class*="FullscreenPlayerDesktopPoster_cover"]');
      const pr = poster ? poster.getBoundingClientRect() : null;
      const lyrics = fs.querySelector('[class*="SyncLyrics_root"], [class*="PlayQueue_root"]');
      const lr = lyrics ? lyrics.getBoundingClientRect() : null;
      const on = Boolean(lr && lr.width > 40);
      cv.className = on ? "ymm-vis-fs ymm-vis-lyr" : "ymm-vis-fs";
      cv.style.cssText = on ? `--ymm-lx:${Math.round(lr.left - r.left)}px` : "";
      // Для размеров берём offsetWidth: на него не влияет пульсация обложки под бит.
      const side = poster ? poster.offsetWidth : Math.min(cssW, cssH) * 0.4;
      vis.center = pr ? [pr.left - r.left + pr.width / 2, pr.top - r.top + pr.height / 2] : [cssW / 2, cssH * 0.42];
      vis.radius = side * 0.72;
      vis.fx.boxH = side / 2;
      vis.fx.boxT = on ? 1 : 0;
      // С текстом волна остаётся в промежутке между обложкой и строками.
      vis.fx.reachT = on && pr ? clamp(lr.left - pr.right - 10, 18, side * 0.16) : vis.radius * 0.62;
    } else {
      if (cv.parentElement !== document.body) document.body.appendChild(cv);
      vis.inFs = false;
      targets.fs = null;
      const off = cfg.visualizer === "off";
      const vibe = $('[class*="VibePage_root"]');
      if (cfg.visPlace === "full") {
        cv.className = "ymm-vis-full";
        cv.style.cssText = off ? "display:none" : "";
        cssW = innerWidth;
        cssH = innerHeight;
      } else {
        const p = targets.player && targets.player.isConnected ? targets.player : $(SEL.playerRoot);
        const r = p ? p.getBoundingClientRect() : null;
        const H = cfg.visHeight;
        cv.className = "ymm-vis-bar";
        if (r && r.height > 20 && r.top > 60 && r.bottom <= innerHeight + 2 && !vibe) {
          cv.style.cssText = `display:${off ? "none" : "block"};left:${r.left + 8}px;width:${Math.max(0, r.width - 16)}px;top:${r.top - H}px;height:${H}px`;
          cssW = Math.max(0, r.width - 16);
          cssH = H;
        } else if (vibe) {
          // На «Моей волне» своя раскладка без нижней панели: волна идёт вдоль края окна.
          const box = vibe.getBoundingClientRect();
          cv.style.cssText = `display:${off ? "none" : "block"};left:${box.left}px;width:${box.width}px;top:${innerHeight - H}px;height:${H}px`;
          cssW = box.width;
          cssH = H;
        } else cv.style.cssText = "display:none";
      }
      vis.center = [cssW / 2, cssH / 2];
      vis.radius = Math.min(cssW, cssH) * 0.26;
      vis.fx.boxT = 0;
      vis.fx.reachT = vis.radius * 0.62;
      vis.fx.snap = true;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * vis.scale;
    const w = Math.round(cssW * dpr), hh = Math.round(cssH * dpr);
    if (w && hh && (cv.width !== w || cv.height !== hh)) {
      cv.width = w;
      cv.height = hh;
    }
    vis.w = cssW ? cv.width : 0;
    vis.h = cssH ? cv.height : 0;
    vis.pixel = dpr;
  }

  const targets = { bg: null, player: null, fs: null };
  const loop = {
    raf: 0, last: 0,
    kick() {
      if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    },
    tick: (nowArg) => {
      loop.raf = 0;
      // Плеер на весь экран уже удалён вместе с холстом: возвращаем волну на место в этом же кадре,
      // иначе vis.init() вставит холст в body со старыми размерами и кольца вспыхнут поверх страницы.
      if (vis.inFs && !(vis.canvas && vis.canvas.isConnected)) fsFx.check();
      const now = nowArg || performance.now();
      // Текст включают кнопкой внутри плеера, и обложка едет с анимацией: следим за раскладкой.
      if (vis.inFs && now - vis.fsAt > 120) {
        vis.fsAt = now;
        layoutCanvas();
      }
      const delta = now - (loop.last || now - 16);
      loop.last = now;
      const dt = clamp(delta / 1000, 0.001, 0.1);
      const active = audio.needed() && audio.analyser && !document.hidden;
      if (!active) {
        setBeat(0);
        if (vis.clear) vis.clear();
        vis.fade = 0;
        return;
      }
      const wantVis = cfg.visualizer !== "off" || vis.inFs;
      spectrum.update(dt);
      updateBeat(dt, now);
      // Пока пользователь листает, стили не трогаем - кадр отдаём прокрутке. Сама волна рисуется
      // на видеокарте и прокрутке не мешает.
      const scrollingNow = cfg.scrollBoost && now < scrolling.until;
      if (!scrollingNow) {
        if (cfg.beatSync) {
          const level = Math.max(beat.pulse, spectrum.bass * 0.3) * (cfg.beatIntensity / 100);
          // Переменная пересчитывает стили: 40 раз в секунду глазу достаточно.
          if (now - beat.css > 24) {
            beat.css = now;
            setBeat(level);
          }
        } else setBeat(0);
      }
      if (wantVis) {
        vis.init();
        vis.fade += ((audio.playing ? 1 : 0) - vis.fade) * (1 - Math.exp(-dt / (audio.playing ? 0.25 : 0.5)));
        vis.adapt(delta);
        const minGap = 1000 / cfg.visFps - 1.5;
        if (now - vis.lastDraw >= minGap) {
          const drawDt = clamp((now - (vis.lastDraw || now - 16)) / 1000, 0.001, 0.1);
          vis.lastDraw = now;
          vis.draw(drawDt);
          vis.energy = spectrum.energy;
          vis.frames++;
          if (now - vis.fpsAt > 1000) {
            vis.fps = Math.round((vis.frames * 1000) / (now - vis.fpsAt));
            vis.frames = 0;
            vis.fpsAt = now;
          }
        }
      } else if (vis.clear) vis.clear();
      if (audio.playing || beat.pulse > 0.01 || spectrum.energy > 0.004 || vis.fade > 0.01) loop.kick();
      else {
        setBeat(0);
        if (vis.clear) vis.clear();
        vis.fade = 0;
      }
    }
  };
