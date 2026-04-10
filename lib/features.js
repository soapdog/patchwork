const fs = require("fs");
const path = require("path");
const mkdirp = require("mkdirp");
const toml = require("@iarna/toml");
const paths = require("./paths.js");

const tempFeaturesFile = path.join(paths.config, "ponchowonky.features.toml");

const initializeFeatureFile = () => {
  if (fs.existsSync(tempFeaturesFile)) {
    fs.rmSync(tempFeaturesFile);
  }
  if (!fs.existsSync(paths.config)) {
    mkdirp.sync(paths.config);
  }
  fs.writeFileSync(tempFeaturesFile, toml.stringify({}));
};

const enableFeature = (key) => {
  console.log(`= ENABLING FEATURE: ${key}`);
  if (!fs.existsSync(tempFeaturesFile)) {
    initializeFeatureFile();
  }
  const obj = toml.parse(fs.readFileSync(tempFeaturesFile));
  obj[key] = true;
  fs.writeFileSync(tempFeaturesFile, toml.stringify(obj));
};

const disableFeature = (key) => {
  console.log(`= DISABLING FEATURE: ${key}`);
  if (!fs.existsSync(tempFeaturesFile)) {
    initializeFeatureFile();
  }
  const obj = toml.parse(fs.readFileSync(tempFeaturesFile));
  obj[key] = false;
  fs.writeFileSync(tempFeaturesFile, toml.stringify(obj));
};

const isFeatureEnabled = (key) => {
  if (!fs.existsSync(tempFeaturesFile)) {
    initializeFeatureFile();
  }
  const obj = toml.parse(fs.readFileSync(tempFeaturesFile));
  return obj[key] ?? false;
};

module.exports = {
  initializeFeatureFile,
  enableFeature,
  disableFeature,
  isFeatureEnabled,
};
