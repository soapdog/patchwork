const nest = require("depnest");
const book = require("scuttle-book");
const { h, when, resolve } = require("mutant");
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
});

exports.create = function (api) {
  return nest("message.html", {
    render: bookRenderer,
    canRender,
  });

  function bookRenderer(msg, opts) {
    if (!canRender(msg)) return;
    // show a card (if there's no body loaded) or the full blog (if the blog body is loaded)
    // msg is decorated with a `body` attribute when loaded using feed.obs.thread from patchcore
    if (msg.bookDetailsView) {
      content = BookDetails({
        book: msg.book,
        onClick: () => api.app.navigate(msg.key),
        color: api.about.obs.color,
        blobUrl: api.blob.sync.url,
      });
    } else {
      content = BookCard({
        book: msg,
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

  function BookCard({ book, blobUrl, onClick, color }) {
    const thumbnail = when(
      book.common.image,
      h("Thumbnail", {
        style: {
          "background-image": `url("${
            blobUrl(resolve(book.common.image?.link || book.common.image))
          }")`,
          "background-position": "center",
          "background-size": "contain",
          "background-repeat": "no-repeat",
        },
      }),
      h("Thumbnail -empty", {
        style: { "background-color": color(book.common.title) },
      }, [
        h("i.fa.fa-file-text-o"),
      ]),
    );

    const abbreviatedDescription =
      book.common.description.split(/\s+/).slice(0, 100).join(" ") + "...";

    let authors = ""

    if (typeof book.common?.authors === "string") {
      authors = book.common.authors
    } else if (Array.isArray(book.common?.authors)) {
      authors = book.common.authors.join(", ")
    } else {
      authors = "Unknown author"
      console.log("unknown author", book)
    }

    const readerCount = book.readers.length

    let reviewCount = 0 

    for (const reviewAuthor in book.reviews) {
      const o = book.reviews[reviewAuthor]

      if (o.rating !=="") {
        reviewCount += 1
      } else if (o.comments.length > 0) {
        reviewCount += 1
      }
    }

    const b = h("BookCard", { "ev-click": onClick }, [
      // h('div.context', [
      //   api.about.html.avatar(author, 'tiny'),
      //   h('div.name', api.about.obs.name(author)),
      //   api.message.html.timeago(blog)
      // ]),
      h("div.content", [
        h("div.text.Markdown", [
          h("h1", book.common.title),
          h("div.authors", authors),
          h("div.summary", [
            api.message.html.markdown(abbreviatedDescription)
          ]),
          h("div.readers", [
            h("span", `${readerCount} readers`),
            h("span", `${reviewCount} reviews`)
          ]),
          h("div.read", "Read More"),
        ]),
        thumbnail,
      ]),
    ]);

    return b;
  }

  function BookDetails({ book, blobUrl, color }) {
    const thumbnail = when(
      book.common.image,
      h("Thumbnail", {
        style: {
          "background-image": `url("${
            blobUrl(resolve(book.common.image?.link || book.common.image))
          }")`,
          "background-position": "center",
          "background-size": "contain",
          "background-repeat": "no-repeat",
        },
      }),
      h("Thumbnail -empty", {
        style: { "background-color": color(book.common.title) },
      }, [
        h("i.fa.fa-file-text-o"),
      ]),
    );

    const abbreviatedDescription =
      book.common.description.split(/\s+/).slice(0, 100).join(" ") + "...";

    let authors = ""

    if (typeof book.common?.authors === "string") {
      authors = book.common.authors
    } else if (Array.isArray(book.common?.authors)) {
      authors = book.common.authors.join(", ")
    } else {
      authors = "Unknown author"
      console.log("unknown author", book)
    }

    const readerCount = book.readers.length

    let reviewCount = 0 

    for (const reviewAuthor in book.reviews) {
      const o = book.reviews[reviewAuthor]

      if (o.rating !=="") {
        reviewCount += 1
      } else if (o.comments.length > 0) {
        reviewCount += 1
      }
    }

    const b = h("BookDetails", [
      // h('div.context', [
      //   api.about.html.avatar(author, 'tiny'),
      //   h('div.name', api.about.obs.name(author)),
      //   api.message.html.timeago(blog)
      // ]),
      h("div.content", [
        h("div.text.Markdown", [
          h("h1", book.common.title),
          h("div.authors", authors),
          h("span", "details view"),
          h("div.summary", [
            api.message.html.markdown(abbreviatedDescription)
          ]),
          h("div.readers", [
            h("span", `${readerCount} readers`),
            h("span", `${reviewCount} reviews`)
          ]),
          h("div.read", "Read More"),
        ]),
        thumbnail,
      ]),
    ]);

    return b;
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
