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
    const showSpinner = Value(true);
    const sortingStrategy = Value("date");

    electron.ipcRenderer.send("search", terms);

    electron.ipcRenderer.on("search-results", (ev, rs) => {
      showSpinner.set(false);
      results.set(rs);
      console.log(`result set from search: ${terms}`, rs);
    });

    electron.ipcRenderer.on("search-unavailable", (ev) => {
      showSpinner.set(true);
      setTimeout(() => {
        console.log("searching again...");
        electron.ipcRenderer.send("search", terms);
      }, 15000);
    });

    const resultMessages = computed(
      [results, sortingStrategy],
      (rs, sortBy) => {
        let res;
        console.log("sorting by", sortBy)
        console.log("result set size", rs.length)
        showSpinner.set(true)
        if (sortBy == "date") {
          const msgs = [];
          for (const i of rs) {
            const msg = JSON.parse(i.raw);
            msgs.push(msg);
          }
          const res = msgs.toSorted((a, b) => {
            if (a.value.timestamp > a.value.timestamp) {
              return 1
            } else {
              return -1
            }
          });
          showSpinner.set(false)
          return res
        } else if (sortBy == "best match") {
          const msgs = [];

          for (const i of rs) {
            const msg = JSON.parse(i.raw);
            msg.score = i.score;
            msgs.push(msg);
          }
          const res = msgs.toSorted((a, b) => {
            if (a.score > b.score) {
              return 1
            } else {
              return -1
            }
          });
          showSpinner.set(false)
          return res
        }
      },
    );

    const count = computed(results, (rs) => {
      return rs.length;
    });

    const prepend = [
      h("PageHeading", [
        h("h1", [h("strong", [i18n("Search"), ": ", terms])]),
      ]),
    ];

    const spinnerContent = [
      h("Loading -search"),
    ];

    const resultCount = h(
      "div",
      h("h3", [
        `Found `,
        count,
        ` matches.`,
      ]),
    );

    const sortByBestMatch = h("div", [
      h("button", {
        "ev-click": (_ev) => {
          sortingStrategy.set("best match");
        },
      }, "Sort by best match"),
    ]);

    const sortByTimestamp = h("div", [
      h("button", {
        "ev-click": (_ev) => {
          sortingStrategy.set("date");
        },
      }, "Sort by Date"),
    ]);

    const resultContent = [
      h("SearchControls", [
        resultCount,
        h("-spacer"),
        sortByBestMatch,
        sortByTimestamp,
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
        h("section.content", when(showSpinner, spinnerContent, resultContent)),
      ]),
    ]);
  });
};
