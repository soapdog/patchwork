process.on("uncaughtException", function (err) {
  console.log("uncaughtException, quitting");
  console.log(err);
  process.exit();
});

process.noAsar = true;

const {
  initializeFeatureFile,
  isFeatureEnabled,
  enableFeature,
  disableFeature,
} = require(
  "./lib/features.js",
);
const electron = require("electron");

require("@electron/remote/main").initialize();

// FEATURES
initializeFeatureFile();

disableFeature("custom-scripts");
enableFeature("multiple-identities");

if (process.argv.includes("--enable-multiple-identities")) {
  enableFeature("multiple-identities");
} else if (process.argv.includes("--disable-multiple-identities")) {
  disableFeature("multiple-identities");
}

if (process.argv.includes("--enable-single-identity")) {
  disableFeature("multiple-identities");
}

if (process.argv.includes("--disable-custom-scripts")) {
  disableFeature("custom-scripts");
} else if (process.argv.includes("--enable-custom-scripts")) {
  enableFeature("custom-scripts");
}

// END OF FEATURES;

if (isFeatureEnabled("multiple-identities")) {
  console.log("===> RUNNING WITH MULTIPLE IDENTITIES");
  require("./multiple-identities-entrypoint.js");
} else {
  console.log("===> RUNNING WITH SINGLE IDENTITY");
  require("./single-identity-entrypoint.js");
}
