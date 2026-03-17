process.on("uncaughtException", function (err) {
  console.log("uncaughtException, quitting");
  console.log(err);
  process.exit();
});

process.noAsar = true;

const { isFeatureEnabled, enableFeature, disableFeature } = require("./lib/features.js");
const electron = require("electron")

require("@electron/remote/main").initialize();

// FEATURES
disableFeature("custom-scripts");
if (process.argv.includes("--enable-multiple-accounts")) {
  enableFeature("multiple-accounts")
} else {
  disableFeature("multiple-accounts")
};
// END OF FEATURES;

if (isFeatureEnabled("multiple-accounts")) {
  console.log("===> RUNNING WITH MULTIPLE ACCOUNTS")
  require("./multi-account-entrypoint.js")
} else {
  console.log("===> RUNNING WITH SINGLE ACCOUNT")
  require("./single-account-entrypoint.js")
}

