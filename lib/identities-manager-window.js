const { h, Value, map, computed, Array: MutantArray } = require("mutant");
const electron = require("electron");
const Identities = require("./identities.js");
const themes = require("../styles");
const { shell } = require("electron");
const path = require("path");
const requireStyle = (moduleName, specificFilePath = false) => {
  const stylesPath = path.join(__dirname, "../styles", moduleName);
  const filePath = !specificFilePath
    ? path.resolve(stylesPath, `${moduleName}.css`)
    : path.resolve(stylesPath, specificFilePath);
  const urlStr = `@import "${filePath}"`;
  return urlStr;
};

module.exports = function (config) {
  document.head.appendChild(
    h("style", {
      innerHTML: themes.light,
    }),
  );

  const header = h("header", [
    h("h1", "Poncho Wonky Identity Manager"),
    h("Spacer"),
    h("button", {
      "ev-click": (_ev) => {
        Identities.create();
        identities.set(Identities.list());
      },
    }, "Create New Identity"),
    h("button", "Import Identity"),
  ]);

  const identities = MutantArray(Identities.list());

  const identityCard = (identity) => {
    return h("IdentityCard", [
      h("p", ["id: ", h("span -Keys", identity.keys.id)]),
      h("p", ["path: ", h("span -Path", identity.path)]),
      h("Actions", [
        h("button", {
          "ev-click": (_ev) => {
            try {
              electron.ipcRenderer.send("open-identity", identity);
            } catch (e) {
              console.log("e", e);
            }
          },
        }, "Open"),
        h("div.spacer"),
        h("button", {
          "ev-click": (_ev) => {
            shell.openExternal(`file:${identity.path}`);
          },
        }, "Show Files"),
      ]),
    ]);
  };

  const content = h(
    "Identities",
    h("content", map(identities, (i) => identityCard(i))),
  );

  const footer = h("footer", []);

  return h("IdentityManager", [header, content, footer]);
};
