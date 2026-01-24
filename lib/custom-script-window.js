const combine = require("depject");
const entry = require("depject/entry");
const electron = require("electron");
const { h, when, map, Array: MutantArray, Value } = require("mutant");
const onceTrue = require("mutant/once-true");
const computed = require("mutant/computed");
const catchLinks = require("./catch-links");
const themes = require("../styles");
const moment = require("moment-timezone");
const nest = require("depnest");
const ref = require("ssb-ref");
const watch = require("mutant/watch");
const ssbUri = require("ssb-uri");
const pull = require("pull-stream");
const fullscreen = require("./fullscreen.js");
const path = require("path");
const fs = require("fs");
const customScripts = require("./depject/scripts/lua/custom-scripts.js")

const requireStyle = (moduleName, specificFilePath = false) => {
  const stylesPath = path.join(__dirname, "../styles", moduleName);
  const filePath = !specificFilePath
    ? path.resolve(stylesPath, `${moduleName}.css`)
    : path.resolve(stylesPath, specificFilePath);
  const urlStr = `@import "${filePath}"`;
  return urlStr;
};

function overrideConfig(config) {
  return {
    "patchwork/config": {
      gives: nest("config.sync.load"),
      create: function () {
        return nest("config.sync.load", () => config);
      },
    },
  };
}

function addCommand(id, cb) {
  return {
    [`patchwork/command/${id}`]: {
      gives: nest(id),
      create: function () {
        return nest(id, cb);
      },
    },
  };
}

module.exports = function (config, initialData) {
  const sockets = combine(
    overrideConfig(config),
    addCommand("app.navigate", () => {}),
    addCommand("app.refresh", () => {}),
    require("./depject"),
    require("patch-settings"),
  );

  const api = entry(
    sockets,
    nest({
      "config.sync.load": "first",
      "keys.sync.id": "first",
      "sbot.obs.connection": "first",
      "sbot.async.get": "first",
      "blob.sync.url": "first",
      "intl.sync.i18n": "first",
      "settings.obs.get": "first",
    }),
  );

  const i18n = api.intl.sync.i18n;
  const language = api.settings.obs.get("patchwork.lang", "")();
  moment.locale(language);

  const id = api.keys.sync.id();
  const data = Value(initialData)

  document.head.appendChild(
    h("style", {
      innerHTML: computed(
        api.settings.obs.get("patchwork.theme", "light"),
        (themeName) => {
          return themes[themeName] || themes.light;
        },
      ),
    }),
  );

  document.head.appendChild(
    h("style", {
      innerHTML: requireStyle("noto-color-emoji"),
    }),
  );

  document.head.appendChild(
    h("style", {
      innerHTML: requireStyle("audio-player"),
    }),
  );

  document.head.appendChild(
    h("style", {
      innerHTML: computed(
        api.settings.obs.get("patchwork.fontSize"),
        (size) => {
          if (size) {
            return "html, body {font-size: " + size + ";}";
          }
        },
      ),
    }),
  );

  document.head.appendChild(
    h("style", {
      innerHTML: computed(
        api.settings.obs.get("patchwork.fontFamily"),
        (family) => {
          if (family) {
            return "body, input, select { font-family: " + family + ";}";
          }
        },
      ),
    }),
  );


  electron.ipcRenderer.on("send-data", (ev, newData) => {
   // save data
    data.set(newData)
  });

  window.assetsFolder = (f) => {
    return path.join(customScripts.assetsFolder(), f)
  }
  window.data = initialData.opts.data
  const p = path.join(customScripts.assetsFolder(), initialData.file)
  document.head.appendChild(
      h("script", {
        defer: true,
        src: p
      })
   )

  const container = h(`CustomScript -${process.platform}`, {
    classList: [when(fullscreen(), "-fullscreen")],
  }, [
    h("div.top", []),
    h("div.middle", {
      id: "middle"
    }),
    h("div.footer", []),
  ]);

  return [container];
};
