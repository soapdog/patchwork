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
  const currentView = Value("list");

  document.head.appendChild(
    h("style", {
      innerHTML: themes.light,
    }),
  );

  /*
== IDENTITY LIST VIEW ===========================================================================================================
  */

  const header = h("header", [
    h("h1", "Poncho Wonky Identity Manager"),
    h("Spacer"),
    h("button", {
      "ev-click": (_ev) => {
        Identities.create();
        identities.set(Identities.list());
      },
    }, "Create New Identity"),
    h("button", {
      "ev-click": (_ev) => {
        currentView.set("import-file");
      },
    }, "Import Identity From File"),
    h("button", {
      "ev-click": (_ev) => {
        currentView.set("import-words");
      },
    }, "Import Identity From Words"),
  ]);

  const identities = MutantArray(Identities.list());

  const identityCard = (identity) => {
    const config = Identities.configurationForIdentity(identity.keys.id);
    const name = config.name === "Untitled Identity"
      ? identity.keys.id
      : config.name;
    return h("IdentityCard", [
      h("h3", [h("span -Keys", name)]),
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
            editIdentity(identity);
          },
        }, "Edit"),
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

  const listView = [header, content];

  /*
== IDENTITY EDITOR ===========================================================================================================
  */

  const currentIdentity = Value();

  const currentIdentityKey = computed([currentIdentity], (c) => {
    if (!c) return;
    return c.keys.id;
  });

  const currentIdentityName = computed([currentIdentityKey], (id) => {
    if (!id) return;
    const config = Identities.configurationForIdentity(id);

    return config.name;
  });

  function editIdentity(identity) {
    currentIdentity.set(identity);
    currentView.set("edit");
  }

  const editHeader = h("header", [
    h("h1", "Editing Identity"),
    h("Spacer"),
    h("button", {
      "ev-click": (_ev) => {
        currentView.set("list");
      },
    }, "Back"),
  ]);

  const editForm = h("form", [
    h("label", { for: "name" }, "Identity Name"),
    h("input", {
      type: "text",
      placeholder: currentIdentityKey,
      value: currentIdentityName,
      "ev-change": (ev) => {
        const i = currentIdentity();
        Identities.set(i.keys.id, "name", ev.target.value);
        currentIdentity.set(i);
      },
    }),
    //
    h("label", { for: "name" }, "Public Key"),
    h("input", {
      type: "text",
      disabled: true,
      placeholder: currentIdentityKey,
      value: currentIdentityKey,
    }),
    //
    h("label", { for: "remote" }, "Remote"),
    h("input", {
      type: "text",
      placeholder: "fill-in custom remote",
      value: "",
    }),
  ]);

  const editView = [editHeader, editForm];

  /*
== IMPORT FROM FILE ===========================================================================================================
  */

  const nameForNewIdentity = Value();
  const secretForNewIdentity = Value();

  const importFileForm = h("form", [
    h("label", { for: "name" }, "Name for new identity"),
    h("input", {
      type: "text",
      placeholder: "this is just for the identity list",
      "ev-change": (ev) => {
        nameForNewIdentity.set(ev.target.value);
      },
    }),
    //
    h("label", { for: "name" }, "Select Secret File"),
    h("input", {
      type: "file",
      "ev-change": (ev) => {
        const file = ev.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          secretForNewIdentity.set(e.target.result);
        };
        reader.readAsText(file);
      },
    }),
    h("div", [
      h("button", {
        "ev-click": (ev) => {
          let newIdentity = Identities.importFromKeys(
            nameForNewIdentity(),
            secretForNewIdentity(),
          );
          if (newIdentity.path) {
            identities.set(Identities.list());
            currentView.set("list");
          }
        },
      }, "Import"),
    ]),
  ]);

  const importFileView = [editHeader, importFileForm];
  /*
== IMPORT FROM WORDS ===========================================================================================================
  */

  const wordsForNewIdentity = Value();

  const importWordsForm = h("form", [
    h("label", { for: "name" }, "Name for new identity"),
    h("input", {
      type: "text",
      placeholder: "this is just for the identity list",
      "ev-change": (ev) => {
        nameForNewIdentity.set(ev.target.value);
      },
    }),
    //
    h("label", { for: "name" }, "Type The Words From Manyverse Export"),
    h("textarea", {
      "ev-change": (ev) => {
        wordsForNewIdentity.set(ev.target.value);
      },
    }),
    h("div", [
      h("button", {
        "ev-click": (ev) => {
          let newIdentity = Identities.importFromWords(
            nameForNewIdentity(),
            wordsForNewIdentity(),
          );
          if (newIdentity.path) {
            identities.set(Identities.list());
            currentView.set("list");
          }
        },
      }, "Import"),
    ]),
  ]);

  const importWordsView = [editHeader, importWordsForm];

  /*
== VIEW MANAGEMENT ===========================================================================================================
  */

  const viewToShow = computed([currentView], (c) => {
    let vt;
    // clear some values when switching views
    nameForNewIdentity.set();
    secretForNewIdentity.set();
    switch (c) {
      case "list":
        vt = listView;
        break;
      case "edit":
        vt = editView;
        break;
      case "import-file":
        vt = importFileView;
        break;
      case "import-words":
        vt = importWordsView;
        break;
    }
    return vt;
  });

  const allViews = h("IdentityManager", viewToShow);

  return allViews;
};
