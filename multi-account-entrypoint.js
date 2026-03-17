const electron = require("electron");
const { nativeImage } = require("electron");
const openWindow = require("./lib/window.js");

const Path = require("path");
const defaultMenu = require("electron-default-menu");
const WindowState = require("electron-window-state");
const Menu = electron.Menu;
const extend = require("xtend");
const ssbKeys = require("ssb-keys");
const announcements = require("./lib/announcements.js");
const customScripts = require("./lib/depject/scripts/lua/custom-scripts.js");
const {
  isFeatureEnabled,
  enableFeature,
  disableFeature,
} = require(
  "./lib/features.js",
);
const {
  quitIfAlreadyRunning,
  openIdentitiesManager,
  startServerForIdentity,
  openMainWindowForIdentity,
} = require("./lib/app-lifecycle.js");
const Identities = require("./lib/identities.js");

quitIfAlreadyRunning();

const config = {
  server:
    !(process.argv.includes("-g") || process.argv.includes("--use-global-ssb")),
};
// a flag so we don't start git-ssb-web if a custom path is passed in
if (process.argv.includes("--path")) {
  config.customPath = true;
}

const windows = new Map();

electron.app.on("ready", () => {
  /*
== IDENTITY MANAGEMENT ===========================================================================================================
  */

  if (process.argv.includes("--identities-manager")) {
    openIdentitiesManager();
  } else {
    const identities = Identities.list();

    for (const identity of identities) {
      const configuration = Identities.configurationForIdentity(identity);

      if (configuration.autostart) {
        windows.set(identity.keys.id, startServerForIdentity(identity));
      }
    }
  }

  /*
== WINDOW EVENTS ===========================================================================================================
  */

  console.log("Registering events");

  electron.ipcMain.handle("consoleLog", (_ev, ...o) => {
    for (const i of o) {
      console.log(i);
    }
  });

  electron.ipcMain.addListener("open-identity", (_ev, identity) => {
    windows.set(identity.keys.id, startServerForIdentity(identity));
    console.log("windows", windows);
  });

  electron.ipcMain.addListener("server-started", (_ev, config) => {
    const identityWindows = windows.get(config.keys.id);

    if (identityWindows) {
      const renderer = openMainWindowForIdentity(config);
      identityWindows.renderer = renderer;
      windows.set(config.keys.id, identityWindows);
      console.log("windows", windows);
    }
  });

  electron.ipcMain.handle("consoleError", (_ev, ...o) => console.error(...o));
  electron.ipcMain.handle("badgeCount", (_ev, count) => {
    electron.app.badgeCount = count;
  });
  electron.ipcMain.on("exit", (_ev, code) => process.exit(code));

  electron.ipcMain.on("relaunch-app", (_ev) => {
    electron.app.relaunch();
    electron.app.quit();
  });
});
