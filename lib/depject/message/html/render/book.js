const nest = require("depnest");
const book = require("scuttle-book");
const { h, when, resolve, send } = require("mutant");
const addContextMenu = require(
  "../../../../message/html/decorate/context-menu",
);

exports.gives = nest("message.html", {
  canRender: true,
  render: true,
});

exports.needs = nest({
  "about.obs.color": "first",
  "app.navigate": "first",
  "blob.sync.url": "first",
  "message.html.layout": "first",
  "message.html.markdown": "first",
  "sbot.obs.connection": "first",
  "profile.html.person": "first",
  "books.sheet.edit": "first",
  "books.html.card": "first",
  "books.html.details": "first",
  "books.sync.fix":"first"
});

exports.create = function (api) {
  return nest("message.html", {
    render: bookRenderer,
    canRender,
  });

  function bookRenderer(msg, opts) {
    if (!canRender(msg)) return;

    let book = api.books.sync.fix(msg)  

    let navigationTarget = msg.key 

    if (book.common.updates) {
      navigationTarget = book.common.updates
    }
    // show a card (if there's no body loaded) or the full blog (if the blog body is loaded)
    // msg is decorated with a `body` attribute when loaded using feed.obs.thread from patchcore
    let content
    if (msg.bookDetailsView) {
      content = api.books.html.details({
        book,
        onClick: () => api.app.navigate(navigationTarget),
        color: api.about.obs.color,
        blobUrl: api.blob.sync.url,
        msg
      });
    } else {
      content = api.books.html.card({
        book,
        onClick: () => api.app.navigate(navigationTarget),
        color: api.about.obs.color,
        blobUrl: api.blob.sync.url,
      });
    }

    const element = api.message.html.layout(
      msg,
      Object.assign({}, {
        content,
        layout: "default",
      }, opts),
    );

    return addContextMenu(element, { msg });
}
    

  function canRender(msg) {
    if (msg.value.content.type === "bookclub") {
      return true;
    } else if (msg.value.content.type === "bookclubUpdate" && msg.value.content.title) {
      return true;
    } else {
      return false;
    }
  }
};
