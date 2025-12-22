const {
  Array: MutantArray,
  onceTrue,
  computed,
  Proxy,
  h,
  when,
  map,
  Value,
  watch,
  resolve,
} = require("mutant");
const nest = require("depnest");
const pull = require("pull-stream");
const Book = require("scuttle-book");

exports.needs = nest({
  "app.navigate": "first",
  "intl.sync.i18n": "first",
  "books.sheet.edit": "first",
  "sbot.pull.stream": "first",
  "sbot.obs.connection": "first",
  "blob.sync.url": "first",
  "about.obs.color": "first",
  "message.html.markdown": "first",
});

exports.gives = nest("page.html.render");

exports.create = function (api) {
  return nest("page.html.render", function channel(path) {
    if (path !== "/books") return;
    const i18n = api.intl.sync.i18n;
    const loading = Value(true);
    const searchSpinner = Value(false);
    const books = MutantArray();
    const listOfBooks = MutantArray();

    /*
== Auxiliary functions ===========================================================================================================
    */

    onceTrue(api.sbot.obs.connection, (sbot) => {
      const book = Book(sbot);

      pull(
        book.pull.books({ reverse: true }, true, false),
        pull.drain((item) => {
          books.push(item);
          listOfBooks.push(BookCard({
            book: item,
            onClick: () => api.app.navigate(item.key),
            color: api.about.obs.color,
            blobUrl: api.blob.sync.url,
          }));
          loading.set(false);
        }),
      );
    });

    function addNewBook() {
      api.books.sheet.edit();
    }

    function BookCard({ book, blobUrl, onClick, color }) {
      /*
    book messages changed a lot over time.

    Lots of hacks and workarounds are needed.
    */

      // fix 1: some messages call the cover images
      // others call it image.
      if (book.common?.images && !book.common?.image) {
        book.common.image = book.common?.images;
      }

      if (Array.isArray(book.common.image)) {
        book.common.image = book.common.image[0];
      }

      const thumbnail = when(
        book.common.image,
        h("BookCover", {
          style: {
            "background-image": `url("${
              blobUrl(resolve(book.common.image?.link || book.common.image))
            }")`,
            "background-position": "center",
            "background-size": "contain",
            "background-repeat": "no-repeat",
          },
        }),
        h("BookCover -empty", {
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
        thumbnail,
        h("div.content", [
          h("div.text.Markdown", [
            h("h1", book.common.title),
            h("div.authors", authors),
            when(
              book.common.series,
              h(
                "div.series",
                `${
                  book.common.seriesNo ? "#" + book.common.seriesNo : "A book"
                } in '${book.common.series}' series.`,
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
        ]),
      ]);

      return b;
    }

    /*
== mutant content ===========================================================================================================
    */

    const prepend = [
      h("PageHeading", [
        h("h1", [h("strong", i18n("Books"))]),
        h("div.meta", [
          h("button -add", {
            "ev-click": addNewBook,
          }, i18n("Add New Book")),
        ]),
      ]),
    ];

    return h("Scroller", { style: { overflow: "auto" } }, [
      h("div.wrapper", [
        h("section.prepend", prepend),
        h(
          "section.content",
          h("BookGrid", [map(listOfBooks, (i) => i)]),
        ),
        when(
          loading,
          searchSpinner ? h("Loading -large -search") : h("Loading -large"),
        ),
      ]),
    ]);
  });
};
