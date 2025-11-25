const Path = require("path");
const electron = require("electron");
const extend = require("xtend/mutable");
const setupContextMenu = require("./context-menu");

module.exports = function Window(
  config,
  path,
  opts,
  serverDevToolsCallback,
  navigateHandler,
) {
  const window = new electron.BrowserWindow(extend({
    show: false,
    resizable: true,
    devTools: true,
    width: 150,
    height: 150,
    webPreferences: {
      nodeIntegration: true, // XXX: Maybe not always necessary (?),
      contextIsolation: false,
    },
  }, opts));

  // have to forward the OS window state to the renderer because it cannot
  // access directly
  window.on("enter-full-screen", (event, alwaysOnTop) => {
    window.webContents.send("enter-full-screen");
  });
  window.on("leave-full-screen", (event, alwaysOnTop) => {
    window.webContents.send("leave-full-screen");
  });
  window.once("ready-to-show", () => {
    if (opts.title !== "patchwork-server") {
      window.show();
    }
  });

  window.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.log("failed to load window", errorDescription);
    },
  );

  window.webContents.on("dom-ready", function () {
    window.webContents.send("window-setup", {
      rootPath: path,
      config: config,
      data: opts.data || "",
      title: opts.title || "Patchwonky",
    });
    // window.webContents.openDevTools();
    const availableLangs =
      window.webContents.session.availableSpellCheckerLanguages;
    window.webContents.send("setAvailableDictionaries", availableLangs);
  });

  // setTimeout(function () {
  //   window.show()
  // }, 3000)

  window.webContents.on("will-navigate", function (e, url) {
    e.preventDefault();
    electron.shell.openExternal(url);
  });

  window.webContents.on("new-window", function (e, url) {
    e.preventDefault();
    electron.shell.openExternal(url);
  });

  window.on("closed", function () {
    electron.ipcMain.removeListener("ready-to-show", () => {
      // window.show()
    });
  });

  // TODO: better way to determine whether this is the main window ?
  if (opts.title === "Patchwonky") {
    setupContextMenu(
      config,
      serverDevToolsCallback,
      navigateHandler,
      window,
    );
  }

  const p = Path.join(__dirname, "..", "assets", "base.html");
  window.loadFile(
    p,
  );
  return window;
};
