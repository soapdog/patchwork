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
  openProtocolGuideWindow,
  openAudioPlayer,
  openCustomScriptWindow,
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

  if (
    process.argv.includes("--identities-manager")
  ) {
    openIdentitiesManager();
  } else {
    const identities = Identities.list();

    for (const identity of identities) {
      const configuration = Identities.configurationForIdentity(
        identity.keys.id,
      );

      if (configuration.autostart) {
        // Should we? Maybe not... TODO: Maybe remove this pathway.
        startServerForIdentity(identity).then((o) => {
          windows.set(identity.keys.id, o);
          // console.log("windows fom open identity", windows);
          console.log(JSON.stringify(o));
          if (o.background === null && o?.remoteIdentity) {
            console.log("Remote identity, opening main window");
            const identityWindows = windows.get(config.keys.id);

            if (identityWindows) {
              const renderer = openMainWindowForIdentity(config);
              identityWindows.renderer = renderer;
              windows.set(config.keys.id, identityWindows);
              // console.log("windows from open main", windows);
              renderer.on("closed", () => {
                delete identityWindows.renderer;
                stopRunningIdentity(config.keys.id);
              });
            }
          }
        });
      }
    }
  }

  /*
== WINDOW EVENTS ===========================================================================================================
  */

  console.log("Registering events");

  electron.ipcMain.handle("consoleLog", (_ev, ...o) => {
    for (const i of o) {
      if (typeof i === "string") {
        console.log(i);
      } else {
        console.log(JSON.stringify(i));
      }
    }
  });

  electron.ipcMain.addListener("open-identity", (_ev, identity) => {
    startServerForIdentity(identity).then((o) => {
      windows.set(identity.keys.id, o);
      // console.log("windows fom open identity", windows);
      console.log(JSON.stringify(o, null, 2));
      if (o.background === null && o?.remoteIdentity) {
        console.log("Remote identity, opening main window");
        const identityWindows = windows.get(o.ssbConfig.keys.id);

        if (identityWindows) {
          const renderer = openMainWindowForIdentity(o.ssbConfig);
          identityWindows.renderer = renderer;
          windows.set(o.ssbConfig.keys.id, identityWindows);
          // console.log("windows from open main", windows);
          renderer.on("closed", () => {
            delete identityWindows.renderer;
            stopRunningIdentity(o.ssbConfig.keys.id);
          });
        }
      }
    });
  });

  electron.ipcMain.addListener("server-started", (_ev, config) => {
    const identityWindows = windows.get(config.keys.id);

    if (identityWindows) {
      const renderer = openMainWindowForIdentity(config);
      identityWindows.renderer = renderer;
      windows.set(config.keys.id, identityWindows);
      // console.log("windows from open main", windows);
      renderer.on("closed", () => {
        delete identityWindows.renderer;
        stopRunningIdentity(config.keys.id);
      });
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

  electron.ipcMain.on("open-identity-manager", (_ev) => {
    openIdentitiesManager();
  });

  // MARKER: URL HANDLING
  electron.app.on("open-url", (_ev, url) => {
    const browserWindow = windows[windows.keys().next()]?.renderer;
    console.log("browser window for open url", browserWindow);
    if (ssbUri.isClassicMessageSSBURI(url)) {
      const msgid = ssbUri.toMessageSigil(url);
      browserWindow.webContents.send("navigate-to", msgid);
    } else if (ssbUri.isFeedSSBURI(url)) {
      const feedid = ssbUri.toFeedSigil(url);
      browserWindow.webContents.send("navigate-to", feedid);
    }
  });

  electron.app.on(
    "second-instance",
    (_ev, commandLine, _workingDirectory) => {
      const url = commandLine.pop();
      const browserWindow = windows[windows.keys().next()]?.renderer;
      console.log("browser window for open url", browserWindow);
      // the commandLine is array of strings in which last element is deep link url
      if (ssbUri.isClassicMessageSSBURI(url)) {
        const msgid = ssbUri.toMessageSigil(url);
        browserWindow.webContents.send("navigate-to", msgid);
      } else if (ssbUri.isFeedSSBURI(url)) {
        const feedid = ssbUri.toFeedSigil(url);
        browserWindow.webContents.send("navigate-to", feedid);
      }
    },
  );

  electron.ipcMain.handle("get-running-identities", async (_ev) => {
    const allWebContents = electron.webContents.getAllWebContents();
    const identities = allWebContents
      .filter((w) => {
        return w?.typeOfWindow === "main";
      })
      .map((w) => {
        return w?.keyForWindowsMap;
      });

    return identities;
  });

  electron.ipcMain.on("stop-identity", (ev, id) => {
    stopRunningIdentity(id);
  });

  const stopRunningIdentity = (id) => {
    console.log(`stopping ${id}`);
    const windowsForIdentity = windows.get(id);

    if (windowsForIdentity?.renderer) {
      windowsForIdentity.renderer.close();
    }

    if (windowsForIdentity?.audioPlayer) {
      windowsForIdentity.audioPlayer.close();
    }

    if (windowsForIdentity?.customScriptWindow) {
      windowsForIdentity.customScriptWindow.close();
    }

    if (windowsForIdentity?.background) {
      windowsForIdentity.background.close();
    }
  };

  /*
== MENU STUFF ===========================================================================================================
  */

  const menu = defaultMenu(electron.app, electron.shell);

  menu.splice(4, 0, {
    label: "Navigation",
    submenu: [
      {
        label: "Activate Search Field",
        accelerator: "CmdOrCtrl+L",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("activateSearch");
        },
      },
      {
        label: "Back",
        accelerator: "CmdOrCtrl+[",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("goBack");
        },
      },
      {
        label: "Forward",
        accelerator: "CmdOrCtrl+]",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("goForward");
        },
      },
      {
        type: "separator",
      },
      {
        label: "Public",
        accelerator: "CmdOrCtrl+1",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("navigate-to", "/public");
        },
      },
      {
        label: "Mentions",
        accelerator: "CmdOrCtrl+2",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("navigate-to", "/mentions");
        },
      },
      {
        label: "Private",
        accelerator: "CmdOrCtrl+3",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("navigate-to", "/private");
        },
      },
      {
        label: "Participating",
        accelerator: "CmdOrCtrl+4",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("navigate-to", "/particiapting");
        },
      },
      {
        type: "separator",
      },
      {
        label: "Settings",
        accelerator: "CmdOrCtrl+,",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("goToSettings");
        },
      },
      {
        label: "Status",
        accelerator: "CmdOrCtrl+.",
        click: () => {
          const browserWindow = electron.BrowserWindow.getFocusedWindow();
          browserWindow.webContents.send("goToStatus");
        },
      },
      {
        label: "Identities Manager",
        click: () => {
          openIdentitiesManager();
        },
      },
    ],
  });

  const view = menu.find((x) => x.label === "View");
  view.submenu = [
    { role: "reload" },
    { role: "toggledevtools" },
    { type: "separator" },
    { role: "resetzoom" },
    { role: "zoomin", accelerator: "CmdOrCtrl+=" },
    { role: "zoomout", accelerator: "CmdOrCtrl+-" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];
  const help = menu.find((x) => x.label === "Help");
  help.submenu = [
    {
      label: "Learn More",
      click() {
        require("electron").shell.openExternal("https://scuttlebutt.nz");
      },
    },
    {
      label: "Source Code on Github",
      click() {
        require("electron").shell.openExternal(
          "https://github.com/soapdog/patchwork/",
        );
      },
    },
    {
      label: "Report issue",
      click() {
        require("electron").shell.openExternal(
          "https://github.com/soapdog/patchwork/issues/new/choose",
        );
      },
    },
    {
      label: "Protocol Guide",
      click() {
        openProtocolGuideWindow();
      },
    },
  ];
  if (process.platform === "darwin") {
    const win = menu.find((x) => x.label === "Window");
    win.submenu = [
      { role: "minimize" },
      { role: "zoom" },
      { role: "close", label: "Close" },
      { type: "separator" },
      { role: "front" },
    ];
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));

  // MARKER: SEARCH

  electron.ipcMain.on("search", (ev, terms) => {
    const background = windows.get(ev.sender.keyForWindowsMap).background;
    background.webContents.send("search", terms);
  });

  electron.ipcMain.on("is-search-available", (ev, terms) => {
    const background = windows.get(ev.sender.keyForWindowsMap).background;
    if (background) {
      background.webContents.send("is-search-available", terms);
    }
  });

  electron.ipcMain.on("search-results", (ev, results) => {
    const main = windows.get(ev.sender.keyForWindowsMap).renderer;
    main.webContents.send("search-results", results);
  });

  electron.ipcMain.on("search-unavailable", (ev) => {
    const main = windows.get(ev.sender.keyForWindowsMap)?.renderer;
    if (main) {
      main.webContents.send("search-unavailable");
    }
  });

  electron.ipcMain.on("search-available", (ev) => {
    const main = windows.get(ev.sender.keyForWindowsMap).renderer;
    main.webContents.send("search-available");
  });

  // MARKER: General stuff
  electron.app.on("activate", function () {
    const browserWindow = electron.BrowserWindow.getFocusedWindow();
    if (browserWindow) {
      browserWindow.show();
    }
  });

  electron.app.on("before-quit", function () {
    quitting = true;
  });

  electron.ipcMain.handle("get-announcements", () => {
    return announcements.getAsHTML();
  });

  electron.ipcMain.handle("clear-announcements", () => {
    return announcements.markAsRead();
  });

  electron.ipcMain.handle("navigation-menu-popup", (event, data) => {
    const { items, x, y } = data;
    const window = event.sender;
    const factor = event.sender.zoomFactor;
    const menuItems = buildMenu(items, window);
    const menu = electron.Menu.buildFromTemplate(menuItems);
    menu.popup({
      window,
      x: Math.round(x * factor),
      y: Math.round(y * factor) + 4,
    });
  });

  electron.ipcMain.handle("setSpellcheckLangs", (ev, params) => {
    const browserWindow = electron.BrowserWindow.getFocusedWindow();
    if (!browserWindow) return;
    const { langs, enabled } = params;
    browserWindow.webContents.session.setSpellCheckerLanguages(
      enabled ? langs : [],
    );
  });

  electron.ipcMain.on("open-in-audio-player", (ev, msg) => {
    console.log("open-in-audio-player");
    const id = ev.sender.keyForWindowsMap;
    const identityWindows = windows.get(id);
    if (!identityWindows?.audioPlayer) {
      identityWindows.audioPlayer = openAudioPlayer(
        identityWindows.ssbConfig,
        msg,
      );
    } else {
      identityWindows.audioPlayer.webContents.send("queue-audio", msg);
    }
  });

  if (isFeatureEnabled("custom-scripts")) {
    electron.ipcMain.on("open-custom-script-window", (ev, data) => {
      console.log("open-custom-script-window", data);
      const id = ev.sender.keyForWindowsMap;
      const identityWindows = windows.get(id);
      if (!identityWindows?.customScriptWindow) {
        identityWindows.customScriptWindow = openCustomScriptWindow(data);
      } else {
        windows.customScriptWindow.webContents.send("send-data", data);
      }
    });
  }

  // announcements
  announcements.copy();
  if (announcements.available()) {
    windows.announcement = openAnnouncementsWindow();
  }

  // custom scripts
  if (isFeatureEnabled("custom-scripts")) {
    customScripts.copySamples();
  }

  function buildMenu(items, window) {
    const result = [];
    for (let item of items) {
      switch (item.type) {
        case "separator":
          result.push(item);
          break;
        case "submenu":
          result.push({
            ...item,
            submenu: buildMenu(item.submenu, window),
          });
          break;
        case "normal":
          result.push({
            ...item,
            click: () => navigateTo(item.target),
          });
          break;
        case "event":
          item.type = "normal";
          result.push({
            ...item,
            click: () => {
              switch (item.target) {
                case "!identities-manager":
                  openIdentitiesManager();
              }
            },
          });
          break;
        default:
          console.log(
            `Unknown menu item of type "${item.type}": ${
              JSON.stringify(item, null, 2)
            }`,
          );
      }
    }
    return result;
  }

  function navigateTo(target) {
    const browserWindow = electron.BrowserWindow.getFocusedWindow();
    if (browserWindow) {
      browserWindow.send("navigate-to", target);
    }
  }
});
