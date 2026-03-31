const electron = require("electron");
const { nativeImage } = require("electron");
const openWindow = require("./window.js");
const Path = require("path");
const getPort = require("get-port").default;
const ssbKeys = require("ssb-keys");
const defaultMenu = require("electron-default-menu");
const WindowState = require("electron-window-state");
const Menu = electron.Menu;
const dialog = require("electron").dialog;

const Identities = require("./identities.js");

const appIcon = nativeImage.createFromPath(
  Path.join(__dirname, "../assets/512x512.png"),
);

/**
 * It's not possible to run two instances of patchwork as it would create two
 * ssb-server instances that conflict on the same port. Before opening patchwork,
 * we check if it's already running and if it is we focus the existing window
 * rather than opening a new instance.
 */
function quitIfAlreadyRunning() {
  if (!electron.app.requestSingleInstanceLock()) {
    console.log("Poncho Wonky is already running!");
    console.log(
      "Please close the existing instance before starting a new one.",
    );
    return electron.app.quit();
  }
}

function openAnnouncementsWindow() {
  windows.announcements = openWindow(
    ssbConfig,
    Path.join(__dirname, "lib", "announcements-window.js"),
    {
      minWidth: 400,
      center: true,
      width: 400,
      height: 600,
      // titleBarStyle: "hiddenInset",
      autoHideMenuBar: true,
      title: "Poncho Wonky Announcements",
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      announcements: announcements.getAsHTML(),
      show: true,
      backgroundColor: "#EEE",
      icon: appIcon,
    },
  );

  windows.announcements.setAlwaysOnTop(true);
  windows.announcements.setIcon(appIcon);
  // windows.announcements.openDevTools()
}

function openAudioPlayer(msg) {
  let display = electron.screen.getPrimaryDisplay();
  let width = display.bounds.width;
  let height = display.bounds.height;
  windows.audioPlayer = openWindow(
    ssbConfig,
    Path.join(__dirname, "lib", "audio-player-window.js"),
    {
      minWidth: 100,
      center: true,
      width: 250,
      height: 300,
      x: width - 300,
      y: height - 350,
      // titleBarStyle: "hiddenInset",
      autoHideMenuBar: true,
      title: "Poncho Wonky Audio Player",
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      data: msg,
      show: true,
      backgroundColor: "#EEE",
      icon: appIcon,
    },
  );

  windows.audioPlayer.setAlwaysOnTop(true);
  windows.audioPlayer.setIcon(appIcon);
  // windows.audioPlayer.openDevTools()
  windows.audioPlayer.webContents.on("close", () => {
    delete windows.audioPlayer;
  });
}

function openCustomScriptWindow(data) {
  let display = electron.screen.getPrimaryDisplay();
  let width = display.bounds.width;
  let height = display.bounds.height;
  windows.customScriptWindow = openWindow(
    ssbConfig,
    Path.join(__dirname, "lib", "custom-script-window.js"),
    {
      minWidth: 100,
      center: true,
      width: data?.opts?.width || 250,
      height: data?.opts?.height || 300,
      x: width - 300,
      y: height - 350,
      // titleBarStyle: "hiddenInset",
      autoHideMenuBar: true,
      title: "Poncho Wonky Custom Script",
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      data: data,
      show: true,
      backgroundColor: "#EEE",
      icon: appIcon,
    },
  );

  windows.customScriptWindow.setIcon(appIcon);
  // windows.customScriptWindow.openDevTools()
  windows.customScriptWindow.webContents.on("close", () => {
    delete windows.customScriptWindow;
  });
}

function openProtocolGuideWindow() {
  let display = electron.screen.getPrimaryDisplay();
  let width = display.bounds.width;
  let height = display.bounds.height;
  windows.customScriptWindow = new electron.BrowserWindow(extend({
    show: false,
    resizable: true,
    devTools: true,
    width: 1000,
    center: true,
    height: 600,
    webPreferences: {
      nodeIntegration: false, // XXX: Maybe not always necessary (?),
      contextIsolation: false,
    },
  }));

  windows.customScriptWindow.once("ready-to-show", () => {
    windows.customScriptWindow.show();
  });

  const p = Path.join(__dirname, "docs", "protocol-guide", "index.html");
  windows.customScriptWindow.loadFile(
    p,
  );
}

function openIdentitiesManager() {
  let display = electron.screen.getPrimaryDisplay();
  const win = openWindow(
    null, // no ssbConfig for identities manager.
    Path.join(__dirname, "identities-manager-window.js"),
    {
      minWidth: 400,
      center: true,
      width: 600,
      height: 400,
      // titleBarStyle: "hiddenInset",
      autoHideMenuBar: true,
      title: "Identities Manager",
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      show: true,
      backgroundColor: "#EEE",
      icon: appIcon,
    },
  );

  win.setIcon(appIcon);
  // win.openDevTools()
}

