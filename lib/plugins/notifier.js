"use strict";
const appName = process.env.ssb_appname || "ssb";
const pull = require("pull-stream");

const mlib = require("ssb-msgs");
const multicb = require("multicb");
const cat = require("pull-cat");
const fs = require("fs");
const os = require("os");
const path = require("path");
const toPull = require("stream-to-pull-stream");
const getAvatar = require("ssb-avatar");
const electron = require("electron");
const ssbUri = require("ssb-uri2");

const defaultIcon = "&qjeAs8+uMXLlyovT4JnEpMwTNDx/QXHfOl2nv2u0VCM=.sha256";

module.exports = {
  name: "notifier",
  version: "1.0.0",
  manifest: {
    notify: "sync",
  },
  init: function (sbot, config, cb) {
    var notify;
    var conf = config && config.notifier || {};
    var logOpts = { old: false };
    if (!isNaN(conf.recent)) {
      logOpts.old = true;
      logOpts.gte = Date.now() - conf.recent;
    }

    Notifier(appName, config, function (err, _notify) {
      if (err) return console.error("[notifier]", err.message || err);
      notify = _notify;
      pull(
        sbot.createLogStream(logOpts),
        Notifications(sbot, config, sbot.id),
        pull.drain(notify, function (err) {
          if (cb) cb(err);
          else if (err) console.error("[notifier]", err);
        }),
      );
    });

    return {
      notify: function (notification) {
        if (notify) notify(notification);
        else console.log("[notifier]", notification);
      },
    };
  },
};

/*
== Notifier ===========================================================================================================
*/

const Notifier = function init(appName, config, cb) {
  const conf = config && config.notifier || {};

  cb(null, function (notif) {
    console.log("sending notification", notif);
    electron.ipcRenderer.send("send-notification", notif);
  });
};

window.testNotification = () => {
  console.log("sending test notification");
  let rng = Math.floor(Math.random() * 999);
  electron.ipcRenderer.send("send-notification", {
    "icon":
      "/var/folders/pc/5mqjqp_s3154j4q90dwcwysh0000gn/T/%2661lFIj72thhjfs4uVJ32hXJVhkkMvTeUFPi7vt4rSjM%3D.sha256",
    "title": "happy0 dug your message ",
    "message":
      `![cleo watching the birbs](&oPCoQEmLM2GlVYpMHAYhSP5THZKzV4HpR8YBRy7dzCg=.sha256)\n\nCleo is watching the birbs ${rng}`,
    "open": "ssb:message/classic/uTawzqd1LrNhGvknIFUOCe5Da6Oy6VCgqguPZCc8P2k=",
  });
};

/*
== Notifications ===========================================================================================================
*/

function truncate(str, len) {
  if (!str) return "";
  str = String(str);
  return str.length < len ? str : str.substr(0, len - 1) + "…";
}

function trimMessage(msg) {
  var text = msg.value.content.text;
  // Should private messages be shortened, for privacy?
  return truncate(text, 127);
}

function isNotFoundError(err) {
  return err.notFound || err.name === "NotFoundError";
}

function decryptPrivateMessage(sbot, msg, cb) {
  var content = msg && msg.value && msg.value.content;
  if (
    sbot.private && typeof content === "string" && content.slice(-4) === ".box"
  ) {
    sbot.private.unbox(content, function (err, content) {
      if (err && err.message === "failed to decrypt") err = null;
      if (err || !content) return cb(err);
      return cb(null, {
        key: msg.key,
        private: true,
        value: {
          content: content,
          author: msg.value.author,
        },
      });
    });
  } else {
    cb(null, msg);
  }
}

function decryptPrivateMessages(sbot) {
  return pull(
    pull.asyncMap(decryptPrivateMessage.bind(this, sbot)),
    pull.filter(),
  );
}

function findLink(links, id) {
  for (var i = 0; i < (links ? links.length : 0); i++) {
    if (links[i].link === id) {
      return links[i];
    }
  }
}

function getMsg(sbot, key, cb) {
  sbot.get(key, function (err, value) {
    if (err && isNotFoundError(err)) return cb();
    else if (err) return cb(err);
    else decryptPrivateMessage(sbot, { key: key, value: value }, cb);
  });
}

function getLinkedMsg(sbot, content, cb) {
  var link = mlib.link(content, "msg");
  if (link) getMsg(sbot, link.link, cb);
  else cb();
}

// Get filename for a blob
function getBlobFile(sbot, id, cb) {
  var fileName = path.join(os.tmpdir(), encodeURIComponent(id));
  fs.exists(fileName, function (exists) {
    if (exists) return cb(null, fileName);
    sbot.blobs.want(id, function (err, has) {
      if (err) cb(err);
      else if (!has) cb();
      else {pull(
          sbot.blobs.get(id),
          toPull.sink(fs.createWriteStream(fileName), function (err) {
            cb(err, fileName);
          }),
        );}
    });
  });
}

