const { h } = require("mutant");
const nest = require("depnest");
const SsbChessDataAccess = require("ssb-chess-data-access");
const SsbChessMithril = require("ssb-chess-mithril");
const { onceTrue, computed } = require("mutant");
const defer = require('pull-defer');
const pull = require('pull-stream');

exports.needs = nest({
  "sbot.obs.connection": "first",
  "intl.sync.i18n": "first",
});

exports.gives = nest({
  "page.html": ["render", "notifications"],
});

function createChess(ssb) {
  const dataAccess = new SsbChessDataAccess.SbotClassic(ssb);
  return SsbChessMithril(dataAccess);
}

function waitForSbot(api) {
  return new Promise((resolve, reject) => {
    onceTrue(api.sbot.obs.connection, (ssb) => {
      resolve(ssb)
    })
  })
}

exports.create = function (api) {
  return nest({
    "page.html": {
      notifications: function() {
        const deferred = defer.source()

        waitForSbot(api)
          .then(createChess)
          .then(chess => pull(
            chess.notifications.getNotificationStream(),
            pull.map(notification => ({
              icon: null,
              title: "Chess",
              message: notification.message,
              open: `/chess`,
              anchor: {
                gameId: notification.gameId
              }
            }))
          )
        ).then(notificationStream => deferred.resolve(notificationStream))

        return deferred;
      },
      render: function channel(path) {
        if (!path.startsWith("/chess")) return;

        const page = h("div.wrapper", { className: "Scroller" }, [
          h(
            "section.content",
            h("div", {
              id: "ssb-chess-mithril-plugin",
              style: { "margin-top": "20px" },
            }),
          ),
        ]);

        const chessMountTarget = document.createElement('div')

        const chessComponent = waitForSbot(api)
          .then(createChess)
          .then(chess =>chess.mount(chessMountTarget));

        const view = computed(page, (p) => {
          const chessElem = p.querySelector('#ssb-chess-mithril-plugin');
          chessElem.appendChild(chessMountTarget)
          return p
        }, {
          onUnlisten: () => {
            chessComponent.then(x => x.destroy());
          },
        });

        view.setAnchor = function(data) {
          if (data && data.gameId) {
            const gameId = data.gameId;
            chessComponent.then(c => c.goToGame(gameId))
          }
        }

        return view;
      },
    },
  });
};
