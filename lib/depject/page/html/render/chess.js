const { h } = require("mutant");
const nest = require("depnest");
const SsbChessDataAccess = require("ssb-chess-data-access");
const SsbChessMithril = require("ssb-chess-mithril");
const { onceTrue } = require("mutant");

exports.needs = nest({
  "sbot.obs.connection": "first",
  "intl.sync.i18n": "first",
});

exports.gives = nest("page.html.render");

exports.create = function (api) {
  return nest("page.html.render", function channel(path) {
    if (path !== "/chess") return;

    const page =
      h("div.wrapper", [
        h(
          "section.content",
          h("div", { id: "ssb-chess-mithril-plugin", style: {'margin-top':'20px'} }),
        ),
      ]);

      onceTrue(api.sbot.obs.connection, (ssb) => {
        const loadChess = () => {
          const attachToElement = document.getElementById(
            "ssb-chess-mithril-plugin",
          );

          if (!attachToElement) {
            console.log("no element, loop");
            setTimeout(() => {
              loadChess();
            }, 500);
            return;
          }

          const dataAccess = new SsbChessDataAccess.SbotClassic(ssb);

          SsbChessMithril(attachToElement, dataAccess);
        };

        loadChess();
      });

      return page;
  });
};
