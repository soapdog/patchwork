const { h, Value, when, map, computed, Array: MutantArray } = require("mutant");
const electron = require("electron");
const Identities = require("./identities.js");
const themes = require("../styles/index.js");
const { shell } = require("electron");
const ssbCaps = require("ssb-caps");
const crypto = require("node:crypto");
const path = require("path");
const broadcast = require("broadcast-stream");
const requireStyle = (moduleName, specificFilePath = false) => {
  const stylesPath = path.join(__dirname, "../styles", moduleName);
  const filePath = !specificFilePath
    ? path.resolve(stylesPath, `${moduleName}.css`)
    : path.resolve(stylesPath, specificFilePath);
  const urlStr = `@import "${filePath}"`;
  return urlStr;
};

module.exports = function (config) {
  const currentView = Value("list");

  document.head.appendChild(
    h("style", {
      innerHTML: themes.light,
    }),
  );

  /*
== EPHEMERAL NETWORK LIST VIEW ===========================================================================================================
  */

  const existingNetworks = MutantArray([]);
  const port = "9300";
  const local = broadcast(port);

  local.on("data", function (buf) {
    if (buf.loopback) return;
    var data = buf.toString();
    var config = JSON.parse(data);
    if (config) {
      console.log("found network via UDP broadcast", config);

      if (
        !existingNetworks.find((n) => {
          return n.caps.shs == config.caps.shs;
        })
      ) {
        existingNetworks.push(config);
      }
    }
  });

  const refreshExistingNetworks = () => {
    const ephemeralIdentities = Identities.listEphemeral();
    const networks = ephemeralIdentities
      .map((i) => {
        const config = Identities.configurationForIdentity(i.keys.id);
        return config.ephemeral;
      });

    console.dir(networks);
    existingNetworks.set(networks);
  };

  electron.ipcRenderer.on("refresh-existing-networks", () => {
    refreshExistingNetworks();
  });

  refreshExistingNetworks();

  const header = h("header", [
    h("h1", "Poncho Wonky Ephemeral Networks Manager"),
    h("Spacer"),
    h("button", {
      "ev-click": (_ev) => {
        currentView.set("edit");
      },
    }, "Create New Ephemeral Network"),
  ]);

  const networkCard = (network) => {
    return h("NetworkCard", [
      h("h3", [h("span -Keys", network.name)]),
      h("p", network.description),
      h("Actions", [
        h("button", {
          "ev-click": (_ev) => {
            const i = Identities.createEphemeral(network);
            refreshExistingNetworks();
            currentView.set("list");
            electron.ipcRenderer.send("open-identity", i);
          },
        }, "Join"),
        h("div.spacer"),
      ]),
    ]);
  };

  const content = h(
    "Networks",
    h("content", map(existingNetworks, (i) => networkCard(i))),
  );

  const listView = [header, content];

  /*
== EPHEMERAL NETWORK EDITOR ===========================================================================================================
  */

  const networkName = Value();
  const networkDescription = Value();

  const editHeader = h("header", [
    h("h1", "Create Ephemeral Network"),
    h("Spacer"),
    h("button", {
      "ev-click": (_ev) => {
        currentView.set("list");
      },
    }, "Back"),
  ]);

  const editForm = h("form", [
    h("label", { for: "name" }, "Network Name"),
    h("input", {
      type: "text",
      value: networkName,
      "ev-change": (ev) => {
        networkName.set(ev.target.value);
      },
    }),
    //
    h("label", { for: "name" }, "Description"),
    h("input", {
      type: "text",
      value: networkDescription,
      "ev-change": (ev) => {
        networkDescription.set(ev.target.value);
      },
    }),
    //
    h(
      "p",
      `When you create a new ephemeral network, Poncho Wonky also creates a new identity for you in it. You can see it in the identities manager afterwards.`,
    ),
    h("button", {
      "ev-click": (ev) => {
        ev.preventDefault();
        const newCaps = Object.assign({}, ssbCaps);
        newCaps.shs = crypto.randomBytes(32).toString("base64");
        // make sure it is not mainnet
        while (newCaps.shs === "1KHLiKZvAvjbY1ziZEHMXawbCEIM6qwjCDm3VYRan/s=") {
          newCaps.shs = crypto.randomBytes(32).toString("base64");
        }
        const network = {
          name: networkName(),
          description: networkDescription(),
          caps: newCaps,
        };
        console.dir(network);
        const i = Identities.createEphemeral(network);
        refreshExistingNetworks();
        currentView.set("list");
        electron.ipcRenderer.send("open-identity", i);
      },
    }, "Create Network"),
  ]);

  const editView = [editHeader, editForm];

  /*
== VIEW MANAGEMENT ===========================================================================================================
  */

  const viewToShow = computed([currentView], (c) => {
    let vt;
    switch (c) {
      case "list":
        vt = listView;
        break;
      case "edit":
        vt = editView;
        break;
    }
    return vt;
  });

  const allViews = h("EphemeralNetworksManager", viewToShow);

  return allViews;
};
