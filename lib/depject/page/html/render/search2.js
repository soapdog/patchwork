const { h, computed, when, onceTrue, map, Array: MutantArray, Value } = require(
  "mutant",
);
const nest = require("depnest");
const pull = require("pull-stream");
const MiniSearch = require("minisearch");
const Abortable = require('pull-abortable')

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
    const indexSize = Value(0);
    const searching = Value("searching...");
    console.log("terms:", terms);

    const search = (terms) => {
      console.log("starting search...");
      const miniSearch = new MiniSearch({
        idField: "key",
        fields: ["content"],
        storeFields: ["key", "content", "raw"],
      });

      let goalIncrement = 10000;
      let goal = goalIncrement;
      const abortable = Abortable()

      onceTrue(api.sbot.obs.connection, (sbot) => {
        pull(
          sbot.messagesByType({
            type: "post",
            live: true,
            reverse: true,
            // limit: 10000,
          }),
          abortable,
          pull.map((m) => {
            // console.log("mapping", m);
            if (m.sync) return m;
            return {
              key: m.key,
              content: m.value?.content?.text,
              raw: JSON.stringify(m),
            };
          }),
          pull.drain((m) => {
            // console.log("draining", m);
            if (m.sync) {
              searching.set("done.");
              indexSize.set(miniSearch.documentCount);
              results.set(miniSearch.search(terms, { combineWith: 'AND' }));
              console.log(results());
              console.log(miniSearch.documentCount);
              console.log(resultMessages())
              return;
            }
            miniSearch.add(m);
            if (miniSearch.documentCount >= goal) {
              indexSize.set(miniSearch.documentCount);
              goal += goalIncrement;
              results.set(miniSearch.search(terms, { combineWith: 'AND' }));
              searching.set("searching...");
            }
          }),
        );
      });
    };

    setTimeout(() => {
      search(terms);
    }, 100);

    const stopSearch = (ev) => {
      abortable.abort()
      searching.set("stopped by the user.")
    }

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
      return rs.length
    })

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
        " Documents in index:",
        indexSize,
        " ",
        h("button", {
          "ev-click": stopSearch
        }, "Stop")
      ]),
      h(
        "Scroller",
        map(resultMessages, (msg) => {
          const e = api.message.html.render(msg);
          return h("div", {
            style: {
              padding: "10px"
            }
          },e);
        }),
      ),
    ];

    return h("section",{
          style: {
            "padding": "10px",
          },
        },[prepend, content]);
  });
};
