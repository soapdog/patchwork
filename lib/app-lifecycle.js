const electron = require("electron");

/**
 * It's not possible to run two instances of patchwork as it would create two
 * ssb-server instances that conflict on the same port. Before opening patchwork,
 * we check if it's already running and if it is we focus the existing window
 * rather than opening a new instance.
 */
function quitIfAlreadyRunning() {
  if (!electron.app.requestSingleInstanceLock()) {
    console.log("Patchwork is already running!");
    console.log(
      "Please close the existing instance before starting a new one.",
    );
    return electron.app.quit();
  }
  electron.app.on("second-instance", () => {
    // Someone tried to run a second instance, we should focus our window.
    // TODO: go back to this. Needs to focus default identity.
    // if (windows.main) {
    //   if (windows.main.isMinimized()) windows.main.restore();
    //   windows.main.focus();
    // }
  });
}

module.exports = {
	quitIfAlreadyRunning
}