async function startServerForIdentity(identity) {
  const configuration = Identities.configurationForIdentity(identity.keys.id);
  const port = await getPort({ port: [8008, 8009, 8010, 8011] });
  const blobsPort = await getPort({ port: [8989, 8990, 8991, 8992] });
  const folder = Identities.pathForIdentity(identity.keys.id);

  const ssbConfig = require("ssb-config/inject")(
    "ponchowonky",
    {
      path: folder,
      port: port,
      blobsPort: blobsPort, // matches ssb-ws
      friends: { // not using ssb-friends (sbot/contacts fixes hops at 2, so this setting won't do anything)
        dunbar: 150,
        hops: 2, // down from 3
      },
    },
  );

  // disable gossip auto-population from {type: 'pub'} messages as we handle this manually in sbot/index.js
  if (!ssbConfig.gossip) ssbConfig.gossip = {};
  ssbConfig.gossip.autoPopulate = false;

  ssbConfig.keys = ssbKeys.loadOrCreateSync(
    Path.join(ssbConfig.path, "secret"),
  );

  const keys = ssbConfig.keys;
  const pubkey = keys.id.slice(1).replace(`.${keys.curve}`, "");

  if (process.platform === "win32") {
    // fix offline on windows by specifying 127.0.0.1 instead of localhost (default)
    ssbConfig.remote = `net:127.0.0.1:${ssbConfig.port}~shs:${pubkey}`;
  } else {
    const socketPath = Path.join(ssbConfig.path, "socket");
    ssbConfig.connections.incoming.unix = [{
      scope: "device",
      transform: "noauth",
    }];
    ssbConfig.remote = `unix:${socketPath}:~noauth:${pubkey}`;
  }

  // Support rooms
  ssbConfig.connections.incoming.tunnel = [{
    scope: "public",
    transform: "shs",
  }];
  ssbConfig.connections.outgoing.tunnel = [{ transform: "shs" }];

  // Support DHT invites (only as a client, for now)
  ssbConfig.connections.outgoing.dht = [{ transform: "shs" }];

  // fix blobs port for ssb-ws
  ssbConfig.connections.incoming.ws = [{
    scope: ["public", "local", "device"],
    port: blobsPort,
    transform: "shs",
    http: true,
  }];

  const redactedConfig = JSON.parse(JSON.stringify(ssbConfig));
  redactedConfig.keys.private = null;
  console.dir(redactedConfig, { depth: null });

  const background = openWindow(
    ssbConfig,
    Path.join(__dirname, "server-process.js"),
    {
      connect: false,
      center: true,
      fullscreen: false,
      fullscreenable: false,
      height: 150,
      width: 150,
      maximizable: false,
      minimizable: false,
      resizable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      show: false,
      skipTaskbar: true,
      title: `patchwork-server for ${ssbConfig.keys.id}`,
      useContentSize: true,
    },
  );
  // windows.background.on('close', (ev) => {
  //   ev.preventDefault()
  //   windows.background.hide()
  // })
  background.setIcon(appIcon);

  background.webContents.keyForWindowsMap = ssbConfig.keys.id;
  background.webContents.typeOfWindow = "background";

  return {
    ssbConfig,
    configuration,
    renderer: null,
    background,
  };
}

function openServerDevTools() {
  if (windows.background) {
    windows.background.webContents.openDevTools({ mode: "detach" });
  }
}

function navigateTo(target) {
  const win = electron.BrowserWindow.getFocusedWindow();
  if (win) {
    win.send("navigate-to", target);
  }
}

function openMainWindowForIdentity(ssbConfig) {
  const windowState = WindowState({
    defaultWidth: 1024,
    defaultHeight: 768,
  });

  const win = openWindow(
    ssbConfig,
    Path.join(__dirname, "main-window.js"),
    {
      minWidth: 800,
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      titleBarStyle: "hiddenInset",
      autoHideMenuBar: true,
      title: `Poncho Wonky for ${ssbConfig.keys.id}`,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      show: true,
      backgroundColor: "#EEE",
      icon: appIcon,
    },
    openServerDevTools,
    navigateTo,
  );

  windowState.manage(win);
  win.setSheetOffset(40);

  win.setIcon(appIcon);

  require("@electron/remote/main").enable(win.webContents);

  win.on("app-command", (_e, cmd) => {
    switch (cmd) {
      case "browser-backward": {
        win.webContents.send("goBack");
        break;
      }
      case "browser-forward": {
        win.webContents.send("goForward");
        break;
      }
    }
  });

  win.webContents.keyForWindowsMap = ssbConfig.keys.id;
  win.webContents.typeOfWindow = "main";

  return win;
}

module.exports = {
  quitIfAlreadyRunning,
  openProtocolGuideWindow,
  openAnnouncementsWindow,
  openAudioPlayer,
  openCustomScriptWindow,
  openIdentitiesManager,
  startServerForIdentity,
  openMainWindowForIdentity,
};
