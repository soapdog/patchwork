const nest = require("depnest");
const { Array: MutantArray, h, send, when, computed, map, onceTrue, throttle } =
  require("mutant");
const getRoot = require("../../../../message/sync/root.js");
const pull = require("pull-stream");
const pullParallelMap = require("pull-paramap");
const pullSort = require("pull-sort");
const slow = (input) => throttle(input, 1000);

exports.needs = nest({
  sbot: {
    obs: {
      connectedPeers: "first",
      localPeers: "first",
      stagedPeers: "first",
      connection: "first",
    },
  },
  "sbot.async.connConnect": "first",
  "sbot.pull.stream": "first",
  "sbot.pull.resumeStream": "first",
  "about.html.image": "first",
  "about.obs.name": "first",
  "invite.sheet": "first",

  "message.html.compose": "first",
  "message.html.render": "first",
  "progress.html.peer": "first",

  "feed.html.followWarning": "first",
  "feed.html.followerWarning": "first",
  "feed.html.rollup": "first",
  "profile.obs.recentlyUpdated": "first",
  "profile.obs.contact": "first",
  "contact.obs.following": "first",
  "contact.obs.blocking": "first",
  "channel.obs": {
    subscribed: "first",
    recent: "first",
  },
  "keys.sync.id": "first",
  "settings.obs.get": "first",
  "intl.sync.i18n": "first",
});

exports.gives = nest({
  "page.html.render": true,
});

