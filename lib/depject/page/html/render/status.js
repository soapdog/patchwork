const { computed, h, Dict, map, dictToCollection } = require("mutant");
const nest = require("depnest");
const renderProgress = require("../../../../progress/html/render");

exports.needs = nest({
  "sbot.pull.stream": "first",
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
    const pluginIndexesDict = Dict();
    const indexesJson = computed(
      [indexes, pluginIndexes],
      (indexes, plugins) => {
        Object.keys(plugins).forEach((k) => {
          pluginIndexesDict.put(
            k,
            calcProgress({
              target: indexes.target,
              start: indexes.start,
              current: plugins[k],
            }),
          );
        });
        return JSON.stringify({ indexes, plugins }, null, 4);
      },
    );
    const statusObj = computed([peer], (peer) => {
      return JSON.stringify(peer, null, 4);
    });
    const replicateProgress = api.progress.obs.replicate();
    const migration = api.progress.obs.migration();
    const migrationProgress = computed(migration, calcProgress);

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

            map(dictToCollection(pluginIndexesDict), (item) => {
              const v = calcProgress({
                target: indexes.target,
                start: indexes.start,
                current: item.value,
              });
              return h("ReportItem", [
                h("span.info", item.key),
                h("meter", {
                  style: { "margin-left": "10px" },
                  min: 0,
                  max: 1,
                  low: 0.3,
                  high: 0.6,
                  optimum: 0.9,
                  value: v,
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
    ]);
  });
};