// Get a name for a thing from multiple fallback sources
function getName(sbot, sources, dest, cb) {
  var name;
  pull(
    cat(sources.map(function (source) {
      return sbot.links({
        source: source,
        dest: dest,
        rel: "about",
        values: true,
        keys: false,
        meta: false,
        reverse: true,
      });
    })),
    pull.drain(function (value) {
      name = value && value.content && value.content.name;
      if (name) return false;
    }, function (err) {
      cb(err === true ? null : err, name);
    }),
  );
}

// through stream to turn messages into notifications
const Notifications = function (sbot, config, myId) {
  config = config || {};
  var conf = config.notifier || {};
  var wsConf = config.ws || {};
  var wsHost = wsConf.host || "localhost";
  var wsPort = wsConf.port || 8989;
  var msgBaseUrl = conf.msgBaseUrl ||
    ("http://" + wsHost + ":" + wsPort + "/msg/");

  function makeUrl(msg) {
    return ssbUri.fromMessageSigil(msg.key);
  }

  // get name and icon for a user
  function getAbout(id, cb) {
    getAvatar(sbot, myId, id, function (err, about) {
      if (err) return cb(err);
      getBlobFile(sbot, about.image || defaultIcon, function (err, path) {
        if (err) return cb(err);
        cb(null, { name: about.name || truncate(id, 8), image: path });
      });
    });
  }

  return pull(
    pull.filter(function (msg) {
      return msg.sync === undefined;
    }),
    decryptPrivateMessages(sbot),
    pull.asyncMap(function (msg, cb) {
      var c = msg && msg.value && msg.value.content;
      if (!c || typeof c != "object") return cb();

      // ignore own messages
      if (msg.value.author === myId) return cb();

      switch (c.type) {
        case "post":
          if (findLink(mlib.links(c.mentions), myId)) {
            var subject = trimMessage(msg) || "a message";
            return getAbout(msg.value.author, function (err, about) {
              cb(err, {
                icon: about.image,
                title: about.name + " mentioned you",
                message: subject,
                open: makeUrl(msg),
              });
            });
          } else if (msg.private) {
            return getAbout(msg.value.author, function (err, about) {
              if (err) return cb(err);
              cb(null, {
                icon: about.image,
                title: about.name + " sent you a private message",
                message: trimMessage(msg),
                open: makeUrl(msg),
              });
            });
          } else if (c.root || c.branch) {
            // check if this is a reply to one of our messages
            var done = multicb({ pluck: 1, spread: true });
            getLinkedMsg(sbot, c.root, done());
            getLinkedMsg(sbot, c.branch, done());
            return done(function (err, root, branch) {
              if (err) return cb(err);
              var subject;
              if (root && root.value.author === myId) {
                subject = "your thread";
              } else if (branch && branch.value.author === myId) {
                subject = "your post";
              } else {
                return cb();
              }
              getAbout(msg.value.author, function (err, about) {
                if (err) return cb(err);
                cb(null, {
                  icon: about.image,
                  title: about.name + " replied to " + subject,
                  message: trimMessage(msg),
                  open: makeUrl(msg),
                });
              });
            });
          }
          return cb();

        case "contact":
          if (c.contact === myId) {
            return getAbout(msg.value.author, function (err, about) {
              if (err) return cb(err);
              var action = (c.following === true)
                ? "followed"
                : (c.blocking === true)
                ? "blocked"
                : (c.following === false)
                ? "unfollowed"
                : "???";
              cb(null, {
                icon: about.image,
                title: about.name + " " + action + " you",
                open: makeUrl(msg),
              });
            });
          }
          return cb();

        case "vote":
          var vote = c.vote;
          if (!vote || typeof vote.value !== "number") {
            return cb();
          }
          return getLinkedMsg(sbot, vote, function (err, subject) {
            if (err) {
              if (isNotFoundError(err)) return cb();
              else return cb(err);
            }
            if (!subject || subject.value.author !== myId) return cb();
            getAbout(msg.value.author, function (err, about) {
              if (err) return cb(err);
              var action = (vote.value > 0)
                ? "dug"
                : (vote.value < 0)
                ? "flagged"
                : "removed their vote for";
              var reason = vote.reason ? " as " + vote.reason : "";
              var target = subject.private ? "private message" : "message";
              cb(null, {
                icon: about.image,
                title: about.name + " " + action + " your " + target +
                  " " + reason,
                message: trimMessage(subject),
                open: makeUrl(msg),
              });
            });
          });

        case "pull-request":
        case "issue":
          return getLinkedMsg(sbot, c.repo || c.project, function (err, repo) {
            if (err) return cb(err);
            if (!repo || repo.value.author !== myId) return cb();
            var done = multicb({ pluck: 1, spread: true });
            getAbout(msg.value.author, done());
            getName(sbot, [myId, c.repo, null], c.repo, done());
            done(function (err, author, repoName) {
              if (err) return cb(err);
              var what = c.type === "issue" ? "an issue" : "a pull request";
              var dest = repoName || truncate(c.repo, 16);
              cb(null, {
                icon: author.image,
                title: author.name + " opened " + what + " on " + dest,
                message: trimMessage(msg),
                open: makeUrl(msg),
              });
            });
          });

        default:
          cb();
      }
    }),
    pull.filter(Boolean),
  );
};
