const nest = require("depnest");
const Book = require("scuttle-book");
const { h, when, resolve, send, Value } = require("mutant");
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
});

exports.create = function (api) {
  return nest("message.html", {
    render: bookReviewRenderer,
    canRender,
  });

  function bookReviewRenderer(msg, opts) {
    if (!canRender(msg)) return;

    console.log("review msg", msg);
    const review = msg.value.content;
    const book = Book(api.sbot.obs.connection);
    const title = Value("fetching book title...");

    book.async.get(review.updates, false, (err, result) => {
      console.log("book resolved", result);
      if (!err) {
        title.set(result.common.title);
      }
    });

    if (!review.ratingType) {
      review.ratingType = ":star:";
    }
    if (!review.ratingMax) {
      review.ratingMax = 5;
    }
    let reviewBlurb =
      `Rated ${review.rating} ${review.ratingType} out of ${review.ratingMax}.`;

    if (review.review?.length > 0) {
      reviewBlurb += `\n\n${review.review}`;
    }

    if (review.shelves?.length > 0) {
      if (Array.isArray(review.shelves)) {
        if (!(review.shelves.length == 1 && review.shelves[0] !== "")) {
          reviewBlurb += `\n\nShelved in: ${review.shelves.join(", ")}.`;
        }
      } else if (!Array.isArray(review.shelves)) {
        reviewBlurb += `\n\nShelved in: ${review.shelves}.`;
      }
    }

    const content = h("BookReviewCard", [
      h("div.review", [
        h("h4", { id: "book-title" }, title),
        api.message.html.markdown(reviewBlurb),
        h("button", {
          "ev-click": () => api.app.navigate(review.updates),
        }, "View Book Details"),
      ]),
    ]);

    const element = api.message.html.layout(
      msg,
      Object.assign({}, {
        content,
        miniContent: "Reviewed a book",
        layout: "mini",
      }, opts),
    );

    return addContextMenu(element, { msg });
  }

  function canRender(msg) {
    console.log("book reivew", msg)
    if (
      msg.value.content.type === "bookclubUpdate" && msg.value.content.rating
    ) {
      return true;
    } else {
      return false;
    }
  }
};
