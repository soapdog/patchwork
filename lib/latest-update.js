const https = require("https");
const packageInfo = require("../package.json");
const compareVersion = require("compare-version");
const Value = require("mutant/value");
const computed = require("mutant/computed");
const announcements = require("./announcements.js");

module.exports = function () {
  const update = Value();
  const hidden = Value(false);
  update.sync = Value(false);
  const version = packageInfo.version;
  let newVersion = packageInfo.version

  const checkForUpdate = () => {
    // Check whether notification has been hidden.
    if (hidden() === true) {
      // If so, stop the interval timer.
      clearInterval(updateCheckInterval);
      // And `return` to quit this function.
      return;
    }

    https.get({
      host: "api.github.com",
      path: "/repos/soapdog/patchwork/releases/latest",
      headers: {
        "user-agent": `Poncho Wonky v${version}`,
      },
    }, function (res) {
      if (res.statusCode === 200) {
        let result = "";
        res.on("data", (x) => {
          result += x;
        }).on("end", () => {
          const info = JSON.parse(result);
          newVersion = info.tag_name.slice(1)
          console.log("Current patchwork version", version);
          console.log("Most recent version on Github", newVersion);
          if (compareVersion(newVersion, version) > 0) {
            if (announcements.isUpdateNoticeIgnored(newVersion)) {
              hidden.set(true)
            } else {
              update.set(newVersion);
            }
          }
          update.sync.set(true);
        });
      }
      // You must handle the error here otherwise you get an unhandled error exception which stops the whole app.
    }).on("error", function (error) {
      console.log(
        "error trying to reach github to check for latest poncho wonky version: ",
        error,
      );
    });
  };

  // Retry update check every 24 hours.
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  // Previously we only checked for updates on startup, but some people keep
  // Patchwork running in the background all the time and they should get
  // update notifications too.
  const updateCheckInterval = setInterval(checkForUpdate, millisecondsPerDay);

  // Check for update immediately.
  checkForUpdate();

  const obs = computed(
    [update, hidden],
    (update, hidden) => update && !hidden ? update : false,
  );
  obs.ignore = () => {
    hidden.set(true);
    announcements.markUpdateNoticeAsSeen(newVersion)
  }
  return obs;
};
