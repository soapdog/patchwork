const nest = require("depnest");
const extend = require("xtend");
const ssbMentions = require("ssb-mentions");
const displaySheet = require("../../../sheet/display");
const blobFiles = require("ssb-blob-files");
const ref = require("ssb-ref");
const pull = require("pull-stream");
const Book = require("scuttle-book");

const { Value, h, computed, when } = require("mutant");

exports.gives = nest("books.sheet.edit");

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
  return nest("books.sheet.edit", function (id) {
    const ssbBook = Book(api.sbot.obs.connection);

    getCurrentValues(id, (err, msg) => {
      if (err) {
        return showDialog({
          type: "info",
          title: i18n("Update Book"),
          buttons: [i18n("OK")],
          message: i18n("Cannot load book"),
          detail: err.stack,
        });
      }

      console.log("editing", msg.book);

      const publishing = Value(false);
      let blurTimeout = null;
      const focused = Value(false);
      const files = [];
      const isbn = Value();
      const filesById = {};

      const newBook = {
        title: Value(msg.book?.common?.title),
        author: Value(msg.book?.common?.authors),
        images: Value(msg.book?.common?.images),
        description: Value(msg.book?.common?.description),
        series: Value(msg.book?.common?.series),
        seriesNo: Value(msg.book?.common?.seriesNo),
      };

      if (Array.isArray(msg.book?.common?.images)) {
        newBook.images.set(msg.book?.common?.images[0]);
      }

      if (Array.isArray(msg.book?.common?.authors)) {
        newBook.author.set(msg.book?.common?.authors.join(", "));
      }

      const imageUrl = computed(
        newBook.images,
        (id) => id && api.blob.sync.url(id),
      );

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
            }, [i18n("Edit Book")]),
            h("BookEditor", [
              h("div.controls", [
                h("input.isbn", {
                  placeholder: i18n("ISBN"),
                  hooks: [ValueHook(isbn)],
                }),
                h("button", {
                  "ev-click": fetchMetadata,
                }, "Fetch metadata using ISBN"),
              ]),
              h("input.title", {
                id: "input-title",
                placeholder: i18n("Book Title"),
                hooks: [ValueHook(newBook.title), FocusHook()],
              }),
              h("input.title", {
                id: "input-authors",
                placeholder: i18n("Book Authors (comma separated)"),
                hooks: [ValueHook(newBook.author)],
              }),
              h("CoverAndDescription", [
                h("textarea.description", {
                  id: "textarea-description",
                  placeholder: i18n("Book description"),
                  hooks: [
                    ValueHook(newBook.description),
                  ],
                }),
                h("ImageInput .banner", {
                  style: {
                    "background-image": computed(imageUrl, (x) => `url(${x})`),
                  },
                }, [
                  h("span", ["🖼 ", i18n("Choose Cover Image...")]),
                  api.blob.html.input((err, file) => {
                    if (err) {
                      console.log("err thumb", err);
                      return;
                    }
                    newBook.images.set(file);
                  }, {
                    accept: "image/*",
                  }),
                ]),
              ]),
              h("input.title", {
                id: "input-series",
                placeholder: i18n("Book Series Name"),
                hooks: [ValueHook(newBook.series)],
              }),
              h("input.title", {
                placeholder: i18n("Book Series Number"),
                hooks: [ValueHook(newBook.seriesNo)],
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
        == Fetch metadata ===========================================================================================================
        */

        // async function fetchImage(url) {
        //   const img = new Image();
        //   return new Promise((res, rej) => {
        //     img.onload = () => res(img);
        //     img.onerror = (e) => rej(e);
        //     img.src = url;
        //   });
        // }

        async function fetchMetadata() {
          const url = `https://openlibrary.org/isbn/${isbn()}.json`;
          try {
            const response = await fetch(url);
            if (!response.ok) {
              alert("Couldn't find the book using Open Library API. Sorry.");
              console.error(`Response status: ${response.status}`);
              return;
            }

            const metadata = await response.json();
            console.log("book metadata from open library", metadata);

            const coverUrl =
              `https://covers.openlibrary.org/b/isbn/${isbn()}-L.jpg`;
            const coverResponse = await fetch(coverUrl);
            const coverBlob = await coverResponse.blob();
            const coverFile = new File([coverBlob], "book_cover.png");

            if (metadata?.by_statement) {
              newBook.author.set(metadata.by_statement);
              document.getElementById("input-authors").value =
                metadata.by_statement;
            } else if (metadata.authors) {
              const authorUrl = `https://openlibrary.org/${
                metadata.authors[0].key
              }.json`;
              const authorResponse = await fetch(authorUrl);
              const author = await authorResponse.json();
              newBook.author.set(author.name);
              document.getElementById("input-authors").value = author.name;
            }

            if (metadata?.description?.value) {
              newBook.description.set(metadata.description.value);
              document.getElementById("textarea-description").value =
                metadata.description.value;
            } else if (metadata?.description) {
              newBook.description.set(metadata.description);
              document.getElementById("textarea-description").value =
                metadata.description;
            } else {
              const worksUrl = `https://openlibrary.org/${
                metadata.works[0].key
              }.json`;
              const worksResponse = await fetch(worksUrl);
              const work = await worksResponse.json();
              console.log("work", work);

              if (work?.description?.value) {
                newBook.description.set(work.description.value);
                document.getElementById("textarea-description").value =
                  work.description.value;
              } else if (work?.description) {
                newBook.description.set(work.description);
                document.getElementById("textarea-description").value =
                  work.description;
              }
            }

            if (metadata?.series) {
              newBook.series = metadata.series[0];
              document.getElementById("input-series").value =
                metadata.series[0];
            }

            newBook.title.set(metadata.title);
            document.getElementById("input-title").value = metadata.title;

            const opts = {
              isPrivate: false,
              stripExif: false,
              quality: 1,
              maxSize: 5 * 1024 * 1024,
            };

            blobFiles(
              [coverFile],
              api.sbot.obs.connection,
              opts,
              (err, result) => {
                if (err) {
                  console.log("err thumb", err);
                  return;
                }
                console.log("cover result blob", result);
                newBook.images.set(result);
              },
            );
          } catch (error) {
            console.log(error);
            console.error(error.message);
          }
        }

        /*
      == Publishing functions ===========================================================================================================
      */

        function save() {
          // no confirm
          const previewObj = {};

          previewObj.images = [newBook.images()];
          previewObj.title = newBook.title();
          previewObj.authors = newBook.author();
          previewObj.series = newBook.series();
          previewObj.description = newBook.description();
          previewObj.seriesNo = newBook.seriesNo();

          previewObj.authors = previewObj.authors.split(",").map((a) =>
            a.trim()
          );

          const previewOpts = {
            key: id,
            publiclyEditable: false,
            value: {
              author: api.keys.sync.id(),
              private: false,
              content: {
                type: "bookclub",
                ...previewObj,
              },
            },
          };

          api.message.sheet.preview(previewOpts, (err, confirmed) => {
            if (err) throw err;
            if (confirmed) {
              createBook(previewObj);
            }
          });

          function createBook(bookObj) {
            publishing.set(true);

            if (!bookObj.series) {
              delete bookObj.series
            }

            if (!bookObj.seriesNo) {
              delete bookObj.seriesNo
            }

            if (id) {
              ssbBook.async.update(id, bookObj, function (err, msg) {
                console.log("Updating book...");
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
                  api.app.refresh(id);
                  close();
                }
              });
            } else {
              bookObj.type = "bookclub"
              ssbBook.async.create(bookObj, function (err, msg) {
                console.log("Creating book...");
                if (err) {
                  console.log("book", bookObj)
                  console.log("error", err)
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
                  api.app.refresh(msg.key);
                  close();
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
      alert(`${opts.message}\n\n${opts.detail}`)
    }

    function getCurrentValues(id, cb) {
      if (id) {
        ssbBook.async.get(id, true, (err, value) => {
          if (err) return cb(err);

          if (
            (value.common.images &&
              Object.keys(value.common.images).length == 0) &&
            (value.common.image && Object.keys(value.common.image).length > 0)
          ) {
            value.common.images = value.common.image;
          }

          cb(null, { book: value });
        });
      } else {
        cb(null, { book: {} });
      }
    }

    /*
    == Blob support functions for textArea ===========================================================================================================
    */

    function onDragOver(ev) {
      ev.dataTransfer.dropEffect = "copy";
      ev.preventDefault();
      return false;
    }

    function onDrop(ev) {
      ev.preventDefault();

      const files = ev.dataTransfer && ev.dataTransfer.files;
      if (!files || !files.length) return;

      ev.dataTransfer.dropEffect = "copy";
      attachFiles(files);
      return false;
    }

    function attachFiles(files) {
      blobFiles(files, api.sbot.obs.connection, {
        stripExif: true,
        isPrivate: false,
      }, afterAttach);
    }

    function afterAttach(err, file) {
      if (err) {
        if (err instanceof blobFiles.MaxSizeError) {
          warningMessage.set([
            // TODO: handle localised error messages (https://github.com/ssbc/ssb-blob-files/issues/3)
            "⚠️ ",
            i18n(
              "{{name}} ({{size}}) is larger than the allowed limit of {{max_size}}",
              {
                name: err.fileName,
                size: humanSize(err.fileSize),
                max_size: humanSize(err.maxFileSize),
              },
            ),
          ]);
        }
        return;
      }

      files.push(file);

      const parsed = ref.parseLink(file.link);
      filesById[parsed.link] = file;

      const embed = isEmbeddable(file.type) ? "!" : "";
      const pos = bookDescriptionTextArea.selectionStart;
      let before = bookDescriptionTextArea.value.slice(0, pos);
      let after = bookDescriptionTextArea.value.slice(pos);

      const spacer = embed ? "\n" : " ";
      if (before && !before.endsWith(spacer)) before += spacer;
      if (!after.startsWith(spacer)) after = spacer + after;

      const embedPrefix = getEmbedPrefix(file.type);

      bookDescriptionTextArea.value =
        `${before}${embed}[${embedPrefix}${file.name}](${file.link})${after}`;
      console.log("added:", file);
    }

    function isEmbeddable(type) {
      return type.startsWith("image/") || type.startsWith("audio/") ||
        type.startsWith("video/");
    }

    function getEmbedPrefix(type) {
      if (typeof type === "string") {
        if (type.startsWith("audio/")) return "audio:";
        if (type.startsWith("video/")) return "video:";
      }
      return "";
    }

    function humanSize(size) {
      return (Math.ceil(size / (1024 * 1024) * 10) / 10) + " MB";
    }

    // ====== end of blob support ======
  });
};
