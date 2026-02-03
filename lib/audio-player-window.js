const combine = require("depject");
const entry = require("depject/entry");
const electron = require("electron");
const { h, when, map, Array: MutantArray, Value } = require("mutant");
const computed = require("mutant/computed");
const catchLinks = require("./catch-links");
const themes = require("../styles");
const moment = require("moment-timezone");
const nest = require("depnest");
const path = require("path");
const { parseWebStream } = require("music-metadata");

const requireStyle = (moduleName, specificFilePath = false) => {
  const stylesPath = path.join(__dirname, "../styles", moduleName);
  const filePath = !specificFilePath
    ? path.resolve(stylesPath, `${moduleName}.css`)
    : path.resolve(stylesPath, specificFilePath);
  const urlStr = `@import "${filePath}"`;
  return urlStr;
};

function overrideConfig(config) {
  return {
    "patchwork/config": {
      gives: nest("config.sync.load"),
      create: function () {
        return nest("config.sync.load", () => config);
      },
    },
  };
}

function addCommand(id, cb) {
  return {
    [`patchwork/command/${id}`]: {
      gives: nest(id),
      create: function () {
        return nest(id, cb);
      },
    },
  };
}

function filterAudioMentions(mention) {
  if (mention?.type && mention.type.startsWith("audio/")) {
    return true;
  }

  if (mention?.name && mention.name.endsWith("mp3")) {
    return true;
  }

  return false;
}

module.exports = function (config, data) {
  const sockets = combine(
    overrideConfig(config),
    addCommand("app.navigate", () => {}),
    addCommand("app.refresh", () => {}),
    require("./depject"),
    require("patch-settings"),
  );

  const api = entry(
    sockets,
    nest({
      "config.sync.load": "first",
      "keys.sync.id": "first",
      "sbot.obs.connection": "first",
      "sbot.async.get": "first",
      "blob.sync.url": "first",
      "intl.sync.i18n": "first",
      "settings.obs.get": "first",
    }),
  );

  const i18n = api.intl.sync.i18n;
  const language = api.settings.obs.get("patchwork.lang", "")();
  moment.locale(language);

  const id = api.keys.sync.id();

  document.head.appendChild(
    h("style", {
      innerHTML: computed(
        api.settings.obs.get("patchwork.theme", "light"),
        (themeName) => {
          return themes[themeName] || themes.light;
        },
      ),
    }),
  );

  document.head.appendChild(
    h("style", {
      innerHTML: requireStyle("noto-color-emoji"),
    }),
  );

  document.head.appendChild(
    h("style", {
      innerHTML: requireStyle("audio-player"),
    }),
  );

  document.head.appendChild(
    h("style", {
      innerHTML: computed(
        api.settings.obs.get("patchwork.fontSize"),
        (size) => {
          if (size) {
            return "html, body {font-size: " + size + ";}";
          }
        },
      ),
    }),
  );

  document.head.appendChild(
    h("style", {
      innerHTML: computed(
        api.settings.obs.get("patchwork.fontFamily"),
        (family) => {
          if (family) {
            return "body, input, select { font-family: " + family + ";}";
          }
        },
      ),
    }),
  );

  electron.ipcRenderer.on("queue-audio", (ev, data) => {
    const music = data.value.content.mentions.filter(filterAudioMentions);
    for (const m of music) {
      queue.push(m);
    }
  });

  const fetchMetadata = async (url) => {
    try {
      // Fetch the audio file
      const response = await fetch(url);

      // Extract the Content-Length header and convert it to a number
      const contentLength = response.headers.get("Content-Length");
      const size = contentLength ? parseInt(contentLength, 10) : undefined;

      // Parse the metadata from the web stream
      const metadata = await parseWebStream(response.body, {
        mimeType: response.headers.get("Content-Type"),
        size, // Important to pass the content-length
      });

      console.dir(metadata);
      return metadata;
    } catch (error) {
      console.error("Error parsing metadata:", error.message);
      return false;
    }
  };

  const queue = MutantArray(
    data.value.content.mentions.filter(filterAudioMentions),
  );

  const queueItem = (item) => {
    const url = api.blob.sync.url(item);
    const songTitle = Value(
      item.name.replace(".mp3", "").replace("audio:", ""),
    );
    const artist = Value(false);
    fetchMetadata(url).then((data) => {
      if (data?.common?.title) {
        songTitle.set(data.common.title);
      }
      if (data?.common?.artist) {
        artist.set(data.common.artist);
      }
    });
    return h(
      "li",
      h("a", {
        href: "#",
        "ev-click": (ev) => {
          ev.preventDefault();
          playSong(item);
        },
      }, when(artist, [songTitle, " by ", artist], songTitle)),
    );
  };

  const playSong = (item) => {
    queue.delete(item);
    queue.insert(item, 0);
  };

  const currentAudio = computed(queue, (q) => {
    const first = q[0];
    const url = api.blob.sync.url(first);
    console.log("url", url);
    return url;
  });

  const audioEndedEvent = (ev) => {
    console.log("audio ended");
    queue.shift();
    if (queue.getLength() > 0) {
      document.getElementById("player").play();
    }
  };

  const container = h(`AudioPlayer -${process.platform}`, {
    classList: [when(fullscreen(), "-fullscreen")],
  }, [
    h("div.top", []),
    h("div.middle", [
      h("audio", {
        id: "player",
        src: currentAudio,
        controls: true,
        autoplay: true,
        "ev-ended": audioEndedEvent,
      }),
      h("ul.queue", map(queue, queueItem)),
    ]),
    h("div.footer", []),
  ]);

  return [container];
};
