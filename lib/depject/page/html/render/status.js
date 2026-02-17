const {
  computed,
  onceTrue,
  Array: MutantArray,
  h,
  Dict,
  map,
  dictToCollection,
} = require("mutant");
const nest = require("depnest");
const renderProgress = require("../../../../progress/html/render");
const pull = require("pull-stream");

exports.needs = nest({
  "sbot.pull.stream": "first",
  "sbot.obs.connection": "first",
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

    const peers = MutantArray([]);

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

    if (path !== "/status") return;
    const i18n = api.intl.sync.i18n;

    onceTrue(api.sbot.obs.connection, (sbot) => {
      sbot.gossip.peers((err, data) => {
        console.log(err);
        console.log(data);
        if (data) {
          peers.set(data);
        }
      });
    });

    const prepend = [
      h("PageHeading", [
        h("h1", [
          h("strong", i18n("Status")),
        ]),
      ]),
    ];

    return h("Scroller", { style: { overflow: "auto" } }, [
      h("div.wrapper", [
        h("section.prepend", prepend),
        h("section.content", [
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
          h("h2", i18n("Peers")),
          h("table", [
            h(
              "thead",
              h("tr", [
                h("th", "host"),
                h("th", "port"),
                h("th", "key"),
              ]),
            ),
            h(
              "tbody",
              map(peers, (peer) => {
                return h("tr", [
                  h("td", peer.host),
                  h("td", peer.port),
                  h("td", peer.key)
                ]);
              }),
            ),
          ]),
        ]),
      ]),
    ]);
  });
};
