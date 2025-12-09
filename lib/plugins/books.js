"use strict";
const pull = require("pull-stream");
const HLRU = require("hashlru");
const extend = require("xtend");
const normalizeChannel = require("ssb-ref").normalizeChannel;
const pullResume = require("../pull-resume");
const threadSummary = require("../thread-summary");
const LookupRoots = require("../lookup-roots");
const ResolveAbouts = require("../resolve-abouts");
const Paramap = require("pull-paramap");
const getRoot = require("../get-root");
const FilterBlocked = require("../filter-blocked");
const PullCont = require("pull-cont/source");
const Book = require("scuttle-book");

exports.manifest = {
  latest: "source",
  roots: "source",
};

exports.init = function (ssb) {
  // cache mostly just to avoid reading the same roots over and over again
  // not really big enough for multiple refresh cycles
  const book = Book(ssb);

  const bookReshaper = b => {
    const obj = {}
    Object.assign(obj, b.msg)
    delete b.msg
    Object.assign(obj, b)
    return obj
  }

  return {
    latest: function () {
      return pull(
        book.pull.books({ reverse: true }, true, false),
        // aag: books stream is strange shape
        pull.map(bookReshaper)

      );
    },
    roots: function ({ reverse, limit, resume }) {
      const seen = new Set();
      const included = new Set();

      // use resume option if specified
      const opts = {};
      if (resume) {
        opts[reverse ? "lt" : "gt"] = resume;
      }

      return PullCont((cb) => {
        // wait until contacts have resolved before reading
        ssb.patchwork.contacts.raw.get(() => {
          cb(
            null,
            pullResume.source(book.pull.books({ reverse: true }, true, false), {
              limit,
              getResume: (item) => {
                return item && item.rts;
              },
              filterMap: pull(
                pull.through((msg) => {
                  console.log("book roots begin");
                  console.log(JSON.stringify(msg, null, 2));
                }),
                pull.map(bookReshaper),
                // ADD THREAD SUMMARY
              Paramap((item, cb) => {
                threadSummary(item.key, {
                  pullFilter: pull(
                    FilterBlocked([item.value && item.value.author, ssb.id], { isBlocking: ssb.patchwork.contacts.isBlocking }),
                  ),
                  recentLimit: 3,
                  readThread: ssb.patchwork.thread.read,
                  bumpFilter: bumpFilter
                }, (err, summary) => {
                  if (err) return cb(err)
                  cb(null, extend(item, summary, {
                    filterResult: undefined,
                    rootBump: bumpFilter
                  }))
                })
              }, 20)
              ),
            }),
          );
        });
      });
    },
  };

  function shouldShow(filterResult) {
    return !!filterResult;
  }
};

function FilterPrivateRoots() {
  return pull.filter((msg) => {
    return !msg.root || (msg.root.value && !msg.root.value.private);
  });
}

function bumpFilter (msg) {
  const filterResult = msg.filterResult
  if (filterResult) {
    if (filterResult.following || filterResult.isYours) {
      if (msg.value.content.type === 'post') {
        if (getRoot(msg)) {
          return 'reply'
        } else {
          return 'post'
        }
      } else {
        return 'updated'
      }
    } else if (filterResult.matchesChannel || filterResult.matchingTags.length) {
      const channels = new Set()
      if (filterResult.matchesChannel) channels.add(msg.value.content.channel)
      if (Array.isArray(filterResult.matchingTags)) filterResult.matchingTags.forEach(x => channels.add(x))
      return { type: 'matches-channel', channels: Array.from(channels) }
    }
  }
}
