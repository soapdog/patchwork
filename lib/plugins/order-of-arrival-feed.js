"use strict";
const pull = require("pull-stream");
const HLRU = require("hashlru");
const extend = require("xtend");
const pullResume = require("../pull-resume");
const threadSummary = require("../thread-summary");
const LookupRoots = require("../lookup-roots");
const ResolveAbouts = require("../resolve-abouts");
const UniqueRoots = require("../unique-roots");
const getRoot = require("../get-root");
const normalizeChannel = require("ssb-ref").normalizeChannel;
const FilterBlocked = require("../filter-blocked");

exports.manifest = {
  latest: "source",
  roots: "source",
};

exports.init = function (ssb) {
  // cache mostly just to avoid reading the same roots over and over again
  // not really big enough for multiple refresh cycles
  const cache = HLRU(100);

  return {
    latest: function () {
      const query = [
        { $filter: { value: { content: { type: "post" } } } },
        {
          "$reduce": {
            "timestamp": { "$max": ["value", "timestamp"] },
          },
        },
        { "$sort": [["timestamp"]] },
      ];
      return pull(
        ssb.query.read({ old: false, live: true, query, awaitReady: false }),
        // pull.filter((msg) => checkBump(msg)),
        LookupRoots({ ssb, cache }),
        // TODO: don't bump if author blocked
      );
    },
    /**
     * @param {Object} opts
     * @param {Boolean} opts.reverse
     * @param           opts.limit
     * @param {Number}  opts.resume
     * @param           opts.channel
     */
    roots: function (
      { reverse = false, limit = null, resume = null },
    ) {
      // use resume option if specified
      let rts;
      if (resume) {
        rts = reverse ? { $lt: resume } : { $gt: resume };
      } else {
        rts = { $gt: 0 };
      }

      const opts = {
        reverse,
        awaitReady: false,
        old: true,
        query: [
          { $filter: { value: { content: { type: "post" } } } },
          {
            "$reduce": {
              "timestamp": { "$max": ["value", "timestamp"] },
            },
          },
          { "$sort": [["timestamp"]] },
        ],
      };

      return pullResume.source(ssb.query.read(opts), {
        limit,
        getResume: (item) => {
          return item.rts;
        },
        filterMap: pull(
          // CHECK IF SHOULD BE INCLUDED
          pull.filter(bumpFilter),
          // LOOKUP AND ADD ROOTS
          LookupRoots({ ssb, cache }),
          // FILTER BLOCKED (don't bump if author blocked, don't include if root author blocked)
          FilterBlocked([ssb.id], {
            isBlocking: ssb.patchwork.contacts.isBlocking,
            useRootAuthorBlocks: true,
            checkRoot: true,
          }),
          // DON'T REPEAT THE SAME THREAD
          UniqueRoots(),
          // MAP ROOT ITEMS
          pull.map((item) => {
            const root = item.root || item;
            return root;
          }),
          // RESOLVE ROOTS WITH ABOUTS
          ResolveAbouts({ ssb }),
          // ADD THREAD SUMMARY
          pull.asyncMap((item, cb) => {
            threadSummary(item.key, {
              recentLimit: 3,
              readThread: ssb.patchwork.thread.read,
              bumpFilter,
              recentFilter: bumpFilter,
              pullFilter: FilterBlocked([
                item.value && item.value.author,
                ssb.id,
              ], { isBlocking: ssb.patchwork.contacts.isBlocking }),
            }, (err, summary) => {
              if (err) return cb(err);
              cb(
                null,
                extend(item, summary, {
                  rootBump: bumpFilter,
                }),
              );
            });
          }),
        ),
      });
    },
  };
};

function bumpFilter(msg) {
  const filterResult = msg.filterResult;
  if (filterResult) {
    if (isAttendee(msg)) {
      return "attending";
    } else if (filterResult.following || filterResult.isYours) {
      if (msg.value.content.type === "post") {
        if (getRoot(msg)) {
          return "reply";
        } else {
          return "post";
        }
      } else {
        return "updated";
      }
    } else if (
      filterResult.matchesChannel || filterResult.matchingTags.length
    ) {
      const channels = new Set();
      if (filterResult.matchesChannel) channels.add(msg.value.content.channel);
      if (Array.isArray(filterResult.matchingTags)) {
        filterResult.matchingTags.forEach((x) => channels.add(x));
      }
      return { type: "matches-channel", channels: Array.from(channels) };
    }
  }
}
