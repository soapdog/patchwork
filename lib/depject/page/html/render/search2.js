const { h, map, when, computed, Array: MutantArray, Value } = require(
  "mutant",
);
const nest = require("depnest");
const pull = require("pull-stream");
const electron = require("electron");
const TextNodeSearcher = require("text-node-searcher");
const whitespace = /\s+/;
const escapeStringRegexp = require("escape-string-regexp");

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
    let rawResults;

    electron.ipcRenderer.send("search", terms);

    electron.ipcRenderer.on("search-results", (ev, rs) => {
      console.log(`result set from search: ${terms}`, rs);
      rawResults = rs;
      const sorted = sortMessages(rs, "date");
      console.log(`result after sorting`, sorted);
      results.set(sorted);
      showSpinner(false);
    });

    electron.ipcRenderer.on("search-unavailable", (ev) => {
      showSpinner.set(true);
      setTimeout(() => {
        console.log("searching again...");
        electron.ipcRenderer.send("search", terms);
      }, 15000);
    });

    const showSpinner = (b) => {
      if (b) {
        document.getElementById("spinner").style.display = "block";
        document.getElementById("search-results").style.display = "none";
      } else {
        document.getElementById("spinner").style.display = "none";
        document.getElementById("search-results").style.display = "block";
      }
    };

    const sortMessages = (rs, sortBy) => {
      let res;
      console.log("sorting by", sortBy);
      console.log("result set size", rs.length);
      if (sortBy == "date") {
        const msgs = [];
        for (const i of rs) {
          const msg = JSON.parse(i.raw);
          msgs.push(msg);
        }
        const res = msgs.toSorted((a, b) => {
          return b.value.timestamp - a.value.timestamp;
        });
        return res;
      } else if (sortBy == "best match") {
        const msgs = [];

        for (const i of rs) {
          const msg = JSON.parse(i.raw);
          msg.score = i.score;
          msgs.push(msg);
        }
        const res = msgs.toSorted((a, b) => {
          if (a.score > b.score) {
            return -1;
          } else {
            return 1;
          }
        });
        return res;
      }
    };

    const count = computed(results, (rs) => {
      return rs.length;
    });

    const prepend = [
      h("PageHeading", [
        h("h1", [h("strong", [i18n("Search"), ": ", terms])]),
      ]),
    ];

    const spinnerContent = [
      h("Loading -search", {
        id: "spinner",
      }),
    ];

    const highlight = (el, query) => {
      if (el) {
        const searcher = new TextNodeSearcher({ container: el });
        searcher.query = query;
        searcher.highlight();
        return el;
      }
    };

    const createOrRegExp = (ary) => {
      return new RegExp(
        ary.map(function (e) {
          return "\\b" + escapeStringRegexp(e) + "\\b";
        }).join("|"),
        "i",
      );
    };

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
          showSpinner(true);
          const sorted = sortMessages(rawResults, "best match");
          results.set(sorted);
          showSpinner(false);
        },
      }, "Sort by Best Match"),
    ]);

    const sortByTimestamp = h("div", [
      h("button", {
        "ev-click": (_ev) => {
          showSpinner(true);
          const sorted = sortMessages(rawResults, "date");
          results.set(sorted);
          showSpinner(false);
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
        {
          id: "search-results",
        },
        map(results, (msg) => {
          const el = h(
            "FeedEvent",
            api.message.html.render(msg, {
              renderUnknown: true,
              outOfContext: true,
            }),
          );
          highlight(el, createOrRegExp(terms.split(whitespace)));
          return el;
          // const e = api.message.html.render(msg);
          // return h("div", {
          //   style: {
          //     padding: "10px",
          //   },
          // }, e);
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
        h("section.content", [resultContent, spinnerContent]),
      ]),
    ]);
  });
};
