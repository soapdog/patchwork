const { h, when } = require("mutant");
const nest = require("depnest");
const getRoot = require("../../../message/sync/root");
const customScripts = require("../../scripts/lua/custom-scripts.js")
const electron = require("electron");

exports.needs = nest({
  "intl.sync.i18n": "first",
  "app.navigate": "first",
  "message.obs.doesLike": "first",
  "sbot.async.publish": "first",
  "sheet.editTags": "first",
  "scripts.lua.environment.init": "first",
  "scripts.lua.environment.call": "first",
});

exports.gives = nest("message.html.actions");

exports.create = (api) => {
  const i18n = api.intl.sync.i18n;

  return nest("message.html.actions", function like(msg) {
    const liked = api.message.obs.doesLike(msg.key);

    const customActions = []

    const activeScripts = customScripts.getActiveScriptsList()

    for (const script of activeScripts) {
      const L = api.scripts.lua.environment.init(script.name)
      const [r, label] = api.scripts.lua.environment.call(L, "button",[msg],2)
      if (r) {
        const button = h("a.lua -right", {
          href: "#",
          title: label,
          "ev-click": (ev) => {
            const [r, label] = api.scripts.lua.environment.call(L, "buttonAction",[msg],2)
            ev.preventDefault();
          },
        }, label)
        customActions.push(button)
      }
    }

    return [
      when(
        liked,
        h("a.like -liked", {
          href: "#",
          title: i18n("Click to unlike"),
          "ev-click": () => publishLike(msg, false),
        }, i18n("Liked")),
        h("a.like", {
          href: "#",
          "ev-click": () => publishLike(msg, true),
        }, i18n("Like")),
      ),
      h("a.reply", {
        href: msg.key,
        anchor: "reply",
        "ev-click": { handleEvent, api, msg },
      }, i18n("Reply")),
      h("a.tag -right", {
        href: "#",
        title: i18n("Add / Edit Tags"),
        "ev-click": () => api.sheet.editTags({ msgId: msg.key }, console.log),
      }, i18n("Tags")),
      when(
        messageHasAudio(msg),
        h("a.audio -right", {
          href: "#",
          title: i18n("Open in Audio Player"),
          "ev-click": (ev) => {
            openInPlayer(msg);
            ev.preventDefault();
          },
        }, i18n("Open in Audio Player")),
      ),
      ...customActions
    ];
  });

  function publishLike(msg, status = true) {
    const like = status
      ? {
        type: "vote",
        channel: msg.value.content.channel,
        vote: { link: msg.key, value: 1, expression: "Like" },
      }
      : {
        type: "vote",
        channel: msg.value.content.channel,
        vote: { link: msg.key, value: 0, expression: "Unlike" },
      };
    if (msg.value.content.recps) {
      like.recps = msg.value.content.recps.map(function (e) {
        return e && typeof e !== "string" ? e.link : e;
      });
      like.private = true;
    }
    api.sbot.async.publish(like);
  }
};

function handleEvent(ev) {
  const { api, msg } = this;
  const el = getMessageElement(ev.target);

  // HACK: if this is the last message in the list, reply to the root message
  if (el && !el.nextElementSibling) {
    api.app.navigate(getRoot(msg), "reply");
    ev.preventDefault();
  }
}

function openInPlayer(msg) {
  electron.ipcRenderer.send("open-in-audio-player", msg);
}

function messageHasAudio(msg) {
  if (!msg?.value?.content?.mentions) {
    return false;
  }

  if (!Array.isArray(msg.value.content.mentions)) {
    return false;
  }

  for (const mention of msg.value.content.mentions) {
    if (mention?.type && mention.type.startsWith("audio/")) {
      return true;
    }

    if (mention?.name && mention.name.endsWith("mp3")) {
      return true;
    }
  }
  return false;
}

function getMessageElement(el) {
  while (el && el.classList) {
    if (
      el.classList.contains("Message") && el.parentNode &&
      el.parentNode.classList.contains("replies")
    ) {
      return el;
    }
    el = el.parentNode;
  }
}
