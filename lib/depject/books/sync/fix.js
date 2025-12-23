const nest = require("depnest");

exports.gives = nest("books.sync", {
  fix: true,
});

exports.create = function (api) {
  return nest("books.sync", {
    fix: fixBook,
  });

  function fixBook(msg) {
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

    return book
  }

}