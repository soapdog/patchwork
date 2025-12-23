const nest = require("depnest");
const { h, when, resolve, send } = require("mutant");

exports.gives = nest("books.html", {
  card: true,
});

exports.needs = nest({
  "about.obs.color": "first",
  "blob.sync.url": "first",
  "message.html.markdown": "first",
  "books.sync.fix": "first"
});

exports.create = function (api) {
  return nest("books.html", {
    card: bookCard,
  });

  function bookCard({ book, blobUrl, onClick, color }) {
    book = api.books.sync.fix(book)
    console.log("book card", book)
    const thumbnail = when(
      book.common.image,
      h("Thumbnail", {
        style: {
          "background-image": `url("${
            blobUrl(resolve(book.common.image?.link || book.common.image))
          }")`,
          "background-position": "top",
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

    let authors = "";

    if (typeof book.common?.authors === "string") {
      authors = book.common.authors;
    } else if (Array.isArray(book.common?.authors)) {
      authors = book.common.authors.join(", ");
    } else {
      authors = "Unknown author";
      console.log("unknown author", book);
    }

    const readerCount = book.readers.length;

    let reviewCount = 0;

    for (const reviewAuthor in book.reviews) {
      const o = book.reviews[reviewAuthor];

      if (o.rating !== "") {
        reviewCount += 1;
      } else if (o.comments.length > 0) {
        reviewCount += 1;
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
          when(
            book.common.series,
            h(
              "div.series",
              `#${book.common.seriesNo} in '${book.common.series}' series.`,
            ),
          ),
          h("div.summary", [
            api.message.html.markdown(abbreviatedDescription),
          ]),
          h("div.readers", [
            h("span", `${readerCount} readers`),
            h("span", `${reviewCount} reviews`),
          ]),
          h("div.read", "Read More"),
        ]),
        thumbnail,
      ]),
    ]);

    return b;
  }
};
