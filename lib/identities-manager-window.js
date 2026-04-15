const { h, Value, when, map, computed, Array: MutantArray } = require("mutant");
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

  const runningIdentities = MutantArray();
  const identities = MutantArray(Identities.list());

  const refreshRunningIdentities = () => {
    electron.ipcRenderer.invoke("get-running-identities").then((result) => {
      runningIdentities.set(result);
      identities.set(Identities.list());
    });
  };

  electron.ipcRenderer.on("refresh-running-identities", () => {
    refreshRunningIdentities();
  });

  refreshRunningIdentities();

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
    h("button", {
      "ev-click": (_ev) => {
        currentView.set("add-remote");
      },
    }, "Add Remote Identity"),
  ]);

  const identityCard = (identity) => {
    const config = Identities.configurationForIdentity(identity.keys.id);
    const name = config.name === "Untitled Identity"
      ? identity.keys.id
      : config.name;
    return h("IdentityCard", [
      h("h3", [h("span -Keys", name)]),
      h("p", ["id: ", h("span -Keys", identity.keys.id)]),
      h("p", ["path: ", h("span -Path", identity.path)]),
      when(
        config?.remote,
        h("p", ["remote: ", h("span -Keys", config.remote)]),
      ),
      h("Actions", [
        when(
          runningIdentities.includes(identity.keys.id),
          // STOP
          [
            h("button -stop", {
              "ev-click": (_ev) => {
                try {
                  electron.ipcRenderer.send("stop-identity", identity.keys.id);
                  setTimeout(() => {
                    refreshRunningIdentities();
                  }, 1000);
                } catch (e) {
                  console.log("e", e);
                }
              },
            }, "Stop"),
            h("button", {
              "ev-click": (_ev) => {
                electron.ipcRenderer.send("debug-server", identity.keys.id);
              },
            }, "Debug"),
          ],
          // RUN
          h("button", {
            "ev-click": (_ev) => {
              try {
                electron.ipcRenderer.send("open-identity", identity);

                // wait a bit, double check running identities.
                setTimeout(() => {
                  refreshRunningIdentities();
                }, 1000);
              } catch (e) {
                console.log("e", e);
              }
            },
          }, "Open"),
        ),
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

  const currentRemote = computed([currentIdentityKey], (id) => {
    if (!id) return;

    const config = Identities.configurationForIdentity(id);

    return config?.remote;
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
      value: currentRemote,
      "ev-change": (ev) => {
        const i = currentIdentity();
        Identities.set(i.keys.id, "remote", ev.target.value);
        currentIdentity.set(i);
      },
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
      h("p", [
        h("strong", "Attention: "),
        `Be very careful when importing an account. 
        You need to wait until it finishes downloading all previous data. 
        If you can still launch your old account, double check your last message and make sure 
        you can see it before you attempt to post with the new account. 
        If you attempt to post before it finishes downloading, you will gonna break your account in a irreversible way. `,
        h(
          "strong",
          "Do not attempt to use the account in your old device after importing it.",
        ),
      ]),
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
      h("p", [
        h("strong", "Attention: "),
        `Be very careful when importing an account. 
        You need to wait until it finishes downloading all previous data. 
        If you can still launch your old account, double check your last message and make sure 
        you can see it before you attempt to post with the new account. 
        If you attempt to post before it finishes downloading, you will gonna break your account in a irreversible way. `,
        h(
          "strong",
          "Do not attempt to use the account in your old device after importing it.",
        ),
      ]),
    ]),
  ]);

  const importWordsView = [editHeader, importWordsForm];

  /*
  == ADD REMOTE IDENTITY ===========================================================================================================
  */

  const remoteForImportedIdentity = Value();

  const addRemoteForm = h("form", [
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
    //
    h(
      "label",
      { for: "remote" },
      "Remote (format is protocol:ip:port, example: 'net:192.168.1.2:8008')",
    ),
    h("input", {
      type: "text",
      placeholder: "fill-in custom remote",
      value: remoteForImportedIdentity,
      "ev-change": (ev) => {
        remoteForImportedIdentity.set(ev.target.value);
      },
    }),
    h("div", [
      h("button", {
        "ev-click": (ev) => {
          ev.preventDefault();
          let newIdentity = Identities.importFromKeys(
            nameForNewIdentity(),
            secretForNewIdentity(),
          );
          if (newIdentity.path) {
            Identities.set(
              newIdentity.public,
              "remote",
              remoteForImportedIdentity(),
            );
            identities.set(Identities.list());
            currentView.set("list");
          }
        },
      }, "Add"),
      h("p", [
        h("strong", "Attention: "),
        `This is a remote identity, it won't store data in your local manchine beyond the secret and the configuration. 
        You won't have access to this account if the remote is unreachable. Be aware you can't remote drive a Manyverse instance, 
        Manyverse only accepts connections from the localhost`,
      ]),
    ]),
  ]);

  const addRemoteView = [editHeader, addRemoteForm];

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
      case "add-remote":
        vt = addRemoteView;
        break;
    }
    return vt;
  });

  const allViews = h("IdentityManager", viewToShow);

  return allViews;
};
