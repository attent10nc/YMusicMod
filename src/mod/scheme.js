/*YMMOD-BEGIN scheme*/
;(() => {
  try {
    const { protocol } = require("electron");
    const ours = { scheme: "ymmod", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: true } };
    const original = protocol.registerSchemesAsPrivileged.bind(protocol);
    let done = false;
    protocol.registerSchemesAsPrivileged = (list) => {
      done = true;
      return original([...(list || []).filter((s) => s && s.scheme !== "ymmod"), ours]);
    };
    process.nextTick(() => {
      if (!done) {
        done = true;
        original([ours]);
      }
    });
  } catch (e) {
    console.warn("[YMusicMod] scheme", e);
  }
})();
/*YMMOD-END scheme*/
