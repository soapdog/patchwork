const fs = require("fs");
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
  console.log("creating sbot");
  const context = {
    sbot: createSbot(ssbConfig),
    config: ssbConfig,
  };
  ssbConfig.manifest = context.sbot.getManifest();
  fs.writeFileSync(
    Path.join(ssbConfig.path, "manifest.json"),
    JSON.stringify(ssbConfig.manifest),
  );
  console.log("emit");
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
  let controlData;
  let indexData;

  const minisearchIndexPath = Path.join(
    ssbConfig.path,
    "minisearch.index.messagepack",
  );
  const minisearchControlPath = Path.join(
    ssbConfig.path,
    "minisearch.control.messagepack",
  );

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
    controlData = decode(fs.readFileSync(minisearchControlPath));
    console.time("loading file")
    indexData = decode(fs.readFileSync(minisearchIndexPath));
    console.timeEnd("loading file")
    console.time("loadJS")
    miniSearch = MiniSearch.loadJS(indexData, {
      idField: "key",
      fields: ["content"],
      storeFields: ["key", "content", "raw", "timestamp"],
    });
    console.timeEnd("loadJS")
    console.log(`loaded search index data.`);
    console.log(`Last indexed timestamp: ${controlData.lastIndexedTimestamp}`);
    lastIndexedTimestamp = controlData.lastIndexedTimestamp;
  }

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

        return;
      } else {
        console.log(miniSearch.documentCount);
        miniSearch.add(m);
        lastIndexedTimestamp = m.timestamp;
      }
    }),
  );
};
