const nest = require("depnest");
const extend = require("xtend");
const ssbMentions = require("ssb-mentions");
const displaySheet = require("../../../sheet/display");
const blobFiles = require("ssb-blob-files");
const ref = require("ssb-ref");
const pull = require("pull-stream");
const Book = require("scuttle-book");

const { Value, h, computed, when } = require("mutant");

exports.gives = nest("books.sheet.review");

exports.needs = nest({
  "app.refresh": "first",
  "message.sheet.preview": "first",
  "keys.sync.id": "first",
  "sbot.async.publish": "first",
  "sbot.async.get": "first",
  "about.async.latestValues": "first",
  "sbot.obs.connection": "first",
  "blob.html.input": "first",
  "blob.sync.url": "first",
  "intl.sync.i18n": "first",
  "suggest.hook": "first",
});

exports.create = function (api) {
  const i18n = api.intl.sync.i18n;
  return nest("books.sheet.review", function (id) {
    const ssbBook = Book(api.sbot.obs.connection);

    console.log("reviewing", id);

    const publishing = Value(false);
    let blurTimeout = null;
    const focused = Value(false);

    const newReview = {
      review: Value(),
      rating: Value(), // e.g. 4
      ratingMax: Value(), // out of, e.g. 5
      ratingType: Value(), // text or emoticon
      shelves: Value(),
    };

    displaySheet((close) => {
      return {
        content: h("div", {
          style: {
            padding: "20px",
            "text-align": "center",
          },
        }, [
          h("h2", {
            style: {
              "font-weight": "normal",
            },
          }, [i18n("Review Book")]),
          h("BookReviewEditor", [
            h("input.field", {
              placeholder: i18n("Rating (ex: 4)"),
              hooks: [ValueHook(newReview.rating), FocusHook()],
            }),
            h("input.field", {
              placeholder: i18n("Max rating (ex: 5)"),
              hooks: [ValueHook(newReview.ratingMax)],
            }),
            h("input.field", {
              placeholder: i18n(
                "Rating type (Ex :star:) (you can use emojis)",
              ),
              hooks: [ValueHook(newReview.ratingType)],
            }),

            h("textarea.review", {
              placeholder: i18n("Type in your review"),
              hooks: [
                ValueHook(newReview.review),
              ],
            }),
            h("input.field", {
              placeholder: i18n("Shelves (comma separated value)"),
              hooks: [ValueHook(newReview.shelves)],
            }),
          ]),
        ]),
        footer: [
          h(
            "button -save",
            {
              "ev-click": save,
              disabled: publishing,
            },
            when(
              publishing,
              i18n("Publishing..."),
              i18n("Preview & Publish"),
            ),
          ),
          h("button -cancel", {
            "ev-click": close,
          }, i18n("Cancel")),
        ],
      };

      /*
      == Publishing functions ===========================================================================================================
      */

      function save() {
        // no confirm
        const previewObj = {};

        previewObj.rating = newReview.rating();
        previewObj.ratingMax = newReview.ratingMax() ?? 5;
        previewObj.ratingType = newReview.ratingType() ?? ":star:";
        previewObj.review = newReview.review() ?? "";
        previewObj.shelves = newReview.shelves();

        if (previewObj.shelves) {
          previewObj.shelves = previewObj.shelves.split(",").map((a) =>
            a.trim()
          );
        } else {
          delete previewObj.shelves;
        }

        const previewOpts = {
          key: id,
          publiclyEditable: false,
          value: {
            author: api.keys.sync.id(),
            private: false,
            content: {
              type: "bookclubUpdate",
              ...previewObj,
              updates: id,
            },
          },
        };

        api.message.sheet.preview(previewOpts, (err, confirmed) => {
          if (err) throw err;
          if (confirmed) {
            publishReview(previewObj);
          }
        });

        function publishReview(reviewObj) {
          publishing.set(true);

          if (id) {
            ssbBook.async.update(id, reviewObj, function (err, msg) {
              console.log("Reviewing book...");
              console.log(msg);
              console.log(err);
              if (err) {
                publishing.set(false);
                showDialog({
                  type: "error",
                  title: i18n("Error"),
                  buttons: ["OK"],
                  message: i18n(
                    "An error occurred while attempting to add this book.",
                  ),
                  detail: err.message,
                });
              } else {
                publishing.set(false);
                close();
                api.app.refresh(id);
              }
            });
          }
        }
      }
    });
  });

  function isObject(value) {
    return value && typeof value === "object";
  }

  function FocusHook() {
    return function (element) {
      setTimeout(() => {
        element.focus();
        element.select();
      }, 5);
    };
  }

  function ValueHook(obs) {
    return function (element) {
      element.value = obs();
      element.oninput = function () {
        obs.set(element.value.trim());
      };
    };
  }

  function showDialog(opts) {
    const remote = require("@electron/remote");

    remote.dialog.showMessageBox(
      remote.getCurrentWindow(),
      opts,
    );
  }
};