exports.create = function (api) {
  const i18n = api.intl.sync.i18n;
  return nest("page.html.render", page);

  function page(path) {
    if (!path.startsWith("/popular")) return; // "/" is a sigil for "page"

    const search = new URLSearchParams(path.split("?")[1]);
    const period = search.get("period");

    /*
    == OASIS/PATCHFOX HEIST ===========================================================================================================
    */

    /**
     * Below this is all a part of the great Oasis heist.
     *
     * Oasis is another client for SSB, it is fucking awesome.
     * You can get more info about it on:
     *
     * http://github.com/fraction/oasis
     *
     * Anyway, Oasis has some great features which our little webby
     * foxes want, so we're stealing them. At the moment our loot contains:
     *
     * - the popular view.
     * - transform
     *
     * PS: Those routines are being adapted to Patchfox and differ from
     * their original source.
     */

    const popular = async ({ period, page = 1 }) => {
      if (!sbot) {
        throw "error: no sbot";
      }

      const periodDict = {
        day: 1,
        week: 7,
        month: 30.42,
        year: 365,
      };

      if (period in periodDict === false) {
        throw new Error("invalid period");
      }

      const myFeedId = sbot.id;

      const now = new Date();
      const earliest = Number(now) - 1000 * 60 * 60 * 24 * periodDict[period];

      const defaultOptions = {
        private: true,
        reverse: true,
        meta: true,
      };

      const configure = (...customOptions) =>
        Object.assign({}, defaultOptions, ...customOptions);

      const source = sbot.query.read(
        configure({
          query: [
            {
              $filter: {
                value: {
                  timestamp: { $gte: earliest },
                  content: {
                    type: "vote",
                  },
                },
                timestamp: { $gte: earliest },
              },
            },
          ],
          index: "DTA",
        }),
      );
      const followingFilter = await socialFilter({ following: true });

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          // this.filterPublicOnly, // <-- filter declared on top with other filters
          pull.filter((msg) => {
            return (
              typeof msg.value.content === "object" &&
              typeof msg.value.content.vote === "object" &&
              typeof msg.value.content.vote.link === "string" &&
              typeof msg.value.content.vote.value === "number"
            );
          }),
          pull.reduce(
            (acc, cur) => {
              const author = cur.value.author;
              const target = cur.value.content.vote.link;
              const value = cur.value.content.vote.value;

              if (acc[author] == null) {
                acc[author] = {};
              }

              // Only accept values between -1 and 1
              acc[author][target] = Math.max(-1, Math.min(1, value));

              return acc;
            },
            {},
            (err, obj) => {
              if (err) {
                return reject(err);
              }

              // HACK: Can we do this without a reduce()? I think this makes the
              // stream much slower than it needs to be. Also, we should probably
              // be indexing these rather than building the stream on refresh.

              const adjustedObj = Object.entries(obj).reduce(
                (acc, [author, values]) => {
                  if (author === myFeedId) {
                    return acc;
                  }

                  const entries = Object.entries(values);
                  const total = 1 + Math.log(entries.length);

                  entries.forEach(([link, value]) => {
                    if (acc[link] == null) {
                      acc[link] = 0;
                    }
                    acc[link] += value / total;
                  });
                  return acc;
                },
                [],
              );

              const arr = Object.entries(adjustedObj);
              const length = arr.length;
              const maxMessages = 50 * page;

              pull(
                pull.values(arr),
                pullSort(([, aVal], [, bVal]) => bVal - aVal),
                pull.take(Math.min(length, maxMessages)),
                pull.map(([key]) => key),
                pullParallelMap(async (key, cb) => {
                  const msg = await get(key);
                  const data = { key: key, value: msg };
                  cb(null, data);
                }),
                followingFilter,
                pull.collect((err, collectedMessages) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(
                      collectedMessages.slice(
                        50 * -1,
                      ),
                    );
                  }
                }),
              );
            },
          ),
        );
      });

      return messages;
    };

    const cache = {};
    const setMsgCache = (id, data) => {
      cache[id] = JSON.stringify(data);
    };
    const get = (id) => {
      return new Promise((resolve, reject) => {
        // if (getMsgCache(id)) {
        //   resolve(getMsgCache(id))
        // }
        if (sbot.ooo) {
          sbot.get(
            { id: id, raw: true, ooo: false, private: true },
            (err, data) => {
              if (err) reject(err);
              setMsgCache(id, data);
              resolve(data);
            },
          );
        } else {
          if (!sbot.private) {
            // if no sbot.private, assume we have newer sbot that supports private:true
            return sbot.get({ id: id, private: true }, (err, data) => {
              if (err) reject(err);
              setMsgCache(id, data);
              resolve(data);
            });
          }
          sbot.get(id, (err, data) => {
            if (err) reject(err);
            setMsgCache(id, data);
            resolve(data);
          });
        }
      });
    };

    /**
     * Returns a function that filters messages based on who published the message.
     *
     * `null` means we don't care, `true` means it must be true, and `false` means
     * that the value must be false. For example, if you set `me = true` then it
     * will only allow messages that are from you. If you set `blocking = true`
     * then you only see message from people you block.
     */
    const socialFilter = async (
      { following = null, blocking = false, me = null } = {},
    ) => {
      if (!sbot) {
        throw "error: no sbot";
      }

      const { id } = sbot;
      const relationshipObject = await sbot.friends.get({
        source: id,
      });

      const followingList = Object.entries(relationshipObject)
        .filter(([, val]) => val === true)
        .map(([key]) => key);

      const blockingList = Object.entries(relationshipObject)
        .filter(([, val]) => val === false)
        .map(([key]) => key);

      return pull.filter((message) => {
        if (message.value.author === id) {
          return me !== false;
        } else {
          return (
            (following === null ||
              followingList.includes(message.value.author) === following) &&
            (blocking === null ||
              blockingList.includes(message.value.author) === blocking)
          );
        }
      });
    };

    const votes = (msg) => {
      return new Promise((resolve, reject) => {
        if (!msg.key && typeof msg == "string") {
          msg = { key: msg };
        }

        let cachedResult = resultFromCache("votes", msg.key, 10);

        if (cachedResult) {
          return cachedResult;
        }

        const voteQuery = async (msg) => {
          const filterQuery = {
            $filter: {
              dest: msg.key,
              value: {
                content: {
                  type: "vote",
                },
              },
            },
          };

          const referenceStream = ssb.sbot.backlinks.read({
            query: [filterQuery],
            index: "DTA", // use asserted timestamps
            private: true,
            meta: true,
          });

          let rawVotes;

          try {
            rawVotes = await new Promise((resolve, reject) => {
              pull(
                referenceStream,
                pull.filter(
                  (ref) =>
                    typeof ref.value.content.vote.value === "number" &&
                    ref.value.content.vote.value >= 0 &&
                    ref.value.content.vote.link === msg.key,
                ),
                pull.collect((err, collectedMessages) => {
                  if (err) {
                    console.error("err", err);
                    reject(err);
                  } else {
                    resolve(collectedMessages);
                  }
                }),
              );
            });
          } catch (n) {
            console.error("error with rawVotes", n);
            throw n;
          }

          // { @key: 1, @key2: 0, @key3: 1 }
          //
          // only one vote per person!
          const reducedVotes = rawVotes.reduce((acc, vote) => {
            acc[vote.value.author] = vote.value.content.vote.value;
            return acc;
          }, {});

          // gets *only* the people who voted 1
          // [ @key, @key, @key ]
          const voters = Object.entries(reducedVotes)
            .filter(([, value]) => value === 1)
            .map(([key]) => key);

          return voters;
        };

        enqueue(
          "votes",
          msg.key,
          10,
          async function work() {
            let res = await voteQuery(msg);
            return res;
          },
          function callback(votes) {
            resolve(votes);
          },
        );
      });
    };

    const transform = () => {
      console.log("transform...");
      const aux = async (msg) => {
        if (msg == null) {
          return msg;
        }

        const filterQuery = {
          $filter: {
            dest: msg.key,
          },
        };

        const referenceStream = ssb.sbot.backlinks.read({
          query: [filterQuery],
          index: "DTA", // use asserted timestamps
          private: true,
          meta: true,
        });

        let rawVotes;

        try {
          rawVotes = await new Promise((resolve, reject) => {
            pull(
              referenceStream,
              pull.filter(
                (ref) =>
                  typeof ref.value.content !== "string" &&
                  ref.value.content.type === "vote" &&
                  ref.value.content.vote &&
                  typeof ref.value.content.vote.value === "number" &&
                  ref.value.content.vote.value >= 0 &&
                  ref.value.content.vote.link === msg.key,
              ),
              pull.collect((err, collectedMessages) => {
                if (err) {
                  console.error("err", err);
                  reject(err);
                } else {
                  resolve(collectedMessages);
                }
              }),
            );
          });
        } catch (n) {
          console.error("error with rawVotes", n);
          throw n;
        }

        // { @key: 1, @key2: 0, @key3: 1 }
        //
        // only one vote per person!
        const reducedVotes = rawVotes.reduce((acc, vote) => {
          acc[vote.value.author] = vote.value.content.vote.value;
          return acc;
        }, {});

        // gets *only* the people who voted 1
        // [ @key, @key, @key ]
        const voters = Object.entries(reducedVotes)
          .filter(([, value]) => value === 1)
          .map(([key]) => key);

        const isPost = _.get(msg, "value.content.type") === "post" &&
          _.get(msg, "value.content.text") != null;
        const hasRoot = _.get(msg, "value.content.root") != null;
        const hasFork = _.get(msg, "value.content.fork") != null;

        if (isPost && hasRoot === false && hasFork === false) {
          _.set(msg, "value.meta.postType", "post");
        } else if (isPost && hasRoot && hasFork === false) {
          _.set(msg, "value.meta.postType", "comment");
        } else if (isPost && hasRoot && hasFork) {
          _.set(msg, "value.meta.postType", "reply");
        } else {
          _.set(msg, "value.meta.postType", "mystery");
        }

        _.set(msg, "value.meta.votes", voters);
        _.set(msg, "value.meta.voted", voters.includes(ssb.sbot.id));

        return msg;
      };

      return pullParallelMap((msg, cb) => {
        aux(msg)
          .then((data) => cb(null, data))
          .catch((err) => cb(err, null));
      });
    };

    /*
    == END OF OASIS/PATCHFOX HEIST ===========================================================================================================
    */

    let sbot;
    let messages = MutantArray([]);

    onceTrue(api.sbot.obs.connection, (s) => {
      sbot = s;

      popular({ period, page: 1 }).then((r) => {
        console.log("popular", r);
        messages.set(r);
      }).catch((n) => {
        console.error(n);
        messages.set([]);
      });
    });

    const id = api.keys.sync.id();
    const following = api.contact.obs.following(id);
    const blocking = api.contact.obs.blocking(id);
    const subscribedChannels = api.channel.obs.subscribed(id);
    const recentChannels = api.channel.obs.recent(8);
    const channelsLoading = computed([
      subscribedChannels.sync,
      recentChannels.sync,
    ], (...args) => !args.every(Boolean));
    const connectedPeers = api.sbot.obs.connectedPeers();
    const stagedPeers = api.sbot.obs.stagedPeers();
    const localPeers = api.sbot.obs.localPeers();
    const localPeersKeys = map(
      api.sbot.obs.localPeers(),
      (peer) => peer.data.key,
    );
    const connectedPubs = computed(
      [connectedPeers, localPeersKeys],
      (c, l) => c.filter((x) => !l.includes(x.data.key)),
    );
    const contact = api.profile.obs.contact(id);

    const prepend = [
      api.message.html.compose({
        meta: { type: "post" },
        draftKey: "public",
        placeholder: i18n("Write a public message"),
      }),
      noVisibleNewPostsWarning(),
      noFollowersWarning(),
    ];

    // replace here
    const filters = api.settings.obs.get("filters");
    const feedView = h("Scroller", [
      h("div.wrapper", [
        h("h1", `Popular posts this ${period}`),
        h("section.prepend", prepend),
        map(messages, (m) => {
          return h("FeedEvent -post", [api.message.html.render(m)]);
        }),
      ]),
    ]);

    // this here. These are plugins.

    // call reload whenever filters changes (equivalent to the refresh from inside rollup)
    filters(feedView.reload);

    const result = h("div.SplitView", [
      h("div.side", [
        getSidebar(),
      ]),
      h("div.main", [
        feedView,
      ]),
    ]);

    result.pendingUpdates = feedView.pendingUpdates;
    result.reload = function () {
      feedView.reload();
    };

    return result;

    function getSidebar() {
      const whoToFollow = computed([
        api.profile.obs.recentlyUpdated(),
        following,
        blocking,
        localPeersKeys,
      ], (recent, ...ignoreFeeds) => {
        return recent.filter((x) =>
          x !== id && !ignoreFeeds.some((f) => f.includes(x))
        ).slice(0, 10);
      });
      return [
        h("button -pub -full", {
          "ev-click": api.invite.sheet,
        }, i18n("+ Join Server")),

        when(channelsLoading, [h("Loading")], [
          when(computed(recentChannels, (x) => x.length), [
            h("h2", i18n("Active Channels")),
            h("div", {
              classList: "ChannelList",
              hidden: channelsLoading,
            }, [
              map(recentChannels, (channel) => {
                const subscribed = subscribedChannels.has(channel);
                return h("a.channel", {
                  href: `#${channel}`,
                  classList: [
                    when(subscribed, "-subscribed"),
                  ],
                }, [
                  h("span.name", "#" + channel),
                ]);
              }, { maxTime: 5 }),
              h(
                "a.channel -more",
                { href: "/channels" },
                i18n("More Channels..."),
              ),
            ]),
          ]),
        ]),

        PeerList(localPeers, i18n("Local")),
        SuggestedPeerList(stagedPeers, i18n("Possible connections")),
        PeerList(connectedPubs, i18n("Connections")),

        when(
          computed(whoToFollow, (x) => x.length),
          h("h2", i18n("Whom to follow")),
        ),
        when(
          following.sync,
          h("div", {
            classList: "ProfileList",
          }, [
            map(slow(whoToFollow), (id) => {
              return h("a.profile", {
                href: id,
              }, [
                h("div.avatar", [api.about.html.image(id)]),
                h("div.main", [
                  h("div.name", [api.about.obs.name(id)]),
                ]),
              ]);
            }),
          ]),
        ),
      ];
    }

    function PeerList(peers, title) {
      return [
        when(computed(peers, (arr) => arr.length), h("h2", title)),
        h("div", {
          classList: "ProfileList",
        }, [
          map(slow(peers), (peer) => {
            const address = peer.address;
            const connected = peer.data.state === "connected";
            const id = peer.data.key;
            return h("a.profile", {
              classList: [
                when(connected, "-connected"),
              ],
              href: id,
            }, [
              h("div.avatar", [api.about.html.image(id)]),
              h("div.main", [
                h("div.name", [api.about.obs.name(id)]),
              ]),
              h("div.progress", [
                api.progress.html.peer(id),
              ]),
              h("div.controls", [
                h("a.disconnect", {
                  href: "#",
                  "ev-click": send(disconnect, address),
                  title: i18n("Force Disconnect"),
                }, ["x"]),
              ]),
            ]);
          }),
        ]),
      ];
    }

    function SuggestedPeerList(peers, title) {
      return [
        when(computed(peers, (arr) => arr.length), h("h2", title)),
        h("div", {
          classList: "ProfileList",
        }, [
          map(slow(peers), (peer) => {
            const id = peer.data.key;
            return h("a.profile", { href: id }, [
              h("div.main", [
                h("div.name", [api.about.obs.name(id)]),
              ]),
              h("div.controls", [
                h("a.connect", {
                  href: "#",
                  "ev-click": send(connect, peer),
                  title: i18n("Connect"),
                }, [i18n("Connect")]),
              ]),
            ]);
          }),
        ]),
      ];
    }

    function noVisibleNewPostsWarning() {
      const explanation = i18n(
        "You may not be able to see new content until you follow some users or pubs.",
      );

      const shownWhen = computed(
        [contact.sync, contact.isNotFollowingAnybody],
        (contactSync, isNotFollowingAnybody) =>
          contactSync && isNotFollowingAnybody,
      );

      return api.feed.html.followWarning(shownWhen, explanation);
    }

    function noFollowersWarning() {
      const explanation = i18n(
        "Nobody will be able to see your posts until you have a follower. The easiest way to get a follower is to use a pub invite as the pub will follow you back. If you have already redeemed a pub invite and you see it has not followed you back on your profile, try another pub.",
      );

      // We only show this if the user has followed someone as the first warning ('You are not following anyone')
      // should be sufficient to get the user to join a pub. However, pubs have been buggy and not followed back on occasion.
      // Additionally, someone on-boarded on a local network might follow someone on the network, but not be followed back by
      // them, so we begin to show this warning if the user has followed someone, but has no followers.
      const shownWhen = computed(
        [contact.sync, contact.hasNoFollowers, contact.isNotFollowingAnybody],
        (contactSync, hasNoFollowers, isNotFollowingAnybody) =>
          contactSync && (hasNoFollowers && !isNotFollowingAnybody),
      );

      return api.feed.html.followerWarning(shownWhen, explanation);
    }

    function connect(peer) {
      api.sbot.async.connConnect(peer.address, peer.data, () => {});
    }

    function disconnect(addr) {
      onceTrue(api.sbot.obs.connection, (sbot) => {
        sbot.patchwork.disconnect(addr);
      });
    }
  }
};
