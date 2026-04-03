const _ = require("lodash");
const paths = require("./paths.js");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const preferences = require("./preferences.js");
const ssbKeys = require("ssb-keys");
const toml = require("@iarna/toml");
const mnemonic = require("ssb-keys-mnemonic");

const identitiesFolder = path.join(paths.data, "identities");

const minimalConfig = {
  autostart: false,
  name: "Untitled Identity",
};

function getDefaultIdentity() {
  const appName = process.env.ssb_appname || "ssb";
  const defaultIdentityPath = path.join(os.homedir(), "." + appName, "secret");

  if (fs.existsSync(defaultIdentityPath)) {
    const defaultKeys = ssbKeys.loadOrCreateSync(defaultIdentityPath);
    return {
      keys: defaultKeys,
      path: path.dirname(defaultIdentityPath),
    };
  } else {
    return false;
  }
}

function pathForIdentity(id) {
  const defaultIdentity = getDefaultIdentity();

  if (defaultIdentity?.keys?.id == id) {
    return defaultIdentity.path;
  }

  if (id[0] === "@") {
    id = id.slice(1);
  }

  const newPath = path.join(identitiesFolder, _.kebabCase(id.slice(0, 10)));
  return newPath;
}

function configurationForIdentity(id) {
  if (id[0] === "@") {
    id = id.slice(1);
  }
  let configPath = path.join(
    identitiesFolder,
    _.kebabCase(id.slice(0, 10)),
    "ponchowonky.toml",
  );

  if (!fs.existsSync(configPath)) {
    // check if this is a default identity
    const defaultIdentity = getDefaultIdentity();

    if (defaultIdentity?.keys?.id.slice(1) == id) {
      configPath = path.join(defaultIdentity.path, "ponchowonky.toml");
    }

    if (!fs.existsSync(configPath)) {
      minimalConfig.autostart = true;
      // if not, write the config.

      fs.writeFileSync(configPath, toml.stringify(minimalConfig));
    }
  }

  return toml.parse(fs.readFileSync(configPath));
}

function set(id, key, value) {
  if (id[0] === "@") {
    id = id.slice(1);
  }
  let configPath = path.join(
    identitiesFolder,
    _.kebabCase(id.slice(0, 10)),
    "ponchowonky.toml",
  );

  const defaultIdentity = getDefaultIdentity();

  if (defaultIdentity?.keys?.id.slice(1) == id) {
    configPath = path.join(defaultIdentity.path, "ponchowonky.toml");
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, toml.stringify(minimalConfig));
  }

  const configuration = toml.parse(fs.readFileSync(configPath));

  configuration[key] = value;

  console.log(`saving ${configPath}`);
  fs.writeFileSync(configPath, toml.stringify(configuration));

  return configuration;
}

function create() {
  const tempPath = path.join(identitiesFolder, "temp");
  const secretPath = path.join(tempPath, "secret");

  fs.ensureDirSync(tempPath);

  const keys = ssbKeys.loadOrCreateSync(secretPath);
  const newPath = pathForIdentity(keys.public);

  fs.renameSync(tempPath, newPath);

  const configFile = path.join(newPath, "ponchowonky.toml");
  fs.writeFileSync(configFile, toml.stringify(minimalConfig));

  return { public: keys.public, path: newPath };
}

function importFromKeys(name, keysAsText) {
  const tempPath = path.join(identitiesFolder, "temp");
  const secretPath = path.join(tempPath, "secret");

  fs.ensureDirSync(tempPath);

  fs.writeFileSync(secretPath, keysAsText);

  const keys = ssbKeys.loadOrCreateSync(secretPath);
  const newPath = pathForIdentity(keys.public);

  fs.renameSync(tempPath, newPath);

  const configFile = path.join(newPath, "ponchowonky.toml");
  const config = {};
  Object.assign(config, minimalConfig);
  if (name) {
    config.name = name;
  }
  config.imported = true;
  fs.writeFileSync(configFile, toml.stringify(config));

  // hard to start without peers. If there is a default
  // identity, then copy conn.

  const defaultIdentity = getDefaultIdentity();

  if (defaultIdentity?.path) {
    const connFileForDefaultIdentity = path.join(
      defaultIdentity.path,
      "conn.json",
    );

    if (fs.existsSync(connFileForDefaultIdentity)) {
      fs.copyFileSync(
        connFileForDefaultIdentity,
        path.join(newPath, "conn.json"),
      );
    }
  }

  return { public: keys.public, path: newPath };
}

function importFromWords(name, words) {
  const tempPath = path.join(identitiesFolder, "temp");
  const secretPath = path.join(tempPath, "secret");

  fs.ensureDirSync(tempPath);

  let keys = mnemonic.wordsToKeys(words);

  console.log("from words", keys);

  const keysAsText = JSON.stringify(keys);

  fs.writeFileSync(secretPath, keysAsText);

  keys = ssbKeys.loadOrCreateSync(secretPath);
  const newPath = pathForIdentity(keys.public);

  fs.renameSync(tempPath, newPath);

  const configFile = path.join(newPath, "ponchowonky.toml");
  const config = {};
  Object.assign(config, minimalConfig);
  if (name) {
    config.name = name;
  }
  config.imported = true;
  fs.writeFileSync(configFile, toml.stringify(config));

  // hard to start without peers. If there is a default
  // identity, then copy conn.

  const defaultIdentity = getDefaultIdentity();

  if (defaultIdentity?.path) {
    const connFileForDefaultIdentity = path.join(
      defaultIdentity.path,
      "conn.json",
    );

    if (fs.existsSync(connFileForDefaultIdentity)) {
      fs.copyFileSync(
        connFileForDefaultIdentity,
        path.join(newPath, "conn.json"),
      );
    }
  }

  return { public: keys.public, path: newPath };
}

function remove(identity) {
  const p = pathForIdentity(identity);

  if (fs.existsSync(p)) {
    fs.removeSync(p);
    return true;
  } else {
    return false;
  }
}

function list() {
  const isDirectory = (i) => fs.lstatSync(i).isDirectory();
  let identities = [];

  if (fs.existsSync(identitiesFolder)) {
    const everything = fs.readdirSync(identitiesFolder);

    identities = everything
      .map((i) => path.join(identitiesFolder, i))
      .filter(isDirectory)
      .map((f) => {
        const s = path.join(f, "secret");
        const keys = ssbKeys.loadOrCreateSync(s);
        return { keys, path: f };
      });
  }

  // check for ~/.ssb/secret, add it to the list as first.
  const defaultIdentity = getDefaultIdentity();

  if (defaultIdentity) {
    identities = [defaultIdentity, ...identities];
  }

  return identities;
}

function openManager() {
}

module.exports = {
  create,
  remove,
  list,
  pathForIdentity,
  configurationForIdentity,
  getDefaultIdentity,
  set,
  importFromKeys,
  importFromWords,
};
