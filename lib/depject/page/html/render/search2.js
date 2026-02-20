const { h, computed, when, onceTrue, map, Array: MutantArray, Value } = require(
  "mutant",
);
const nest = require("depnest");
const pull = require("pull-stream");
const electron = require("electron");

exports.needs = nest({
  "feed.html.rollup": "first",
  "sbot.pull.resumeStream": "first",
  "sbot.pull.stream": "first",
  "sbot.obs.connection": "first",
  "blogs.sheet.compose": "first",
  "intl.sync.i18n": "first",
  "message.html.render": "first",
});

exports.gives = nest("page.html.render");

exports.create = function (api) {
  const i18n = api.intl.sync.i18n;
  return nest("page.html.render", function channel(path) {
    if (!path.startsWith("?")) return;

    const terms = path.slice(1);
    const results = MutantArray([]);
    const searching = Value("searching...");
    console.log(`terms: ${terms}`);

    electron.ipcRenderer.send("search", terms);

    electron.ipcRenderer.on("search-results", (ev, rs) => {
      searching.set("done.");
      results.set(rs.toSorted((a,b) => {
        const aa = JSON.parse(a.raw)
        const bb = JSON.parse(b.raw)
        return bb.value.timestamp - aa.value.timestamp
      }));
    });

    electron.ipcRenderer.on("search-unavailable", (ev) => {
      searching.set("Still loading indexing data, trying again in 15 secs...");
      setTimeout(() => {
        console.log("searching again...")
        electron.ipcRenderer.send("search", terms);
      }, 15000);
    });

    const resultMessages = computed(results, (rs) => {
      const msgs = [];

      for (const i of rs) {
        const msg = JSON.parse(i.raw);
        msgs.push(msg);
      }

      msgs.sort((a, b) => {
        a.value.timestamp < b.value.timestamp;
      });
      return msgs;
    });

    const count = computed(results, (rs) => {
      return rs.length;
    });

    const prepend = [
      h("PageHeading", [
        h("h1", [h("strong", [i18n("Search"), ": ", terms])]),
      ]),
    ];

    const content = [
      h("h3", [
        " Status: ",
        searching,
        " Result Count: ",
        count,
        " ",
      ]),
      h(
        "section",
        map(resultMessages, (msg) => {
          const e = api.message.html.render(msg);
          return h("div", {
            style: {
              padding: "10px",
            },
          }, e);
        }),
      ),
    ];

    return h("Scroller", {
      style: {
        "overflow": "auto",
      },
    }, [
      h("div.wrapper", [
        h("section.prepend", prepend),
        h("section.content", content)
      ])
    ])
  });
};
