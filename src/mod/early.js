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
})();
