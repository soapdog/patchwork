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
  "books.html.details": "first"
});

exports.create = function (api) {
  return nest("message.html", {
    render: bookRenderer,
    canRender,
  });

  function bookRenderer(msg, opts) {
    if (!canRender(msg)) return;

    /*
    book messages changed a lot over time.

    Lots of hacks and workarounds are needed.
    */

    let book;

    if (msg.bookDetailsView) {
      book = msg.book;
    } else {
      book = msg;
    }

    // fix: that is our own. This might be called without
    // passing through 'book.async.get' and thus not have
    // the normalised 'common' field. An example of such use
    // is the preview sheet. In this case, we just fake it.

    if (!book.hasOwnProperty("common")) {
      book.common = msg.value.content;
      book.readers = [];
      book.reviews = [];
    }

    // fix: some messages call the cover images
    // others call it image.
    if (book.common?.images && !book.common?.image) {
      book.common.image = book.common?.images;
    }

    // fix: some very old messages somehow fail validation
    // using ssb-book-schema even though their error message
    // seems to contain a valid book in it.

    if (msg.hasOwnProperty("errors") && msg.value.content?.common) {
      console.log("ssb-book-schema flags errors", msg.errors);
      book = book.value.content;
      book.readers = [];
      book.reviews = [];
    }

    // fix: extract first cover image in case images is an array
    if (Array.isArray(book.common.image)) {
      book.common.image = book.common.image[0];
    }

    // fix: ssb book schema has both author and authors and
    // they can both be arrays or string.
    if (!book.common?.authors && book.common?.author) {
      book.common.authors = book.common.author;
    }

    // show a card (if there's no body loaded) or the full blog (if the blog body is loaded)
    // msg is decorated with a `body` attribute when loaded using feed.obs.thread from patchcore
    if (msg.bookDetailsView) {
      content = api.books.html.details({
        book,
        onClick: () => api.app.navigate(msg.key),
        color: api.about.obs.color,
        blobUrl: api.blob.sync.url,
        msg
      });
    } else {
      content = api.books.html.card({
        book,
        onClick: () => api.app.navigate(msg.key),
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
    } else if (msg.value.content.type === "bookclubUpdate") {
      return true;
    } else {
      return false;
    }
  }
};
