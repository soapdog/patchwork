process.on("uncaughtException", function (err) {
  console.log("uncaughtException, quitting");
  console.log(err);
  process.exit();
});

process.noAsar = true;

const { isFeatureEnabled, enableFeature, disableFeature } = require(
  "./lib/features.js",
);
const electron = require("electron");

require("@electron/remote/main").initialize();

// FEATURES
disableFeature("custom-scripts");
if (process.argv.includes("--enable-multiple-identities")) {
  enableFeature("multiple-identities");
} else {
  disableFeature("multiple-identities");
}
// END OF FEATURES;

if (isFeatureEnabled("multiple-identities")) {
  console.log("===> RUNNING WITH MULTIPLE IDENTITIES");
  require("./multiple-identities-entrypoint.js");
} else {
  console.log("===> RUNNING WITH SINGLE IDENTITY");
  require("./single-identity-entrypoint.js");
}
