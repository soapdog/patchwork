const pull = require("pull-stream");

module.exports = function (notificationStreams) {
    notificationStreams.forEach((stream) => {
    pull(stream, pull.drain((n) => {
      electron.ipcRenderer.send('send-notification', n)
    }))
  });
}