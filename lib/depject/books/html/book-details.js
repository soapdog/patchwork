const nest = require("depnest");
const { h, when, resolve, send } = require("mutant");

exports.gives = nest("books.html", {
  details: true,
});

exports.needs = nest({
  "app.navigate": "first",
  "about.obs.color": "first",
  "blob.sync.url": "first",
  "message.html.markdown": "first",
  "profile.html.person": "first",
  "books.sheet.edit": "first",
  "books.sheet.review": "first"
});

exports.create = function (api) {
  return nest("books.html", {
    details: bookDetails,
  });

  function bookDetails({ book, blobUrl, color, msg }) {
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
      let reviews = [];

      for (const reviewAuthor in book.reviews) {
        const o = book.reviews[reviewAuthor];

        if (o.rating !== "") {
          reviewCount += 1;
          if (!o.ratingType) {
            o.ratingType = ":star:";
          }
          if (!o.ratingMax) {
            o.ratingMax = 5;
          }
          let reviewBlurb =
            `Rated ${o.rating} ${o.ratingType} out of ${o.ratingMax}.`;

          if (o.review?.length > 0) {
            reviewBlurb += `\n\n${o.review}`;
          }

     if (o.shelves?.length > 0) {
      if (Array.isArray(o.shelves)) {
        if (o.shelves.length == 1 && o.shelves[0] !== "") {
          reviewBlurb += `\n\nShelved in: ${o.shelves.join(", ")}.`;
        }
      } else if (!Array.isArray(o.shelves)) {
        reviewBlurb += `\n\nShelved in: ${o.shelves}.`;
      }
    }

          reviewBlurb += `\n\n---`;
          reviews.push(h("div.review", [
            api.profile.html.person(reviewAuthor),
            api.message.html.markdown(reviewBlurb),
          ]));
        } else if (o.comments.length > 0) {
          reviewCount += 1;
        }
      }

      const reviewSection = when(
        reviewCount > 0,
        h("div.reviews", [
          h("h2", "Reviews"),
          ...reviews,
        ]),
        "",
      );

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
            h("div.summary", [
              api.message.html.markdown(abbreviatedDescription),
            ]),
            h("div.readers", [
              h("span", `${readerCount} readers`),
              h("span", `${reviewCount} reviews`),
            ]),
            h("div.actions",[
            h("button.editor", {
              "ev-click": send(api.books.sheet.edit, msg.key),
            }, "Edit Details"),
            h("button.add-review", {
              "ev-click": send(api.books.sheet.review, msg.key),
            }, "Add Review"),
            h("button.add-review", {
              "ev-click": send(api.app.navigate, msg.key),
            }, "Refresh"),
          ]),
            reviewSection,
          ]),
          thumbnail,
        ]),
      ]);

      return b;
    }
  
};
