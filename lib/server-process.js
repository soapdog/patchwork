const { configurationForIdentity, set } = require("./identities.js");

const fs = require("fs");
const fsp = require("fs").promises;
const Path = require("path");
const electron = require("electron");
const spawn = require("child_process").spawn;
const fixPath = require("fix-path");
const MiniSearch = require("minisearch");
const pull = require("pull-stream");
const { encode, decode } = require("@msgpack/msgpack");
const sqlite = require("node:sqlite");
const { DatabaseSync } = require("node:sqlite");

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
    serverlog("e", e);
  }

  // check if we are using a custom ssb path (which would break git-ssb-web)
  if (!ssbConfig.customPath) {
    // attempt to run git-ssb if it is installed and in path
    const gitSsb = spawn("git-ssb", ["web"], {
      stdio: "inherit",
    });
    gitSsb.on("error", () => {
      serverlog("git-ssb is not installed, or not available in path");
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

  // better log

  const serverlog = (...args) => {
    const msg = args.join(" ");
    console.log(`[SERVER] ${ssbConfig.keys.id} - ${msg}`);
  };

  // remove old search index.

  if (fs.existsSync(minisearchControlPath)) {
    serverlog("removing old minisearch control file");
    fs.rmSync(minisearchControlPath);
  }

  if (fs.existsSync(minisearchIndexPath)) {
    serverlog("removing old minisearch index file");
    fs.rmSync(minisearchIndexPath);
  }

  const sqliteIndexPath = Path.join(
    ssbConfig.path,
    "full-text-search.sqlite",
  );

  // load and start search engine

  electron.ipcRenderer.on("search", (ev, terms) => {
    electron.ipcRenderer.send("search-unavailable");
  });

  electron.ipcRenderer.on("is-search-available", (ev, terms) => {
    electron.ipcRenderer.send("search-unavailable");
  });

  electron.ipcRenderer.send("search-unavailable");

  const loadOrCreateSqlite = async () => {
    serverlog("load or create SQLITE");
    let indexData;

    const database = new DatabaseSync(sqliteIndexPath);

    // create new file
    serverlog("creating virtual table.");
    database.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages USING fts5(key, content, raw, timestamp);
      `);

    if (
      fs.existsSync(sqliteIndexPath)
    ) {
      // load previous saved work.
      const lastTimeStampQuery = database.prepare(
        `SELECT max(timestamp) as max FROM messages`,
      );

      lastIndexedTimestamp = lastTimeStampQuery.all()[0]["max"];
      serverlog(`LAST TIMESTAMP: ${lastIndexedTimestamp}`);
    }

    if (lastIndexedTimestamp > 0) {
      enableSqliteSearch(database);
    }

    return { database, lastIndexedTimestamp };
  };

  const enableSqliteSearch = (database) => {
    // handle searches
    electron.ipcRenderer.removeAllListeners("search");
    electron.ipcRenderer.removeAllListeners("is-search-available");
    electron.ipcRenderer.on("is-search-available", (ev, terms) => {
      electron.ipcRenderer.send("search-available");
    });

    electron.ipcRenderer.send("search-available");

    electron.ipcRenderer.on("search", (ev, terms) => {
      const query = database.prepare(`
        SELECT
          *
        FROM
          messages 
        WHERE
          messages
        MATCH
          ?
      `);
      // serverlog(`SEARCH TERMS: ${terms}`);
      const results = query.all(terms);
      // serverlog(`result count: ${results.length}`);
      // serverlog(JSON.stringify(results, null, 2));
      electron.ipcRenderer.send("search-results", results);
    });
  };

  const loadMessagesIntoSQLite = (
    { database, controlData, delayPullStream = false },
  ) => {
    // if it is an imported account doing first-time sync
    // attempting a pull stream at the same time is very
    // costly for the UI.
    //
    // Let's delay that for 15 minutes.
    if (delayPullStream) {
      serverlog("SQLITE: imported account, delay pulling");
      setTimeout(() => {
        serverlog("SQLITE: delayed pulling about to start...");
        set(ssbConfig.keys.id, "imported", false);
        loadMessagesIntoSQLite({ database, controlData });
      }, 15 * 60000);
      return;
    }

    serverlog("SQLITE: Starting message indexing pull stream...");
    const insert = database.prepare(
      "INSERT OR REPLACE INTO messages (key, content, raw, timestamp) VALUES (?, ?, ?, ?)",
    );
    database.exec("begin");
    let i = 0;
    pull(
      context.sbot.messagesByType({
        type: "post",
        live: true,
        gt: lastIndexedTimestamp,
      }),
      pull.map((m) => {
        // serverlog("mapping", JSON.stringify(m, null, 2));
        if (m.sync) return m;
        return {
          key: m.key,
          timestamp: m.timestamp,
          content: m.value?.content?.text ?? m.value?.content?.post ??
            JSON.stringify(m.value?.content),
          raw: JSON.stringify(m),
        };
      }),
      pull.drain((m) => {
        if (m.sync) {
          // finished indexing
          serverlog(
            `SQLITE: finished indexing for now ${lastIndexedTimestamp}`,
          );

          database.exec("commit");
          enableSqliteSearch(database);
          return;
        } else {
          // serverlog(JSON.stringify(m, null, 2));
          try {
            insert.run(m.key, m.content, m.raw, m.timestamp);
          } catch (e) {
            serverlog("Problem inserting");
            serverlog(JSON.stringify(m, null, 2));
          }

          i++;
          serverlog(`last timestamp ${lastIndexedTimestamp}`);
          lastIndexedTimestamp = m.timestamp;
        }
      }),
    );
  };

  loadOrCreateSqlite().then(({ database, controlData }) => {
    serverlog("SQLITE: callback");
    let delayPullStream = false;
    let configuration = configurationForIdentity(ssbConfig.keys.id);
    if (configuration?.imported) {
      delayPullStream = true;
    }
    loadMessagesIntoSQLite({ database, controlData, delayPullStream });
  }).catch((e) => {
    serverlog("SQLITE: ERROR");
    console.error(JSON.stringify(e));
  });
};
