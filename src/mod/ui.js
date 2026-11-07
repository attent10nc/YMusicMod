  // ── Уведомления ─────────────────────────────────────────────────────────────
  const toast = (text, opts = {}) => {
    if (!ui.toasts) return;
    const ms = opts.ms || (opts.action ? 5000 : 2000);
    const el = h("div", { class: "toast", role: "status", style: `--d:${ms}ms` }, text,
      opts.action ? h("button", { onclick: () => {
        close();
        opts.action.run();
      } }, opts.action.label) : null);
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      el.classList.add("out");
      setTimeout(() => el.remove(), 220);
    };
    timer = setTimeout(close, ms);
    while (ui.toasts.children.length >= 3) ui.toasts.firstChild.remove();
    ui.toasts.append(el);
  };

  // ── Горячие клавиши ─────────────────────────────────────────────────────────
  const HOTKEYS = [
    ["Y", "Панель настроек", () => ui.toggle()],
    ["F", "Плеер на весь экран", () => {
      const close = $('[class*="FullscreenPlayerDesktop_closeButton"]');
      const btn = (close && (close.matches("button") ? close : close.querySelector("button"))) || $('[data-test-id="FULLSCREEN_PLAYER_BUTTON"]');
      if (btn) btn.click();
    }],
    ["B", "Пульс под бит", () => {
      setOpt({ beatSync: !cfg.beatSync });
      toast(`Пульс: ${cfg.beatSync ? "вкл" : "выкл"}`);
    }],
    ["V", "Следующий визуализатор", () => {
      const order = VIS_MODES.map((m) => m[0]);
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
  const editing = (t) => t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && t.type !== "range" && t.type !== "checkbox";
  window.addEventListener("keydown", (e) => {
    const t = e.composedPath()[0];
    if (e.key === "Escape") {
      if (cmdk.open) cmdk.toggle(false);
      else if (ui.overlay) ui.closeOverlay();
      else if (ui.open) {
        if (ui.query) ui.setQuery("");
        else ui.toggle(false);
      } else return;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyK") {
      e.preventDefault();
      e.stopPropagation();
      cmdk.toggle();
      return;
    }
    if (ui.open && e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyZ" && !editing(t)) {
      e.preventDefault();
      e.stopPropagation();
      history.undo();
      return;
    }
    if (!e.ctrlKey || !e.shiftKey || e.altKey) return;
    if (editing(t)) return;
    const hk = HOTKEYS.find(([k]) => e.code === `Key${k}`);
    if (!hk) return;
    e.preventDefault();
    e.stopPropagation();
    hk[2]();
  }, true);

  // ── Отмена ──────────────────────────────────────────────────────────────────
  const history = {
    stack: [], lastAt: 0, lastKeys: "",
    // Движение одного ползунка считаем одним шагом, а не сотней.
    remember(patch) {
      const keys = Object.keys(patch).sort().join();
      const now = performance.now();
      if (keys === this.lastKeys && now - this.lastAt < 700 && this.stack.length) {
        this.lastAt = now;
        return;
      }
      const prev = {};
      for (const k of Object.keys(patch)) prev[k] = cfg[k];
      this.stack.push(prev);
      if (this.stack.length > 60) this.stack.shift();
      this.lastKeys = keys;
      this.lastAt = now;
    },
    undo() {
      const prev = this.stack.pop();
      this.lastKeys = "";
      if (!prev) return toast("Отменять нечего");
      setOpt(prev, { keepPreset: true, noHistory: true });
      ui.render();
      toast("Отменено");
    }
  };

  // ── Пресеты ─────────────────────────────────────────────────────────────────
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
      // Вид меняется целиком, поэтому показываем это плавным наплывом, а не рывком.
      // startViewTransition вызывает функцию не сразу, поэтому панель обновляем внутри неё.
      const run = () => {
        setOpt(patch, { keepPreset: true });
        ui.render();
      };
      if (document.startViewTransition && cfg.uiMotion && !cfg.reducedMotion) document.startViewTransition(run);
      else run();
      toast(`Пресет: ${name}`, { action: { label: "Отменить", run: () => history.undo() } });
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
      ui.render();
      toast(`Сохранено: ${name}`);
    },
    remove(name) {
      const next = { ...cfg.presets };
      delete next[name];
      setOpt({ presets: next, activePreset: cfg.activePreset === name ? null : cfg.activePreset }, { keepPreset: true });
      ui.render();
      toast(`Удалён пресет «${name}»`, { action: { label: "Вернуть", run: () => history.undo() } });
    }
  };

  // ── Значки и подписи ────────────────────────────────────────────────────────
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    sound: svg('<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>'),
    vis: svg('<path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-12 5-12 2.5 6 5 6"/>'),
    look: svg('<path d="M5 19 10.5 5h3L19 19M7.6 14h8.8"/>'),
    bg: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9.2" r="1.3"/>'),
    color: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.2 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.9 17 3 12 3Z"/><circle cx="7.5" cy="11" r=".9"/><circle cx="10" cy="7" r=".9"/><circle cx="15" cy="7.2" r=".9"/>'),
    player: svg('<rect x="3" y="14" width="18" height="6.5" rx="3.2"/><path d="M10 3.8v6.4l5-3.2z"/>'),
    discord: svg('<path d="M8 7c1.3-.4 2.6-.6 4-.6s2.7.2 4 .6M6.5 17.3c1.7.8 3.5 1.2 5.5 1.2s3.8-.4 5.5-1.2M8.6 6.6 7.6 4.5c-1.6.3-3 .8-4.2 1.6C1.9 10 1.4 14 2 17.8c1.4 1 3 1.8 4.7 2.2l1.1-2M15.4 6.6l1-2.1c1.6.3 3 .8 4.2 1.6 1.5 3.9 2 7.9 1.4 11.7-1.4 1-3 1.8-4.7 2.2l-1.1-2"/><circle cx="9" cy="12.6" r="1.4"/><circle cx="15" cy="12.6" r="1.4"/>'),
    stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    presets: svg('<path d="M12 3 21 8l-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5M3 17.5l9 5 9-5" opacity=".55"/>'),
    more: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    close: svg('<path d="m6 6 12 12M18 6 6 18"/>'),
    undo: svg('<path d="M4 8h10a6 6 0 0 1 0 12H8"/><path d="M8 4 4 8l4 4"/>'),
    spark: svg('<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>')
  };
  const VIS_MODES = [
    ["wave", "Волна", '<path d="M1 16c4 0 4-10 8-10s5 12 9 12 5-14 9-14 4 8 8 8" stroke-width="2"/>'],
    ["aurora", "Сияние", '<path d="M2 18c5-12 7-12 11-4s6 6 9-2 7-8 12 2" stroke-width="2"/><path d="M2 20c5-6 9-6 12-2s7 4 9-1 7-4 11 1" stroke-width="1.2" opacity=".5"/>'],
    ["bars", "Полосы", '<path d="M4 20v-6M10 20V8M16 20V3M22 20v-9M28 20v-5M34 20v-8" stroke-width="3"/>'],
    ["mirror", "Зеркало", '<path d="M4 15V9M10 18V6M16 21V3M22 18V6M28 15V9" stroke-width="3"/>'],
    ["scope", "Осцилл.", '<path d="M1 12h6l3-8 5 16 5-13 4 8 3-3h9" stroke-width="2"/>'],
    ["rings", "Кольца", '<circle cx="18" cy="11" r="5" stroke-width="2"/><circle cx="18" cy="11" r="9.5" stroke-width="1.2" opacity=".55"/>'],
    ["stars", "Звёзды", '<path d="M18 11l-6-4M18 11l7-6M18 11l9 3M18 11l-2 9M18 11l-11 4" stroke-width="1.8"/>'],
    ["off", "Выкл", '<path d="M8 11h20" stroke-width="2" opacity=".5"/>']
  ];
  const VIS_LABEL = Object.fromEntries(VIS_MODES.map((m) => [m[0], m[1].toLowerCase()]));
  const TABS = [
    ["sound", "Звук", "Обработка, режимы, таймер сна"],
    ["vis", "Волна", "Визуализатор и реакция на музыку"],
    ["bg", "Фон", "Картинки, видео, слайдшоу"],
    ["color", "Цвет", "Акцент интерфейса"],
    ["player", "Плеер", "Вид панели и анимации"],
    ["look", "Вид", "Шрифт, логотип, меню"],
    ["discord", "Discord", "Статус «Слушает»"],
    ["stats", "Статы", "Сколько и что ты слушаешь"],
    ["presets", "Пресеты", "Готовые образы в один клик"],
    ["more", "Ещё", "Клавиши, мини-плеер, резервные копии"]
  ];
  // Что сбрасывает кнопка внизу раздела.
  const TAB_KEYS = {
    sound: ["sound", "studioAmount", "studioWidth", "studioAmbience", "soundProfile", "studioBass", "balance", "playRate", "preservePitch", "leveler", "loudnessNorm", "playMode"],
    vis: ["visualizer", "visualizerOpacity", "visPlace", "visHeight", "visColor", "visColor1", "visColor2", "visSym", "visGlow", "visSens", "visSmooth", "visFps", "visFsMode", "beatSync", "beatIntensity", "bgPulse"],
    bg: ["blur", "dim", "saturation", "contentAlpha", "bgMode", "slideInterval", "dayStartHour", "nightStartHour", "cleanVibe", "hideWaveArt"],
    color: ["accentMode", "accent"],
    player: ["playerGlass", "rounded", "glow", "volumeWheel", "thumbStyle", "thumbRainbow", "uiMotion", "fullscreenFx", "trackToast", "notifyTrack", "taskbarTitle", "taskbarProgress"],
    look: ["fontHeadings", "logoWindowIcon", "hideKids", "hidePodcasts"],
    discord: ["discordRpc", "discordShow", "discordLine1", "discordLine2", "discordArtistIcon", "discordArtistButton", "discordAlbumInfo", "discordOnPause", "discordPauseHide"]
  };
  const SWATCHES = ["#ffffff", "#d4d4d4", "#a3a3a3", "#737373", "#404040", "#000000", "#ff5c4d", "#ff2d95", "#b44dff", "#5c7cff", "#2dd4ff", "#2dffa8", "#ffd23f"];
  const CHANGES = [
    ["vis", "Новая волна", "Семь режимов на видеокарте: многослойная волна, сияние, кольца, звёзды, осциллограф. Цвета берутся с обложки и плавно перетекают."],
    ["look", "Весь интерфейс в движении", "Меню, окна, смена страниц, лайк, кнопки плеера и смена трека теперь анимированы."],
    ["discord", "Discord как у больших", "Обложка в высоком качестве, фото артиста, год и жанр альбома, рабочие ссылки на трек и артиста, настройка строк и предпросмотр."],
    ["player", "Плеер на весь экран", "Фон из обложки, волна вокруг неё, обложка наклоняется за мышью и живёт в такт."],
    ["sound", "Новые возможности звука", "Профили, бас, баланс, своя скорость и выравнивание громкости по данным самого трека."],
    ["more", "Настройки под защитой", "Автокопии, восстановление, отмена по Ctrl+Z, быстрые команды по Ctrl+K и глобальные клавиши."]
  ];

  // ── Панель ──────────────────────────────────────────────────────────────────
  const ui = {
    host: null, shadow: null, panel: null, body: null, handle: null, toasts: null, open: false, tab: "vis", binds: [], query: "", overlay: null, topEl: null,
    mount() {
      this.host = h("div", { id: "ymmod-host" });
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.shadow.append(h("style", {}, "__YMMOD_CSS:panel.css__".replace("__PANEL_LOGO__", LOGO)));
      this.handle = h("button", { class: "handle", title: "Настройки (Ctrl+Shift+Y)", "aria-label": "Открыть настройки мода", onclick: () => this.toggle(), html: ICONS.more });
      this.panel = h("div", { class: "panel", role: "dialog", "aria-label": "Настройки YMusicMod", "aria-modal": "false" });
      this.toasts = h("div", { class: "toasts", "aria-live": "polite" });
      this.nowEl = h("div", { class: "now", "aria-hidden": "true" });
      this.scrim = h("div", { class: "scrim" });
      this.scrim.addEventListener("pointerdown", (e) => {
        if (e.target === this.scrim) {
          if (cmdk.open) cmdk.toggle(false);
          else this.closeOverlay();
        }
      });
      this.shadow.append(this.handle, this.panel, this.toasts, this.nowEl, this.scrim);
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
      else this.setQuery("", true);
    },
    go(tab) {
      if (!this.open) this.toggle(true);
      this.query = "";
      const order = TABS.map((t) => t[0]);
      this.dir = order.indexOf(tab) >= order.indexOf(this.tab) ? 1 : -1;
      this.tab = tab;
      this.render();
      if (this.body) this.body.scrollTop = 0;
    },
    setButtonHidden(hidden) {
      if (this.handle) this.handle.classList.toggle("hidden", hidden && !this.open);
      this.host && this.host.classList.toggle("reduced", Boolean(cfg && cfg.reducedMotion));
    },
    setQuery(q, silent) {
      this.query = q;
      if (silent || !this.open) return;
      if (this.searchEl && this.searchEl.value !== q) this.searchEl.value = q;
      this.renderBody();
    },
    render() {
      if (!this.panel || !cfg || !this.open) return;
      const meta = TABS.find((t) => t[0] === this.tab);
      const idx = TABS.indexOf(meta);
      this.searchEl = h("input", { type: "search", placeholder: "Поиск", "aria-label": "Поиск настроек", value: this.query, spellcheck: "false" });
      this.searchEl.addEventListener("input", () => this.setQuery(this.searchEl.value));
      const brand = h("div", { class: "brand", title: `YMusicMod ${state.modVersion}` });
      if (state.logoUrl && cfg.logoMode === "custom") brand.style.backgroundImage = `url("${state.logoUrl}")`;
      this.topEl = h("div", { class: "top" },
        h("div", { class: "top-t" }, h("h2", {}, meta[1] === "Статы" ? "Статистика" : meta[1]), h("p", {}, meta[2])),
        h("label", { class: "search", html: ICONS.search }, this.searchEl),
        h("button", { class: "icon-btn", title: "Отменить последнее (Ctrl+Z)", "aria-label": "Отменить", onclick: () => history.undo(), html: ICONS.undo }),
        h("button", { class: "icon-btn", title: "Закрыть (Esc)", "aria-label": "Закрыть", onclick: () => this.toggle(false), html: ICONS.close }));
      this.body = h("div", { class: "body" });
      this.body.addEventListener("scroll", () => this.topEl.classList.toggle("scrolled", this.body.scrollTop > 4), { passive: true });
      const nav = h("div", { class: "nav-wrap", role: "tablist", "aria-orientation": "vertical", style: `--i:${idx}` }, h("div", { class: "ind" }),
        TABS.map(([id, label]) => h("button", { class: `tab${this.tab === id ? " on" : ""}`, role: "tab", "aria-selected": String(this.tab === id), title: TABS.find((t) => t[0] === id)[2], onclick: () => this.switchTab(id), html: `${ICONS[id]}<span>${label}</span>` })));
      this.navEl = nav;
      this.panel.replaceChildren(h("div", { class: "rail" }, brand, nav), h("div", { class: "main" }, this.topEl, this.body));
      this.renderBody();
      this.refreshStatus();
    },
    // Вкладки переключаются без пересборки панели, чтобы полоска успела проехать к новому пункту.
    switchTab(id) {
      if (id === this.tab && !this.query) return;
      const order = TABS.map((t) => t[0]);
      this.dir = order.indexOf(id) >= order.indexOf(this.tab) ? 1 : -1;
      this.tab = id;
      this.query = "";
      if (this.searchEl) this.searchEl.value = "";
      this.navEl.style.setProperty("--i", order.indexOf(id));
      this.navEl.querySelectorAll(".tab").forEach((b, i) => {
        const on = order[i] === id;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", String(on));
      });
      const meta = TABS.find((t) => t[0] === id);
      this.topEl.querySelector("h2").textContent = meta[1] === "Статы" ? "Статистика" : meta[1];
      this.topEl.querySelector("p").textContent = meta[2];
      this.renderBody();
      this.body.scrollTop = 0;
      this.refreshStatus();
    },
    renderBody() {
      this.binds = [];
      const page = h("div", { class: "page", style: `--dir:${this.dir || 1}` });
      const nodes = this.query ? this.searchResults(this.query) : this[`tab_${this.tab}`]();
      nodes.flat().filter(Boolean).forEach((n, i) => {
        if (n.style) n.style.setProperty("--n", i);
        page.append(n);
      });
      if (!this.query && TAB_KEYS[this.tab]) {
        const reset = this.resetButton(TAB_KEYS[this.tab]);
        reset.style.setProperty("--n", page.children.length);
        page.append(reset);
      }
      this.body.replaceChildren(page);
      this.refreshStatus();
    },
    resetButton(keys) {
      return h("div", { class: "foot" }, h("button", { class: "btn", style: "background:transparent;color:inherit;font-weight:500", onclick: () => {
        const patch = {};
        for (const k of keys) if (state.defaults && k in state.defaults) patch[k] = state.defaults[k];
        setOpt(patch);
        this.renderBody();
        toast("Раздел сброшен", { action: { label: "Отменить", run: () => history.undo() } });
      } }, "Сбросить этот раздел"));
    },
    searchResults(q) {
      const needle = q.trim().toLowerCase();
      const out = [];
      for (const [id, label] of TABS) {
        if (id === "stats" || id === "look") continue;
        const hits = [];
        const holder = h("div", {}, this[`tab_${id}`]().flat().filter(Boolean));
        holder.querySelectorAll("[data-q]").forEach((el) => {
          if (el.dataset.q.toLowerCase().includes(needle)) hits.push(el);
        });
        if (hits.length) out.push(h("div", {}, h("div", { class: "sec-t" }, label), h("div", { class: "card" }, hits)));
      }
      const lookMatches = [["Шрифт приложения", "шрифт font"], ["Логотип", "логотип logo иконка"], ["Скрыть разделы меню", "меню детям подкасты книги"]].filter((m) => (m[0] + m[1]).toLowerCase().includes(needle));
      if (lookMatches.length) out.push(h("div", {}, h("div", { class: "sec-t" }, "Вид"), h("div", { class: "card" }, lookMatches.map(([n]) => h("div", { class: "row click", onclick: () => this.go("look") }, h("div", { class: "lbl" }, n), h("span", { class: "val" }, "Открыть ›"))))));
      if (/статист|топ|слушал/.test(needle)) out.push(h("div", {}, h("div", { class: "card" }, h("div", { class: "row click", onclick: () => this.go("stats") }, h("div", { class: "lbl" }, "Статистика прослушиваний"), h("span", { class: "val" }, "Открыть ›")))));
      return out.length ? out : [h("div", { class: "empty" }, `Ничего не нашлось по запросу «${q}»`)];
    },
    sync() {
      if (!this.open) return;
      for (const fn of this.binds) fn();
    },
    refreshStatus() {
      if (!this.open || !this.shadow) return;
      const set = (name, st) => this.shadow.querySelectorAll(`[data-st=${name}]`).forEach((el) => this.setStatus(el, st));
      set("audio", audio.attached > 0 ? ["ok", "Звук захвачен"] : audio.needed() ? ["warn", "Ждём воспроизведения"] : ["", "Выключено"]);
      set("fx", sound.status());
      set("discord", this.discordStatus());
    },
    setStatus(el, [cls, text]) {
      el.className = `status ${cls}`;
      el.replaceChildren(h("i"), text);
    },
    discordStatus() {
      if (!cfg.discordRpc) return ["", "Выключено"];
      if (!cfg.discordClientId) return ["warn", "Нужен Application ID"];
      if (state.discord && state.discord.connected) return ["ok", state.discord.user ? `Подключено · ${state.discord.user}` : "Подключено"];
      return ["warn", (state.discord && state.discord.error) || "Подключение"];
    },

    // ── Элементы управления: обновляются на месте, панель не пересобирается ──
    range(key, label, min, max, unit = "", step = 1, fmt) {
      const show = (v) => (fmt ? fmt(v) : `${v}${unit}`);
      const val = h("span", { class: "val", title: "Двойной щелчок - значение по умолчанию" }, show(cfg[key]));
      const input = h("input", { type: "range", min, max, step, value: cfg[key], "aria-label": label });
      const paint = () => input.style.setProperty("--p", `${((input.value - min) / (max - min)) * 100}%`);
      paint();
      input.addEventListener("input", () => {
        paint();
        val.textContent = show(Number(input.value));
        setOpt({ [key]: Number(input.value) }, { silent: true });
      });
      val.addEventListener("dblclick", () => {
        if (!state.defaults || !(key in state.defaults)) return;
        setOpt({ [key]: state.defaults[key] });
      });
      // Пока тянешь ползунок, панель становится прозрачной: видно, как меняется приложение.
      const row = h("label", { class: "range", "data-q": label }, h("div", { class: "tp" }, h("span", { class: "lbl" }, label), val), input);
      input.addEventListener("pointerdown", () => {
        if (!cfg.panelPeek || !PEEK_KEYS.has(key)) return;
        const t = setTimeout(() => this.panel.classList.add("peek"), 140);
        const end = () => {
          clearTimeout(t);
          this.panel.classList.remove("peek");
          removeEventListener("pointerup", end, true);
          removeEventListener("pointercancel", end, true);
        };
        addEventListener("pointerup", end, true);
        addEventListener("pointercancel", end, true);
      });
      this.binds.push(() => {
        if (Number(input.value) === cfg[key]) return;
        input.value = cfg[key];
        paint();
        val.textContent = show(cfg[key]);
      });
      return row;
    },
    toggleRow(key, label, hint) {
      const sw = h("button", { class: "sw", type: "button", role: "switch", "aria-checked": String(Boolean(cfg[key])), "aria-label": label });
      const row = h("div", { class: "row click", "data-q": `${label} ${hint || ""}` }, h("div", {}, h("div", { class: "lbl" }, label), hint ? h("div", { class: "hint" }, hint) : null), sw);
      row.addEventListener("click", () => setOpt({ [key]: !cfg[key] }));
      this.binds.push(() => sw.setAttribute("aria-checked", String(Boolean(cfg[key]))));
      return row;
    },
    seg(key, options, onPick) {
      const th = h("div", { class: "th" });
      const btns = options.map(([v, l]) => h("button", { type: "button", onclick: () => (onPick ? onPick(v) : setOpt({ [key]: v })) }, l));
      const root_ = h("div", { class: "seg", role: "radiogroup", style: `--c:${options.length}` }, th, btns);
      const paint = () => {
        const i = options.findIndex(([v]) => v === cfg[key]);
        th.classList.toggle("none", i < 0);
        root_.style.setProperty("--i", Math.max(i, 0));
        btns.forEach((b, n) => b.classList.toggle("on", n === i));
      };
      paint();
      this.binds.push(paint);
      return root_;
    },
    // Блок появляется и исчезает с плавной высотой.
    when(test, build) {
      const inner = h("div", { class: "coll-in" });
      const el = h("div", { class: "coll" }, inner);
      let built = false;
      const update = () => {
        const on = Boolean(test());
        if (on && !built) {
          built = true;
          inner.append(...[build()].flat().filter(Boolean));
        }
        el.classList.toggle("on", on);
      };
      update();
      this.binds.push(update);
      return el;
    },
    // Фрагмент, который перестраивается, когда меняется его ключ.
    live(keyFn, build) {
      const el = h("div", {});
      let key = null;
      const update = () => {
        const k = keyFn();
        if (k === key) return;
        key = k;
        el.replaceChildren(...[build()].flat().filter(Boolean));
      };
      update();
      this.binds.push(update);
      return el;
    },
    card(...kids) {
      return h("div", { class: "card" }, ...kids);
    },
    sec(title, ...kids) {
      return h("section", { class: "sec" }, h("div", { class: "sec-t" }, title), ...kids);
    },
    note(text) {
      return h("div", { class: "note" }, text);
    },
    openOverlay(node) {
      this.overlay = node;
      this.scrim.replaceChildren(node);
      this.scrim.classList.add("on");
    },
    closeOverlay() {
      if (!this.overlay) return;
      if (this.overlay.onclose) this.overlay.onclose();
      this.overlay = null;
      this.scrim.classList.remove("on");
    },

    // ── Разделы ──
    tab_sound() {
      const timerBtn = (min, label) => {
        const b = h("button", { class: "btn", onclick: () => sleep.start(min) }, label);
        this.binds.push(() => b.classList.toggle("on", min === "track" ? sleep.trackEnd : Boolean(sleep.end && sleep.min === min)));
        return b;
      };
      return [
        this.sec("Качество", this.seg("sound", [["off", "Как в Яндексе"], ["studio", "Студийное ✦"]], (v) => (v === "studio" ? quality.pick() : setOpt({ sound: "off" }))),
          this.live(() => cfg.sound, () => this.note(cfg.sound === "studio"
            ? "Lossless и обработка: чистый бас, воздух на верхах, широкая сцена, мягкий лимитер без перегруза."
            : "Пункт «Студийное ✦» есть и в «Настройках звука» самого Яндекса.")),
          h("div", { class: "card sub" }, h("div", { class: "row" }, h("div", { class: "lbl" }, "Состояние"), h("span", { class: "status", "data-st": "fx" })))),
        this.when(() => cfg.sound === "studio", () => this.sec("Студийная обработка",
          this.seg("soundProfile", [["balanced", "Баланс"], ["warm", "Тепло"], ["club", "Клуб"], ["vocal", "Вокал"], ["night", "Ночь"]]),
          h("div", { class: "card sub" },
            this.range("studioAmount", "Сила обработки", 0, 100, "%"),
            this.range("studioWidth", "Ширина сцены", 0, 100, "%"),
            this.range("studioAmbience", "Атмосфера зала", 0, 100, "%")))),
        this.sec("Тон и громкость", this.card(
          this.range("studioBass", "Бас", -6, 9, " дБ", 0.5, (v) => `${v > 0 ? "+" : ""}${v} дБ`),
          this.range("balance", "Баланс лево / право", -100, 100, "", 1, (v) => (v === 0 ? "центр" : v < 0 ? `левее ${-v}` : `правее ${v}`)),
          this.toggleRow("loudnessNorm", "Выравнивание по треку", "Подстраивает уровень по данным о громкости трека, без сжатия звука"),
          this.toggleRow("leveler", "Ровная громкость", "Компрессор: тихое громче, громкое тише"))),
        this.sec("Режим прослушивания", this.seg("playMode", [["normal", "Обычный"], ["slowed", "Slowed"], ["nightcore", "Nightcore"], ["8d", "8D"]]),
          this.live(() => cfg.playMode, () => this.note({ normal: "Трек звучит как есть.", slowed: "Медленнее и ниже, с реверберацией.", nightcore: "Быстрее и выше.", "8d": "Звук плавно ходит вокруг головы. Лучше в наушниках." }[cfg.playMode])),
          this.when(() => cfg.playMode === "normal", () => h("div", { class: "card sub" },
            this.range("playRate", "Скорость", 50, 200, "%", 5, (v) => `${(v / 100).toFixed(2).replace(/0$/, "").replace(".", ",")}×`),
            this.toggleRow("preservePitch", "Сохранять высоту", "Голос не становится ниже или выше при смене скорости")))),
        this.sec("Таймер сна",
          h("div", { class: "timer" }, timerBtn(15, "15 мин"), timerBtn(30, "30 мин"), timerBtn(45, "45 мин"), timerBtn(60, "1 час"), timerBtn(90, "1,5 часа"), timerBtn("track", "Конец трека")),
          h("div", { class: "card sub" }, h("div", { class: "row" }, h("div", { class: "lbl" }, "Таймер"), h("span", { class: "val", "data-st": "sleep" }, sleep.label())),
            this.when(() => sleep.on, () => h("div", { style: "padding:10px 0" }, h("button", { class: "btn", style: "width:100%", onclick: () => sleep.cancel(false) }, "Отменить")))),
          this.note("За 20 секунд до конца музыка плавно затихает."))
      ];
    },
    tab_vis() {
      const modes = h("div", { class: "modes" }, VIS_MODES.map(([id, label, icon]) => {
        const b = h("button", { class: "mode", type: "button", onclick: () => setOpt({ visualizer: id }), html: `<svg viewBox="0 0 36 22" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${icon}</svg><span>${label}</span>` });
        this.binds.push(() => b.classList.toggle("on", cfg.visualizer === id));
        b.classList.toggle("on", cfg.visualizer === id);
        return b;
      }));
      const c1 = h("input", { type: "color", class: "picker", value: cfg.visColor1, "aria-label": "Первый цвет" });
      const c2 = h("input", { type: "color", class: "picker", value: cfg.visColor2, "aria-label": "Второй цвет" });
      c1.addEventListener("input", () => setOpt({ visColor1: c1.value }, { silent: true }));
      c2.addEventListener("input", () => setOpt({ visColor2: c2.value }, { silent: true }));
      const fsModes = VIS_MODES.filter((m) => m[0] !== "off" && ["rings", "wave", "aurora", "stars"].includes(m[0])).map((m) => [m[0], m[1]]);
      const stat = h("span", { class: "val" }, "—");
      const statTimer = setInterval(() => {
        if (!stat.isConnected) return clearInterval(statTimer);
        stat.textContent = `${vis.fps || 0} к/с · ${Math.round(vis.scale * 100)}% разрешения${beat.bpm ? ` · ~${Math.round(beat.bpm)} BPM` : ""}`;
      }, 500);
      return [
        this.sec("Режим", modes),
        this.when(() => cfg.visualizer !== "off", () => [
          this.sec("Где показывать", this.seg("visPlace", [["bar", "Над плеером"], ["full", "На весь фон"]], (v) => setOpt({ visPlace: v })),
            this.note("«На весь фон» рисует волну за интерфейсом. Лучше всего выглядит с прозрачными панелями.")),
          this.sec("Цвета", this.seg("visColor", [["cover", "С обложки"], ["accent", "Акцент"], ["rainbow", "Радуга"], ["custom", "Свои"]]),
            this.when(() => cfg.visColor === "custom", () => h("div", { class: "card sub" }, h("div", { class: "row" }, h("div", { class: "lbl" }, "Два цвета"), h("div", { style: "display:flex;gap:8px" }, c1, c2))))),
          this.sec("Настройка", this.card(
            this.range("visualizerOpacity", "Яркость", 10, 100, "%"),
            this.when(() => cfg.visPlace === "bar", () => this.range("visHeight", "Высота", 48, 280, " px")),
            this.range("visGlow", "Свечение", 0, 100, "%"),
            this.range("visSens", "Чувствительность", 0, 100, "%"),
            this.range("visSmooth", "Плавность", 0, 100, "%"),
            this.toggleRow("visSym", "Симметрия", "Бас в центре, верхи расходятся к краям"))),
          this.sec("Частота кадров", this.seg("visFps", [[30, "30"], [60, "60"], [120, "120"]]),
            h("div", { class: "card sub" }, h("div", { class: "row" }, h("div", { class: "lbl" }, "Сейчас"), stat)),
            this.note("Если видеокарта не успевает, мод сам снижает разрешение волны, а плавность сохраняет."))
        ]),
        this.sec("Плеер на весь экран", this.card(this.toggleRow("fullscreenFx", "Живой полноэкранный плеер", "Фон из обложки и волна вокруг неё. Открывается по Ctrl+Shift+F")),
          this.when(() => cfg.fullscreenFx, () => h("div", { class: "sub" }, this.seg("visFsMode", fsModes)))),
        this.sec("Пульс под бит", this.card(
          this.toggleRow("beatSync", "Пульс обложки и свечения", "Определяет удары прямо из звука"),
          this.range("beatIntensity", "Сила", 0, 100, "%"),
          this.toggleRow("bgPulse", "Фон тоже качается"))),
        this.sec("Анализатор", this.card(h("div", { class: "row" }, h("div", { class: "lbl" }, "Звук"), h("span", { class: "status", "data-st": "audio" }))))
      ];
    },
    tab_look() {
      const list = h("div", { class: "flist" });
      const preview = h("div", { class: "fprev" }, h("div", { class: "big" }, "Моя волна"), h("div", { class: "small" }, "Съешь же ещё этих мягких французских булок · 0123456789"));
      preview.style.fontFamily = cfg.fontFamily ? `"${cfg.fontFamily}",system-ui` : `"YS Text",system-ui`;
      let cat = this.fontCat || "all";
      const rows = [];
      const mark = () => rows.forEach((r) => r.el.classList.toggle("on", r.family === cfg.fontFamily && r.source === cfg.fontSource));
      const pick = (r) => {
        setOpt({ fontFamily: r.family, fontSource: r.source, fontFile: r.file || null }, { silent: true });
        preview.style.fontFamily = `"${r.family}",system-ui`;
        if (r.source === "google") font.preview(r.family);
        mark();
      };
      const addRow = (r) => {
        r.el = h("div", { class: "frow", title: r.family, onclick: () => pick(r) },
          h("span", { class: "fn", style: `font-family:"${r.family}",system-ui` }, r.family),
          h("span", { class: "ft" }, r.tag),
          r.source === "file" ? h("button", { class: "fdel", title: "Удалить шрифт", onclick: async (e) => {
            e.stopPropagation();
            replaceState(await api.removeFont(r.file));
          } }, "✕") : null);
        rows.push(r);
        list.append(r.el);
      };
      const TAG = { sans: "гротеск", serif: "засечки", display: "акцент", hand: "рукопись", mono: "моно" };
      (state.fonts || []).forEach((f) => {
        if (!document.querySelector(`style[data-ymm-font="${f.file}"]`)) document.head.append(h("style", { "data-ymm-font": f.file }, `@font-face{font-family:"${f.name}";src:url("${f.url}");}`));
        addRow({ family: f.name, source: "file", file: f.file, cat: "file", tag: "мой" });
      });
      GOOGLE_FONTS.forEach(([name, c]) => addRow({ family: name, source: "google", cat: c, tag: TAG[c] }));
      const io = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const r = rows.find((x) => x.el === en.target);
        if (r && r.source === "google") font.preview(r.family);
        io.unobserve(en.target);
      }), { root: list, rootMargin: "120px" });
      rows.forEach((r) => r.source === "google" && io.observe(r.el));
      const search = h("input", { class: "inp", placeholder: "Поиск шрифта", value: this.fontQuery || "" });
      const empty = h("div", { class: "empty", style: "display:none" }, "Ничего не нашлось");
      const filter = () => {
        const q = search.value.trim().toLowerCase();
        this.fontQuery = search.value;
        let shown = 0;
        rows.forEach((r) => {
          const ok = (cat === "all" || r.cat === cat) && (!q || r.family.toLowerCase().includes(q));
          r.el.style.display = ok ? "" : "none";
          if (ok) shown++;
        });
        empty.style.display = shown ? "none" : "";
      };
      list.append(empty);
      search.addEventListener("input", filter);
      const chips = h("div", { class: "chips" }, FONT_CATS.map(([id, label]) => h("button", { class: `chip${cat === id ? " on" : ""}`, onclick: (e) => {
        cat = this.fontCat = id;
        chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === e.currentTarget));
        filter();
      } }, label)));
      font.systemList().then((names) => {
        names.forEach((n) => addRow({ family: n, source: "system", cat: "system", tag: "windows" }));
        list.append(empty);
        mark();
        filter();
      });
      mark();
      filter();
      const logoText = h("input", { class: "inp", placeholder: "Подпись рядом с логотипом", value: cfg.logoText, maxlength: 24 });
      logoText.addEventListener("input", () => setOpt({ logoText: logoText.value }, { silent: true }));
      return [
        this.sec("Шрифт приложения", preview,
          h("div", { class: "fsearch" }, search, h("button", { class: "btn", title: "Вернуть шрифт Яндекса", onclick: () => {
            setOpt({ fontFamily: "", fontSource: "", fontFile: null });
            preview.style.fontFamily = `"YS Text",system-ui`;
            mark();
          } }, "Сброс")),
          chips, list,
          h("div", { class: "btns", style: "margin-top:10px" }, h("button", { class: "btn", onclick: async () => replaceState(await api.addFont()) }, "＋ Свой шрифт (.ttf, .otf, .woff2)")),
          h("div", { class: "card sub" }, this.toggleRow("fontHeadings", "Заголовки тоже", "Иначе крупные заголовки останутся фирменным шрифтом Яндекса"))),
        this.sec("Логотип", this.seg("logoMode", [["original", "Яндекса"], ["mod", "YMusicMod"], ["custom", "Своя картинка"]]),
          h("div", { class: "card sub" },
            this.live(() => `${cfg.logoMode}|${state.logoUrl}`, () => h("div", { class: "logoprev" }, cfg.logoMode === "original" ? h("span", { class: "hint" }, "Стандартный логотип Яндекс Музыки") : h("img", { src: cfg.logoMode === "custom" && state.logoUrl ? state.logoUrl : LOGO, alt: "" }), cfg.logoMode !== "original" ? h("b", {}, cfg.logoText) : null)),
            this.when(() => cfg.logoMode !== "original", () => h("div", { style: "padding:10px 0" }, logoText)),
            this.when(() => cfg.logoMode === "custom", () => h("div", { class: "btns", style: "padding:10px 0" }, h("button", { class: "btn", onclick: async () => replaceState(await api.setLogo()) }, state.logoUrl ? "Сменить картинку" : "Выбрать картинку"))),
            this.toggleRow("logoWindowIcon", "Иконка окна тоже", "Иконка в панели задач Windows"))),
        this.sec("Разделы меню", this.card(
          this.toggleRow("hideKids", "Скрыть «Детям»"),
          this.toggleRow("hidePodcasts", "Скрыть «Книги и подкасты»")),
          this.note("Пункты просто убираются из меню, всё можно вернуть."))
      ];
    },
    tab_stats() {
      const box = h("div", { class: "page", style: "gap:22px" }, h("div", { class: "empty" }, "Загружаю"));
      api.statsGet().then((st) => box.replaceChildren(...this.statsView(st))).catch(() => box.replaceChildren(h("div", { class: "empty" }, "Не удалось загрузить")));
      return [box];
    },
    statsView(st) {
      const days = st.days || {};
      const now = new Date();
      const today = days[dayKey(now)] || 0;
      let week = 0, month = 0;
      const last30 = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const v = days[dayKey(d)] || 0;
        if (i < 7) week += v;
        month += v;
        last30.push({ d, v });
      }
      const total = Object.values(days).reduce((a, b) => a + b, 0);
      if (!total) return [h("div", { class: "empty" }, "Пока пусто. Включи музыку, и статистика начнёт копиться сама. Всё хранится только на этом компьютере.")];
      let streak = 0;
      for (let i = 0; i < 3650; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        if ((days[dayKey(d)] || 0) >= 60) streak++;
        else if (i > 0) break;
      }
      const activeDays = Object.values(days).filter((v) => v >= 60).length;
      const max = Math.max(...last30.map((x) => x.v), 1);
      const hours = st.hours || {};
      const hMax = Math.max(...Array.from({ length: 24 }, (_, i) => hours[i] || 0), 1);
      const peak = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
      const wdSum = new Array(7).fill(0), wdCnt = new Array(7).fill(0);
      for (const [k, v] of Object.entries(days)) {
        const [y, m, d] = k.split("-").map(Number);
        const wd = new Date(y, m - 1, d).getDay();
        wdSum[wd] += v;
        wdCnt[wd]++;
      }
      const wdAvg = wdSum.map((v, i) => (wdCnt[i] ? v / wdCnt[i] : 0));
      const wdMax = Math.max(...wdAvg, 1);
      const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
      const artists = Object.entries(st.artists || {}).sort((a, b) => b[1].sec - a[1].sec).slice(0, 10);
      const tracks = Object.values(st.tracks || {}).sort((a, b) => b.sec - a.sec).slice(0, 10);
      const aMax = artists.length ? artists[0][1].sec : 1;
      const plays = Object.values(st.tracks || {}).reduce((a, t) => a + (t.plays || 0), 0);
      const open = (q) => {
        this.toggle(false);
        const url = `/search?text=${encodeURIComponent(q)}`;
        // Обычный переход перезагрузил бы страницу и остановил музыку.
        const router = window.next && window.next.router;
        if (router && router.push) router.push(url);
        else window.history.pushState(null, "", url), window.dispatchEvent(new PopStateEvent("popstate"));
      };
      const csv = () => {
        const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
        const rows = [["Артист", "Трек", "Прослушиваний", "Секунд"].map(esc).join(";")];
        for (const t of Object.values(st.tracks || {}).sort((a, b) => b.sec - a.sec)) rows.push([esc(t.artist), esc(t.title), t.plays || 0, t.sec].join(";"));
        return rows.join("\r\n");
      };
      let confirmReset = false;
      return [
        this.sec("Время в музыке", h("div", { class: "kpis" },
          h("div", { class: "kpi" }, h("b", {}, fmtDur(today)), h("span", {}, "сегодня")),
          h("div", { class: "kpi" }, h("b", {}, fmtDur(week)), h("span", {}, "за 7 дней")),
          h("div", { class: "kpi" }, h("b", {}, fmtDur(month)), h("span", {}, "за 30 дней")),
          h("div", { class: "kpi" }, h("b", {}, fmtDur(total)), h("span", {}, "всего")),
          h("div", { class: "kpi" }, h("b", {}, `${streak} ${streak ? "🔥" : ""}`), h("span", {}, "дней подряд")),
          h("div", { class: "kpi" }, h("b", {}, plays.toLocaleString("ru-RU")), h("span", {}, "запусков треков")))),
        this.sec("Последние 30 дней", this.card(h("div", { class: "days" }, last30.map((x, i) => h("div", { class: i === 29 ? "today" : "", title: `${x.d.toLocaleDateString("ru-RU")}: ${fmtDur(x.v)}` },
          h("i", { style: `height:${Math.max(2, (x.v / max) * 86)}px;--n:${i}` }), h("small", {}, i % 5 === 4 ? x.d.getDate() : "")))))),
        this.sec("Когда слушаешь", this.card(
          h("div", { class: "heat" }, Array.from({ length: 24 }, (_, i) => h("i", { title: `${i}:00: ${fmtDur(hours[i] || 0)}`, style: `opacity:${0.08 + ((hours[i] || 0) / hMax) * 0.92}` }))),
          h("div", { class: "heat-l", style: "border:0" }, h("span", {}, "0:00"), h("span", {}, "6:00"), h("span", {}, "12:00"), h("span", {}, "18:00"), h("span", {}, "23:00")),
          h("div", { class: "wk" }, [1, 2, 3, 4, 5, 6, 0].map((i) => h("div", { title: `В среднем ${fmtDur(wdAvg[i])}` }, h("i", { style: `--v:${(wdAvg[i] / wdMax) * 100}%` }), WD[i]))),
          peak ? h("div", { class: "row" }, h("div", { class: "lbl" }, "Любимое время"), h("span", { class: "val" }, `${peak[0]}:00–${(Number(peak[0]) + 1) % 24}:00`)) : null,
          h("div", { class: "row" }, h("div", { class: "lbl" }, "В среднем за активный день"), h("span", { class: "val" }, fmtDur(total / Math.max(1, activeDays)))))),
        this.sec("Топ артистов", this.card(h("div", { class: "toplist" }, artists.map(([name, a], i) => h("div", { class: "it noimg", title: `Найти: ${name}`, onclick: () => open(name) },
          h("span", { class: "n" }, i + 1),
          h("div", { class: "t" }, h("b", {}, name), h("div", { class: "bar", style: `width:${(a.sec / aMax) * 100}%` })),
          h("span", { class: "v" }, fmtDur(a.sec))))))),
        this.sec("Топ треков", this.card(h("div", { class: "toplist" }, tracks.map((t, i) => h("div", { class: "it", title: `Найти: ${t.title}`, onclick: () => open(`${t.artist} ${t.title}`) },
          h("span", { class: "n" }, i + 1),
          t.cover ? h("img", { src: t.cover, loading: "lazy", alt: "" }) : h("img", { alt: "" }),
          h("div", { class: "t" }, h("b", {}, t.title), h("span", {}, t.artist)),
          h("span", { class: "v" }, `${t.plays || 1}× · ${fmtDur(t.sec)}`)))))),
        h("div", { class: "btns" },
          h("button", { class: "btn", onclick: async () => {
            if (await api.exportStats(csv())) toast("Статистика сохранена");
          } }, "Экспорт в CSV"),
          h("button", { class: "btn danger", onclick: async (e) => {
            if (!confirmReset) {
              confirmReset = true;
              e.currentTarget.textContent = "Точно? Нажми ещё раз";
              return;
            }
            await api.statsReset();
            this.renderBody();
          } }, "Сбросить статистику"))
      ];
    },
    tab_bg() {
      const gallery = this.live(() => `${state.files.map((f) => f.name).join()}|${cfg.backgroundFile}|${cfg.bgMode}|${cfg.dayFile}|${cfg.nightFile}`, () => {
        const dn = cfg.bgMode === "daynight";
        return h("div", { class: "gallery" },
          state.files.map((f) => {
            const on = dn ? f.name === bg.currentName : f.name === cfg.backgroundFile && cfg.bgMode !== "cover";
            const media = f.kind === "video" ? h("video", { src: f.url, muted: true, preload: "metadata" }) : h("img", { src: f.url, loading: "lazy", decoding: "async", alt: "" });
            if (f.kind === "video") {
              media.muted = true;
              media.addEventListener("mouseenter", () => media.play().catch(() => {}));
              media.addEventListener("mouseleave", () => media.pause());
            }
            const t = h("div", { class: `thumb${on ? " on" : ""}`, title: f.name, onclick: () => setOpt({ backgroundFile: f.name, bgMode: cfg.bgMode === "daynight" || cfg.bgMode === "cover" ? "single" : cfg.bgMode }) },
              media,
              h("span", { class: "badge" }, f.kind === "video" ? "ВИДЕО" : f.name.split(".").pop().toUpperCase()),
              h("button", { class: "del", title: "Удалить", "aria-label": "Удалить фон", onclick: async (e) => {
                e.stopPropagation();
                replaceState(await api.removeBackground(f.name));
                toast("Фон удалён");
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
          h("button", { class: "thumb add", title: "Добавить фото, GIF или видео", onclick: async () => replaceState(await api.addBackgrounds()) }, "+", h("small", {}, "фото или видео")));
      });
      return [
        this.sec("Режим", this.seg("bgMode", [["single", "Один"], ["slideshow", "Слайдшоу"], ["daynight", "День и ночь"], ["cover", "Из обложки"]]),
          this.when(() => cfg.bgMode === "slideshow", () => h("div", { class: "card sub" }, this.range("slideInterval", "Смена каждые", 1, 120, " мин"))),
          this.when(() => cfg.bgMode === "daynight", () => h("div", { class: "card sub" },
            h("div", { class: "hint", style: "padding:11px 0 0" }, "Отметь в галерее ☀ дневной и ☾ ночной фон"),
            this.range("dayStartHour", "День с", 0, 23, ":00"),
            this.range("nightStartHour", "Ночь с", 0, 23, ":00"))),
          this.when(() => cfg.bgMode === "cover", () => this.note("Фоном становится размытая обложка текущего трека и плавно меняется вместе с ним."))),
        this.sec("Галерея", gallery,
          h("div", { class: "btns", style: "margin-top:10px" },
            h("button", { class: "btn", onclick: () => setOpt({ backgroundFile: null, bgMode: "single" }) }, "Без фона"),
            h("button", { class: "btn", onclick: () => bg.next(1) }, "Следующий ›"))),
        this.sec("Картинка", this.card(
          this.range("blur", "Размытие", 0, 60, " px"),
          this.range("dim", "Затемнение", 0, 95, "%"),
          this.range("saturation", "Насыщенность", 0, 200, "%"),
          this.range("contentAlpha", "Плотность панелей", 0, 100, "%"))),
        this.sec("Моя волна", this.card(
          this.toggleRow("cleanVibe", "Чистая Волна", "Без портретов артистов, переливающейся анимации и кислотного градиента"),
          this.toggleRow("hideWaveArt", "Скрыть оформление трека", "Чтобы был виден ваш фон")))
      ];
    },
    tab_color() {
      const picker = h("input", { type: "color", class: "picker", value: cfg.accent, "aria-label": "Любой цвет" });
      const hex = h("input", { class: "inp hex", value: cfg.accent.toUpperCase(), maxlength: 7, spellcheck: "false", "aria-label": "Код цвета" });
      const remember = (c) => {
        const list = [c, ...(cfg.recentColors || []).filter((x) => x !== c)].slice(0, 8);
        setOpt({ recentColors: list }, { keepPreset: true, noHistory: true, silent: true });
      };
      picker.addEventListener("input", () => setOpt({ accent: picker.value, accentMode: "fixed" }, { silent: true }));
      picker.addEventListener("change", () => {
        remember(picker.value);
        this.sync();
      });
      hex.addEventListener("change", () => {
        const v = hex.value.trim().replace(/^([^#])/, "#$1").toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(v)) {
          setOpt({ accent: v, accentMode: "fixed" });
          remember(v);
        } else toast("Нужен код вида #FF5C4D");
      });
      const preview = h("div", { class: "preview" });
      const swatch = (c) => {
        const b = h("button", { class: "swatch", style: `background:${c}`, title: c.toUpperCase(), "aria-label": c, onclick: () => setOpt({ accent: c, accentMode: "fixed" }) });
        this.binds.push(() => b.classList.toggle("on", cfg.accentMode === "fixed" && cfg.accent === c));
        b.classList.toggle("on", cfg.accentMode === "fixed" && cfg.accent === c);
        return b;
      };
      const paint = () => {
        preview.textContent = cfg.accentMode === "cover" ? "Цвет текущей обложки" : cfg.accentMode === "fixed" ? cfg.accent.toUpperCase() : "Стандартный цвет Яндекса";
        if (picker.value !== cfg.accent) picker.value = cfg.accent;
        if (document.activeElement !== hex && this.shadow.activeElement !== hex) hex.value = cfg.accent.toUpperCase();
      };
      paint();
      this.binds.push(paint);
      return [
        this.sec("Откуда брать цвет", this.seg("accentMode", [["off", "Стандарт"], ["fixed", "Свой"], ["cover", "Из обложки"]]), h("div", { class: "sub" }, preview)),
        this.sec("Палитра", this.card(
          h("div", { class: "swatches" }, SWATCHES.map(swatch)),
          h("div", { class: "row" }, h("div", { class: "lbl" }, "Любой цвет"), h("div", { style: "display:flex;gap:8px;align-items:center" }, hex, picker)))),
        this.live(() => (cfg.recentColors || []).join(), () => ((cfg.recentColors || []).length ? this.sec("Недавние", this.card(h("div", { class: "swatches" }, cfg.recentColors.map(swatch)))) : null)),
        this.note("В режиме «Из обложки» цвет плавно меняется с каждым треком, а выбранный здесь служит запасным.")
      ];
    },
    tab_player() {
      return [
        this.sec("Панель плеера", this.card(
          this.range("playerGlass", "Стекло (размытие под плеером)", 0, 40, " px"),
          this.toggleRow("rounded", "Скруглённые углы"),
          this.toggleRow("glow", "Свечение плеера", "Дышит в такт, когда включён пульс"),
          this.toggleRow("volumeWheel", "Громкость колёсиком", "Крути колесо мыши над значком громкости"))),
        this.sec("Ползунок прогресса", this.seg("thumbStyle", [["pinwheel", "Пропеллер"], ["orb", "Сфера"], ["default", "Обычный"]]),
          this.when(() => cfg.thumbStyle !== "default", () => h("div", { class: "card sub" }, this.toggleRow("thumbRainbow", "Радужный перелив")))),
        this.sec("Анимации", this.card(
          this.toggleRow("uiMotion", "Анимации интерфейса", "Меню, окна, смена страниц и трека, лайк, кнопки плеера"),
          this.toggleRow("splash", "Заставка при запуске", "Вместо пустого окна, пока приложение загружается"),
          this.toggleRow("panelPeek", "Прозрачная панель при настройке", "Пока тянешь ползунок внешнего вида, панель не мешает смотреть"),
          this.toggleRow("reducedMotion", "Меньше анимаций", "Выключает пульс, визуализатор, вращение, свечение и видео-фон"))),
        this.sec("Смена трека", this.card(
          this.toggleRow("trackToast", "Карточка трека в окне", "Появляется сверху на пару секунд"),
          this.toggleRow("notifyTrack", "Уведомление Windows", "Только когда окно не в фокусе"))),
        this.sec("Панель задач", this.card(
          this.toggleRow("taskbarTitle", "Название трека в заголовке окна", "Видно при наведении на значок в панели задач"),
          this.toggleRow("taskbarProgress", "Прогресс трека на значке"))),
        this.sec("Скорость работы", this.card(
          this.toggleRow("prefetchCovers", "Предзагрузка обложек", "Качает обложки списка заранее, при прокрутке они уже готовы"),
          this.toggleRow("scrollBoost", "Плавная прокрутка", "Пока листаешь, эффекты интерфейса не перерисовываются")))
      ];
    },
    tab_discord() {
      const idInp = h("input", { class: "inp", placeholder: "Application ID из Discord Developer Portal", value: cfg.discordClientId, inputmode: "numeric", "aria-label": "Application ID" });
      idInp.addEventListener("change", () => setOpt({ discordClientId: idInp.value.replace(/\D/g, "") }));
      const line = (key, ph) => {
        const inp = h("input", { class: "inp", value: cfg[key], placeholder: ph, maxlength: 80, spellcheck: "false" });
        inp.addEventListener("input", () => {
          setOpt({ [key]: inp.value }, { silent: true });
          preview.paint();
        });
        return inp;
      };
      const l1 = line("discordLine1", "{title}");
      const l2 = line("discordLine2", "{artist}");
      const preview = this.discordPreview();
      this.binds.push(preview.paint);
      const ticker = setInterval(() => {
        if (!preview.el.isConnected) return clearInterval(ticker);
        preview.paint();
      }, 1000);
      return [
        this.sec("Предпросмотр", preview.el, this.note("Примерно так статус видят другие. Кнопки свои Discord тебе не показывает, но для остальных они работают.")),
        this.sec("Статус", this.card(
          this.toggleRow("discordRpc", "Показывать в Discord"),
          h("div", { class: "row" }, h("div", { class: "lbl" }, "Состояние"), h("span", { class: "status", "data-st": "discord" })))),
        this.sec("В списке участников «Слушает…»", this.seg("discordShow", [["title", "Название"], ["artist", "Строка 2"], ["app", "Приложение"]]),
          this.note("Что написать рядом с твоим ником: название трека, вторую строку или имя приложения.")),
        this.sec("Строки", this.card(
          h("div", { style: "padding:11px 0" }, h("div", { class: "lbl", style: "margin-bottom:7px" }, "Первая"), l1),
          h("div", { style: "padding:11px 0" }, h("div", { class: "lbl", style: "margin-bottom:7px" }, "Вторая"), l2)),
          this.note("Подстановки: {title} {artist} {album} {year} {genre} {mode}. Например: {artist} · {year}")),
        this.sec("Детали", this.card(
          this.toggleRow("discordArtistIcon", "Фото артиста на обложке", "Маленький значок в углу. Если фото нет, покажем логотип"),
          this.toggleRow("discordArtistButton", "Кнопка артиста", "Вторая кнопка рядом с «Слушать трек»"),
          this.toggleRow("discordAlbumInfo", "Год и жанр в подсказке", "При наведении на обложку"))),
        this.sec("На паузе", this.seg("discordOnPause", [["show", "Показывать"], ["hide", "Скрывать"]]),
          this.when(() => cfg.discordOnPause === "hide", () => h("div", { class: "card sub" }, this.range("discordPauseHide", "Скрыть через", 1, 120, " мин")))),
        this.sec("Своё приложение", this.card(h("div", { style: "padding:12px 0" }, idInp)),
          this.note("Если статуса не видно: Discord → Настройки → Конфиденциальность активности → «Делиться активностью». Имя приложения задаётся в Developer Portal."))
      ];
    },
    discordPreview() {
      const cover = h("div", { class: "dc-c" });
      const small = h("div", { class: "dc-s" });
      cover.append(small);
      const b = h("b");
      const s1 = h("span");
      const s2 = h("span");
      const cur = h("span");
      const end = h("span");
      const fill = h("u");
      const prog = h("div", { class: "dc-p" }, cur, h("em", {}, fill), end);
      const btns = h("div", { class: "dc-b" });
      const head = h("div", { class: "dc-h" }, "Слушает");
      const el = h("div", { class: "dc" }, head, h("div", { class: "dc-m" }, cover, h("div", { class: "dc-t" }, b, s1, s2, prog)), btns);
      const paint = () => {
        const p = discord.payload();
        const fm = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
        const title = p ? p.title : "Название трека";
        const artist = p ? p.artist : "Артист";
        const album = p ? p.album : "Альбом";
        const fillT = (tpl) => String(tpl).replace(/\{(title|artist|album|year|genre|mode)\}/g, (_, k) => ({ title, artist, album, year: p && p.year ? p.year : "", genre: (p && p.genre) || "", mode: (p && p.mode) || "" })[k] || "").trim();
        const paused = p && p.paused;
        const rate = (p && p.rate) || 1;
        const name = cfg.discordShow === "title" ? fillT(cfg.discordLine1) || title : cfg.discordShow === "artist" ? fillT(cfg.discordLine2) || artist : "Яндекс Музыка";
        head.textContent = `Слушает ${name}`;
        b.textContent = fillT(cfg.discordLine1) || title;
        s1.textContent = paused ? `На паузе · ${fm((p.position || 0) / rate)} / ${fm((p.duration || 0) / rate)}` : `${fillT(cfg.discordLine2) || artist}${p && p.mode ? ` · ${p.mode}` : ""}`;
        s2.textContent = [album, cfg.discordAlbumInfo && p ? p.year : "", cfg.discordAlbumInfo && p ? p.genre : ""].filter(Boolean).join(" · ");
        cover.style.backgroundImage = p && p.cover ? `url("${p.cover}")` : "";
        const art = cfg.discordArtistIcon && p && p.artistCover && p.artistCover !== p.cover ? p.artistCover : "";
        small.style.backgroundImage = art ? `url("${art}")` : `url("${LOGO}")`;
        const dur = p && p.duration ? p.duration / rate : 0;
        const pos = p && p.position ? p.position / rate : 0;
        prog.style.display = paused || !dur ? "none" : "";
        cur.textContent = fm(pos);
        end.textContent = fm(dur);
        fill.style.width = dur ? `${(pos / dur) * 100}%` : "0";
        const labels = ["Слушать трек"];
        if (cfg.discordArtistButton) labels.push(`Артист: ${(p && p.artistName) || artist}`.slice(0, 32));
        if (btns.children.length !== labels.length || btns.textContent !== labels.join("")) btns.replaceChildren(...labels.map((l) => h("div", {}, l)));
      };
      paint();
      return { el, paint };
    },
    tab_presets() {
      const inp = h("input", { class: "inp", placeholder: "Название нового пресета", maxlength: 40 });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") presets.save(inp.value);
      });
      return [
        this.sec("Пресеты", h("div", { class: "plist" }, presets.all().map((p) => {
          const col = p.data.accentMode === "cover" ? "linear-gradient(135deg,#fff,#444)" : p.data.accent || "#fff";
          const tags = [VIS_LABEL[p.data.visualizer], p.data.beatSync ? "пульс" : null, p.data.blur > 15 ? "размытие" : null, p.data.accentMode === "cover" ? "из обложки" : null].filter(Boolean).slice(0, 3);
          return h("div", { class: `pcard${cfg.activePreset === p.name ? " on" : ""}`, role: "button", tabindex: "0", onclick: () => presets.apply(p.name), onkeydown: (e) => e.key === "Enter" && presets.apply(p.name) },
            h("div", { class: "glow", style: `background:${col}` }),
            h("div", { class: "n" }, p.name),
            h("div", { class: "k" }, p.builtin ? "Встроенный" : "Мой"),
            h("div", { class: "tags" }, tags.map((t) => h("span", {}, t))),
            p.builtin ? null : h("button", { class: "del", title: "Удалить", "aria-label": `Удалить ${p.name}`, onclick: (e) => {
              e.stopPropagation();
              presets.remove(p.name);
            } }, "✕"));
        })),
          h("div", { class: "save sub" }, inp, h("button", { class: "btn pri", onclick: () => presets.save(inp.value) }, "Сохранить текущий вид")),
          this.note("Ctrl+Shift+P включает следующий пресет по кругу.")),
        this.sec("Обмен", h("div", { class: "btns" },
          h("button", { class: "btn", onclick: async () => {
            if (await api.exportPresets()) toast("Пресеты сохранены в файл");
          } }, "Экспорт в файл"),
          h("button", { class: "btn", onclick: async () => {
            replaceState(await api.importPresets());
            toast("Пресеты импортированы");
          } }, "Импорт из файла")))
      ];
    },
    tab_more() {
      const backups = h("div", {}, h("div", { class: "empty" }, "Загружаю"));
      const loadBackups = async () => {
        const list = await api.backups();
        const reason = (n) => (/before-restore/.test(n) ? "перед восстановлением" : /before-import/.test(n) ? "перед импортом" : /before-/.test(n) ? "перед обновлением мода" : /manual/.test(n) ? "вручную" : "ежедневная");
        backups.replaceChildren(list.length ? h("div", { class: "card" }, list.slice(0, 6).map((b) => h("div", { class: "row" },
          h("div", {}, h("div", { class: "lbl" }, new Date(b.at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })), h("div", { class: "hint" }, reason(b.name))),
          h("button", { class: "btn", onclick: async () => {
            replaceState(await api.backupRestore(b.name));
            toast("Настройки восстановлены", { action: { label: "Отменить", run: async () => {
              const fresh = await api.backups();
              if (fresh[0]) replaceState(await api.backupRestore(fresh[0].name));
            } } });
          } }, "Вернуть")))) : h("div", { class: "empty" }, "Копий пока нет"));
      };
      loadBackups().catch(() => {});
      const keys = (rows) => h("div", { class: "keys" }, rows.flatMap(([k, label]) => [h("kbd", {}, k), h("span", {}, label)]));
      const diag = () => [
        `YMusicMod ${state.modVersion}`, `Яндекс Музыка ${state.appVersion}`, `Визуализатор: ${cfg.visualizer}, ${vis.gl ? "WebGL2" : "2D"}, ${vis.fps} к/с, разрешение ${Math.round(vis.scale * 100)}%`,
        `Видеокарта: ${vis.renderer || "неизвестно"}`, `Звук: ${audio.attached} источн., контекст ${audio.ctx ? audio.ctx.state : "нет"}`,
        `Обработка: ${window.__ymmFx ? window.__ymmFx.count : 0} цепоч.`, `Discord: ${state.discord && state.discord.connected ? "подключён" : (state.discord && state.discord.error) || "нет"}`
      ].join("\n");
      return [
        this.sec("Быстрый доступ", h("div", { class: "btns" },
          h("button", { class: "btn pri", onclick: () => cmdk.toggle(true) }, "Быстрые команды · Ctrl+K"),
          h("button", { class: "btn", onclick: () => mini.toggle() }, "Мини-плеер"))),
        this.sec("Клавиши в приложении", this.card(keys([...HOTKEYS.map(([k, label]) => [`Ctrl+Shift+${k}`, label]), ["Ctrl+K", "Быстрые команды"], ["Ctrl+Z", "Отменить изменение настроек"]]))),
        this.sec("Глобальные клавиши", this.card(this.toggleRow("globalKeys", "Работают из любого окна и в играх"),
          keys([["Ctrl+Alt+Space", "Пауза / играть"], ["Ctrl+Alt+→ / ←", "Следующий / предыдущий"], ["Ctrl+Alt+↑ / ↓", "Громкость"], ["Ctrl+Alt+L", "Нравится"]]))),
        this.sec("Мини-плеер", this.card(this.toggleRow("miniAutoHide", "Прятать в играх", "Скрывается, когда открыта полноэкранная игра или видео"),
          keys([["Ctrl+Alt+M", "Спрятать / показать (работает и в игре)"], ["Ctrl+Alt+G", "Режим «призрак»: полупрозрачный, клики проходят сквозь"]]))),
        this.sec("Резервные копии настроек", backups, h("div", { class: "btns sub" },
          h("button", { class: "btn", onclick: async () => {
            await api.backupNow();
            await loadBackups();
            toast("Копия создана");
          } }, "Сделать копию"),
          h("button", { class: "btn", onclick: async () => {
            if (await api.exportAll()) toast("Настройки сохранены в файл");
          } }, "Экспорт настроек"),
          h("button", { class: "btn", onclick: async () => {
            replaceState(await api.importAll());
            await loadBackups();
          } }, "Импорт настроек")),
          this.note("Копия делается сама раз в день и перед каждым обновлением мода. Хранятся 20 последних.")),
        this.sec("Интерфейс", this.card(this.toggleRow("hideButton", "Спрятать язычок слева", "Панель открывается по Ctrl+Shift+Y"))),
        this.sec("Диагностика", h("div", { class: "btns" },
          h("button", { class: "btn", onclick: async () => {
            try {
              await navigator.clipboard.writeText(diag());
              toast("Скопировано");
            } catch {
              toast("Буфер обмена недоступен");
            }
          } }, "Скопировать сведения"),
          h("button", { class: "btn", onclick: () => api.openFolder() }, "Папка мода"),
          h("button", { class: "btn", onclick: () => whatsNew.show() }, "Что нового"))),
        h("div", { class: "foot" }, `YMusicMod ${state.modVersion} · Яндекс Музыка ${state.appVersion}`)
      ];
    }
  };
  // Ползунки внешнего вида, у которых хочется видеть результат.
  const PEEK_KEYS = new Set(["blur", "dim", "saturation", "contentAlpha", "playerGlass", "visualizerOpacity", "visHeight", "visGlow", "visSens", "visSmooth", "beatIntensity"]);

  // ── Быстрые команды ─────────────────────────────────────────────────────────
  const cmdk = {
    open: false, sel: 0, items: [], list: null, input: null, el: null,
    commands() {
      const toggleCmd = (key, label) => ({ label: `${label}: ${cfg[key] ? "выключить" : "включить"}`, group: "Настройка", run: () => setOpt({ [key]: !cfg[key] }) });
      return [
        ...TABS.map(([id, label, desc]) => ({ label: `Открыть: ${label === "Статы" ? "Статистика" : label}`, hint: desc, group: "Раздел", run: () => ui.go(id) })),
        ...VIS_MODES.map(([id, label]) => ({ label: `Визуализатор: ${label}`, group: "Волна", run: () => setOpt({ visualizer: id }) })),
        { label: "Волна над плеером", group: "Волна", run: () => setOpt({ visPlace: "bar" }) },
        { label: "Волна на весь фон", group: "Волна", run: () => setOpt({ visPlace: "full" }) },
        ...presets.all().map((p) => ({ label: `Пресет: ${p.name}`, group: "Пресет", run: () => presets.apply(p.name) })),
        { label: "Следующий фон", group: "Фон", run: () => bg.next(1) },
        { label: "Фон из обложки", group: "Фон", run: () => setOpt({ bgMode: "cover" }) },
        { label: "Без фона", group: "Фон", run: () => setOpt({ backgroundFile: null, bgMode: "single" }) },
        ...["normal", "slowed", "nightcore", "8d"].map((m) => ({ label: `Режим: ${{ normal: "обычный", slowed: "Slowed", nightcore: "Nightcore", "8d": "8D" }[m]}`, group: "Звук", run: () => setOpt({ playMode: m }) })),
        { label: cfg.sound === "studio" ? "Выключить студийное звучание" : "Включить студийное звучание", group: "Звук", run: () => (cfg.sound === "studio" ? setOpt({ sound: "off" }) : quality.pick()) },
        { label: "Таймер сна: 30 минут", group: "Звук", run: () => sleep.start(30) },
        { label: "Пауза после этого трека", group: "Звук", run: () => sleep.start("track") },
        toggleCmd("beatSync", "Пульс под бит"),
        toggleCmd("glow", "Свечение плеера"),
        toggleCmd("uiMotion", "Анимации интерфейса"),
        toggleCmd("reducedMotion", "Меньше анимаций"),
        toggleCmd("discordRpc", "Статус в Discord"),
        toggleCmd("rounded", "Скруглённые углы"),
        { label: "Мини-плеер", group: "Окно", run: () => mini.toggle() },
        { label: "Плеер на весь экран", group: "Окно", run: () => HOTKEYS.find((x) => x[0] === "F")[2]() },
        { label: "Отменить последнее изменение", group: "Правка", run: () => history.undo() },
        { label: "Что нового", group: "Справка", run: () => whatsNew.show() }
      ];
    },
    toggle(v = !this.open) {
      this.open = v;
      if (!v) {
        ui.scrim.classList.remove("on");
        ui.overlay = null;
        return;
      }
      this.input = h("input", { placeholder: "Что сделать?", "aria-label": "Команда", spellcheck: "false" });
      this.list = h("div", { class: "cmdk-l", role: "listbox" });
      this.el = h("div", { class: "cmdk", role: "dialog", "aria-label": "Быстрые команды" }, this.input, this.list);
      this.input.addEventListener("input", () => this.filter());
      this.input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const n = this.items.length || 1;
          this.sel = (this.sel + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
          this.paint();
        } else if (e.key === "Enter" && this.items[this.sel]) {
          e.preventDefault();
          this.exec(this.items[this.sel]);
        }
      });
      ui.overlay = this.el;
      ui.scrim.replaceChildren(this.el);
      ui.scrim.classList.add("on");
      this.all = this.commands();
      this.filter();
      setTimeout(() => this.input.focus(), 30);
    },
    exec(item) {
      this.toggle(false);
      item.run();
    },
    filter() {
      const q = this.input.value.trim().toLowerCase();
      const parts = q.split(/\s+/).filter(Boolean);
      this.items = this.all.filter((c) => {
        const text = `${c.label} ${c.group} ${c.hint || ""}`.toLowerCase();
        return parts.every((p) => text.includes(p));
      }).slice(0, 40);
      this.sel = 0;
      this.list.replaceChildren(...(this.items.length ? this.items.map((c, i) => h("div", { class: "cmd", role: "option", onpointerenter: () => {
        this.sel = i;
        this.paint();
      }, onclick: () => this.exec(c) }, c.label, h("small", {}, c.group))) : [h("div", { class: "empty" }, "Нет такой команды")]));
      this.paint();
    },
    paint() {
      [...this.list.children].forEach((el, i) => {
        const on = i === this.sel;
        el.classList.toggle("on", on);
        if (on) el.scrollIntoView({ block: "nearest" });
      });
    }
  };

  // ── Что нового ──────────────────────────────────────────────────────────────
  const whatsNew = {
    show() {
      const close = () => ui.closeOverlay();
      const el = h("div", { class: "wn", role: "dialog", "aria-label": "Что нового" },
        h("div", { class: "wn-h" }, h("small", {}, `Версия ${state.modVersion}`), h("h2", {}, "Большое обновление")),
        h("div", { class: "wn-l" }, CHANGES.map(([icon, t, d], i) => h("div", { class: "wn-i", style: `--n:${i}` }, h("div", { html: ICONS[icon] }), h("div", {}, h("b", {}, t), h("span", {}, d))))),
        h("div", { class: "wn-f" }, h("button", { class: "btn pri", onclick: close }, "Отлично")));
      ui.openOverlay(el);
    },
    check() {
      if (cfg.seenVersion === state.modVersion) return;
      setOpt({ seenVersion: state.modVersion }, { keepPreset: true, noHistory: true, silent: true });
      setTimeout(() => this.show(), 1600);
    }
  };

  // Карточка нового трека.
  const nowCard = {
    timer: 0,
    show(t) {
      if (!cfg.trackToast || !ui.nowEl || document.hidden || vis.inFs) return;
      ui.nowEl.replaceChildren(t.cover ? h("img", { src: t.cover, alt: "" }) : "", h("div", {}, h("b", {}, t.title), h("span", {}, t.artist)));
      ui.nowEl.classList.add("show");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => ui.nowEl.classList.remove("show"), 3200);
    }
  };

