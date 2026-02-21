const fs = require("fs");
const fsp = require("fs").promises;
const Path = require("path");
const electron = require("electron");
const spawn = require("child_process").spawn;
const fixPath = require("fix-path");
const MiniSearch = require("minisearch");
const pull = require("pull-stream");
const { encode, decode } = require("@msgpack/msgpack");

const createSbot = require("secret-stack")()
  .use(require("ssb-db"))
  .use(require("ssb-conn"))
  .use(require("ssb-lan"))
  .use(require("ssb-logging"))
  .use(require("ssb-master"))
  .use(require("ssb-no-auth"))
  .use(require("ssb-replicate"))
  .use(require("ssb-unix-socket"))
  .use(require("ssb-friends")) // not strictly required, but helps ssb-conn a lot
  .use(require("ssb-blobs"))
  .use(require("ssb-backlinks"))
  .use(
    require("ssb-social-index")({
      namespace: "about",
      type: "about",
      destField: "about",
    }),
  )
  .use(require("ssb-private"))
  .use(require("ssb-room/tunnel/client"))
  .use(require("ssb-dht-invite"))
  .use(require("ssb-invite"))
  .use(require("ssb-query"))
  .use(require("ssb-search"))
  .use(require("ssb-ws"))
  .use(require("ssb-tags"))
  .use(require("ssb-ebt"))
  .use(require("./plugins"));

fixPath();

module.exports = function (ssbConfig) {
  const context = {
    sbot: createSbot(ssbConfig),
    config: ssbConfig,
  };
  ssbConfig.manifest = context.sbot.getManifest();
  fs.writeFileSync(
    Path.join(ssbConfig.path, "manifest.json"),
    JSON.stringify(ssbConfig.manifest),
  );
  try {
    electron.ipcRenderer.send("server-started", ssbConfig);
  } catch (e) {
    console.log("e", e);
  }

  // check if we are using a custom ssb path (which would break git-ssb-web)
  if (!ssbConfig.customPath) {
    // attempt to run git-ssb if it is installed and in path
    const gitSsb = spawn("git-ssb", ["web"], {
      stdio: "inherit",
    });
    gitSsb.on("error", () => {
      console.log("git-ssb is not installed, or not available in path");
    });
    process.on("exit", () => {
      gitSsb.kill();
    });
  }

  /*
  == Search Indexing ===========================================================================================================
  */
  let lastIndexedTimestamp = 0;

  const minisearchIndexPath = Path.join(
    ssbConfig.path,
    "minisearch.index.messagepack",
  );
  const minisearchControlPath = Path.join(
    ssbConfig.path,
    "minisearch.control.messagepack",
  );

  const loadOrCreateMiniSearch = async () => {
    let controlData;
    let indexData;
    let miniSearch = new MiniSearch({
      idField: "key",
      fields: ["content"],
      storeFields: ["key", "content", "raw", "timestamp"],
    });

    if (
      fs.existsSync(minisearchControlPath) && fs.existsSync(minisearchIndexPath)
    ) {
      // load previous saved work.
      console.log(`loading search index data...`);
      controlData = decode(await fsp.readFile(minisearchControlPath));
      console.time("loading file");
      indexData = decode(await fsp.readFile(minisearchIndexPath));
      console.timeEnd("loading file");
      console.time("loadJS");
      miniSearch = await MiniSearch.loadJSAsync(indexData, {
        idField: "key",
        fields: ["content"],
        storeFields: ["key", "content", "raw", "timestamp"],
      });
      console.timeEnd("loadJS");
      console.log(`loaded search index data.`);
      console.log(
        `Last indexed timestamp: ${controlData.lastIndexedTimestamp}`,
      );
      lastIndexedTimestamp = controlData.lastIndexedTimestamp;
    }
    return { miniSearch, controlData, indexData };
  };

  const loadMessagesIntoSearchIndex = (
    { miniSearch, controlData, indexData },
  ) => {
    console.log("Starting message indexing pull stream...");
    pull(
      context.sbot.messagesByType({
        type: "post",
        live: true,
        gt: lastIndexedTimestamp,
      }),
      pull.map((m) => {
        // console.log("mapping", m);
        if (m.sync) return m;
        return {
          key: m.key,
          timestamp: m.timestamp,
          content: m.value?.content?.text,
          raw: JSON.stringify(m),
        };
      }),
      pull.drain((m) => {
        if (m.sync) {
          // finished indexing
          console.log(`finished indexing for now ${lastIndexedTimestamp}`);

          controlData = {
            lastIndexedTimestamp,
          };

          indexData = miniSearch.toJSON();
          const encodedIndex = encode(indexData);
          const encodedControl = encode(controlData);

          fs.writeFileSync(minisearchIndexPath, encodedIndex);
          fs.writeFileSync(minisearchControlPath, encodedControl);

          enableSearch(miniSearch)
          return;
        } else {
          miniSearch.add(m);
          console.log(miniSearch.documentCount);
          lastIndexedTimestamp = m.timestamp;
        }
      }),
    );
  };

  // load and start search engine

  electron.ipcRenderer.on("search", (ev, terms) => {
    electron.ipcRenderer.send("search-unavailable");
  });

  electron.ipcRenderer.on("is-search-available", (ev, terms) => {
    electron.ipcRenderer.send("search-unavailable");
  });

  electron.ipcRenderer.send("search-unavailable");

  const enableSearch = (miniSearch) => {
      // handle searches
    electron.ipcRenderer.removeAllListeners("search");
    electron.ipcRenderer.removeAllListeners("is-search-available");
    electron.ipcRenderer.on("is-search-available", (ev, terms) => {
      electron.ipcRenderer.send("search-available");
    });

    electron.ipcRenderer.send("search-available");

    electron.ipcRenderer.on("search", (ev, terms) => {
      const result = miniSearch.search(terms, { combineWith: "AND" });
      console.log(`result count: ${result.length}`);
      electron.ipcRenderer.send("search-results", result);
    });
  }

  loadOrCreateMiniSearch().then(({ miniSearch, controlData, indexData }) => {
    loadMessagesIntoSearchIndex({miniSearch, controlData, indexData});
  });
};
