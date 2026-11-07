// Живая волна в первом экране. Шейдеры те же, что в моде, а вместо звука плавная имитация музыки 96 BPM.
(function () {
  const canvas = document.getElementById("wave");
  const G = window.YMM_GLSL;
  const gl = canvas && G && canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return;

  const N = 256;
  const data = new Float32Array(N * 4);
  const val = data.subarray(0, N), peak = data.subarray(N, N * 2), wav = data.subarray(N * 2, N * 3), soft = data.subarray(N * 3, N * 4);
  const tmp = new Float32Array(N);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const programs = {};
  let mode = "wave";

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(gl.createVertexArray());
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R16F, N, 4);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = (m) => {
    if (programs[m]) return programs[m];
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, G.vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, G.head + G.modes[m]));
    gl.linkProgram(p);
    const u = {};
    for (const n of ["uTex", "uRes", "uCenter", "uA", "uB", "uC", "uT", "uBeat", "uBass", "uMid", "uTre", "uEn", "uAlpha", "uSym", "uGlow", "uRad", "uFull", "uTravel", "uBoxK", "uBoxH", "uCorner", "uReach"]) u[n] = gl.getUniformLocation(p, n);
    return (programs[m] = { p, u });
  };

  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = Math.round(canvas.clientWidth * dpr);
    H = Math.round(canvas.clientHeight * dpr);
    canvas.width = W;
    canvas.height = H;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Спектр музыки: бас бьёт в такт, середина и верхи плавно дышат. Яркость нарастает при загрузке.
  const PERIOD = 60 / 96;
  const synth = (t, level) => {
    const ph = (t % PERIOD) / PERIOD;
    const kick = Math.exp(-ph * 5.5) * (Math.floor(t / PERIOD) % 4 === 3 ? 0.65 : 1);
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      const body = (1 - x) ** 1.2 * 0.55 + 0.1;
      const motion = 0.6 + 0.4 * Math.sin(x * 10 + t * 1.15) * Math.sin(x * 3.6 - t * 0.7);
      const low = Math.max(0, 1 - x * 4.5) * kick * 0.62;
      const v = Math.min(1, (body * motion + low) * level);
      val[i] = v;
      peak[i] = Math.max(v, peak[i] - 0.009);
      wav[i] = (Math.sin(x * 34 + t * 5) * 0.5 + Math.sin(x * 71 - t * 7) * 0.25 + Math.sin(x * 9 + t * 2) * 0.25) * (0.35 + kick * 0.65) * level;
      sum += v;
    }
    soft.set(val);
    for (let pass = 0; pass < 3; pass++) {
      const r = 7;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += soft[Math.min(N - 1, Math.max(0, i))];
      for (let i = 0; i < N; i++) {
        tmp[i] = acc / (2 * r + 1);
        acc += soft[Math.min(N - 1, i + r + 1)] - soft[Math.max(0, i - r)];
      }
      soft.set(tmp);
    }
    for (let i = 0; i < N; i++) soft[i] = Math.min(1, soft[i] * 1.5);
    return { kick, energy: sum / N };
  };

  let start = 0, last = 0, travel = 0, raf = 0, visible = true, modeFade = 1;
  const draw = (now) => {
    raf = 0;
    if (!start) start = now;
    const t = (now - start) / 1000;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    modeFade = Math.min(1, modeFade + dt * 2.2);
    // Единственная постановочная анимация страницы: ровная линия просыпается и становится волной.
    const level = reduced ? 0.85 : Math.min(1, t / 2.2) ** 2 * 0.95 + 0.04;
    const { kick, energy } = synth(reduced ? 3.1 : t, level);
    travel += dt * (0.12 + kick * 0.9);
    const portrait = W < H;
    // Центр колец ниже и правее заголовка, чтобы волна его не пересекала.
    const cx = portrait ? W * 0.5 : W * 0.74, cy = portrait ? H * 0.76 : H * 0.68;
    const rad = Math.min(W, H) * (portrait ? 0.13 : 0.15);
    const { p, u } = program(mode);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(p);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, 4, gl.RED, gl.FLOAT, data);
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform2f(u.uCenter, cx, cy);
    gl.uniform3f(u.uA, 1, 1, 1);
    gl.uniform3f(u.uB, 0.62, 0.62, 0.62);
    gl.uniform3f(u.uC, 0.86, 0.86, 0.86);
    gl.uniform1f(u.uT, t);
    gl.uniform1f(u.uBeat, kick * level);
    gl.uniform1f(u.uBass, kick * 0.55 * level);
    gl.uniform1f(u.uMid, 0.3);
    gl.uniform1f(u.uTre, 0.2);
    gl.uniform1f(u.uEn, energy);
    gl.uniform1f(u.uAlpha, 0.92 * modeFade);
    gl.uniform1f(u.uSym, 1);
    gl.uniform1f(u.uGlow, 0.65);
    gl.uniform1f(u.uRad, rad);
    gl.uniform1f(u.uFull, 1);
    gl.uniform1f(u.uTravel, travel);
    gl.uniform1f(u.uBoxK, 0);
    gl.uniform1f(u.uBoxH, rad);
    gl.uniform1f(u.uCorner, 12);
    gl.uniform1f(u.uReach, rad * 0.62);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (visible && !reduced) raf = requestAnimationFrame(draw);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };
  new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
    if (visible) kick();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) kick();
  });
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      modeFade = 0;
      document.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      kick();
    });
  });
  document.documentElement.classList.add("has-wave");
  kick();
})();
