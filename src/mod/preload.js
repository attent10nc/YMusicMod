/*YMMOD-BEGIN preload*/
;(() => {
  if (window !== window.top || /^(https?|file|ymmod|data|about):/i.test(location.protocol)) return;
  const { contextBridge, ipcRenderer, webFrame } = require("electron");
  const call = (name) => (...args) => ipcRenderer.invoke(`desktop:ymmod:${name}`, ...args);
  try {
    contextBridge.exposeInMainWorld("musicDesktopMod", {
      get: call("get"),
      set: call("set"),
      addBackgrounds: call("add-backgrounds"),
      removeBackground: call("remove-background"),
      coverColor: call("cover-color"),
      exportPresets: call("export-presets"),
      importPresets: call("import-presets"),
      mini: call("mini"),
      miniState: call("mini-state"),
      discord: call("discord"),
      openFolder: call("open-folder"),
      addFont: call("add-font"),
      removeFont: call("remove-font"),
      systemFonts: call("system-fonts"),
      setLogo: call("set-logo"),
      statsAdd: call("stats-add"),
      statsGet: call("stats-get"),
      statsReset: call("stats-reset")
    });
  } catch (e) {
    console.warn("[YMusicMod] bridge", e);
  }
  const early = function () {
__YMMOD_EARLY__
  };
  try {
    if (typeof contextBridge.executeInMainWorld === "function") contextBridge.executeInMainWorld({ func: early });
    else webFrame.executeJavaScript("(" + early.toString() + ")()");
  } catch (e) {
    console.warn("[YMusicMod] early hook", e);
  }
})();
/*YMMOD-END preload*/
