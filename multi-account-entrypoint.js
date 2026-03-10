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
const { isFeatureEnabled, enableFeature, disableFeature } = require(
  "./lib/features.js",
);
const { quitIfAlreadyRunning } = require("./lib/app-lifecycle.js");

quitIfAlreadyRunning();

const config = {
  server:
    !(process.argv.includes("-g") || process.argv.includes("--use-global-ssb")),
};
// a flag so we don't start git-ssb-web if a custom path is passed in
if (process.argv.includes("--path")) {
  config.customPath = true;
}
