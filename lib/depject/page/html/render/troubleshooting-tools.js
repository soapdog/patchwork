const { computed, h, Dict, map, dictToCollection, onceTrue } = require("mutant");
const nest = require("depnest");
const renderProgress = require("../../../../progress/html/render");
const fs = require("fs")
const Path = require("path")
const electron = require("electron")

exports.needs = nest({
  "sbot.pull.stream": "first",
  "sbot.obs.connection": "first",
  "config.sync.load": "first",
  "progress.obs": {
    indexes: "first",
    plugins: "first",
    replicate: "first",
    migration: "first",
    peer: "first",
  },
  "intl.sync.i18n": "first",
});

exports.gives = nest("page.html.render");

exports.create = function (api) {
  return nest("page.html.render", function channel(path) {
    const indexes = api.progress.obs.indexes();
    const indexProgress = computed(indexes, calcProgress);
    const pluginIndexes = api.progress.obs.plugins();
    const peer = api.progress.obs.peer();
    const indexesJson = computed(
      [indexes, pluginIndexes],
      (indexes, plugins) => {
        return JSON.stringify({ indexes, plugins }, null, 4);
      },
    );
    const pluginProgress = computed(
      [indexes, pluginIndexes],
      (indexes, plugins) => {
        const keys = Object.keys(plugins);
        const result = [];
        keys.forEach((k) => {
          const obj = {
            target: indexes.target,
            start: indexes.start,
            current: plugins[k],
          };
          result.push([k, calcProgress(obj)]);
        });
        return result;
      },
    );
    const statusObj = computed([peer], (peer) => {
      return JSON.stringify(peer, null, 4);
    });
    const replicateProgress = api.progress.obs.replicate();
    const migration = api.progress.obs.migration();
    const migrationProgress = computed(migration, calcProgress);
    const config = api.config.sync.load()

    function clamp(value) {
      return Math.min(1, Math.max(0, value)) || 0;
    }

    function calcProgress(progress) {
      const range = progress.target - progress.start;
      if (range) {
        return (progress.current - progress.start) / range;
      } else {
        return 1;
      }
    }

    function rebuildAllIndexes() {
       onceTrue(api.sbot.obs.connection, (ssb) => {
        ssb.rebuild((err) => {
          console.log(err)
        })
      })
    }

    function deletePrivateIndex() {
      console.dir(config)
      const flumePath = Path.join(config.path, "flume")
      const toUrlFriendly = require('base64-url').escape
      const key = `private-${toUrlFriendly(config.keys.public.slice(0, 9))}`
      const indexPath = Path.join(flumePath, key)
      console.log(indexPath)
      if (fs.existsSync(indexPath)) {
        fs.rmSync(indexPath, {recursive: true, force: true})
      }
      electron.ipcRenderer.send("relaunch-app")
    }

    if (path !== "/troubleshooting-tools") return;
    const i18n = api.intl.sync.i18n;


    const prepend = [
      h("PageHeading", [
        h("h1", [
          h("strong", i18n("Troubleshooting Tools")),
        ]),
      ]),
    ];

    return h("Scroller", { style: { overflow: "auto" } }, [
      h("div.wrapper", [
            h("section.prepend", prepend),
            h("section.content", [
        h("TroubleshootingTools", [
          // TOOLS
          h("div.col", [
            h("section", [
              h("h2", "Indexing Tools"),
              // rebuild all indexes
              h("button", {
                "ev-click": rebuildAllIndexes
              }, "Rebuild all indexes"),
              h("span", "This can take a very long time."),
              // delete private index
              h("button", {
                "ev-click": deletePrivateIndex
              }, "Delete private index"),
              h("span", "This will relaunch Patchwork.")
            ])
          ]),
          // REPORT ON INDEXES
          h("div.col", [
              h("h2", i18n("Indexing Report")),
              h("IndexingReport", [
                h("ReportItem", [
                  h("span.info", "Index"),
                  h("meter", {
                    style: { "margin-left": "10px" },
                    min: 0,
                    max: 1,
                    low: 0.3,
                    high: 0.6,
                    optimum: 0.9,
                    value: indexProgress,
                  }),
                ]),

                map(pluginProgress, (item) => {
                  return h("ReportItem", [
                    h("span.info", item[0]),
                    h("meter", {
                      style: { "margin-left": "10px" },
                      min: 0,
                      max: 1,
                      low: 0.5,
                      high: 0.9,
                      optimum: 0.97,
                      value: item[1],
                    }),
                  ]);
                }),
              ]),
              h("h2", "Raw data"),
              h("pre", [indexesJson]),
              h("h2", i18n("Extra Statuses")),
              h("pre", [statusObj]),
            ]),
          ]),
        ]),
      ]),
    ]);
  });
};
