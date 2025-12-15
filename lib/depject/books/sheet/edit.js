const nest = require("depnest");
const extend = require("xtend");
const ssbMentions = require("ssb-mentions");
const displaySheet = require("../../../sheet/display");
const blobFiles = require("ssb-blob-files");
const ref = require("ssb-ref");
const pull = require("pull-stream");

const { Value, h, computed, when } = require("mutant");

exports.gives = nest("books.sheet.edit");

exports.needs = nest({
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
    const publishing = Value(false);
    let blurTimeout = null;
    const focused = Value(false);
    const files = [];
    const filesById = {};

    const newBook = {
      title: Value(),
      author: Value(),
      images: Value(),
      description: Value(),
      series: Value(),
      seriesNo: Value()
    };

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
            h("input.title", {
              placeholder: i18n("Book Title"),
              hooks: [ValueHook(newBook.title), FocusHook()],
            }),
            h("input.title", {
              placeholder: i18n("Book Authors (comma separated)"),
              hooks: [ValueHook(newBook.authors)],
            }),
            h("CoverAndDescription", [
              h("textarea.description", {
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
            when(publishing, i18n("Publishing..."), i18n("Preview & Publish")),
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

        previewObj.thumbnail = blogPost.thumbnail();
        previewObj.title = blogPost.title() || i18n("Untitled Post");
        previewObj.content = blogPost.blog();
        previewObj.summary = blogPost.summary();

        // gatherings consist of multiple messages (maybe none of them exist yet), so we need to
        // construct the preview dialog manually, and override the about values
        const previewOpts = {
          key: id,
          publiclyEditable: false,
          value: {
            author: api.keys.sync.id(),
            private: false, // patchwork can only make public gatherings
            content: {
              type: "blog",
              title: previewObj.title,
              blog: "&51ZXxNYIvTDCoNTE9R94NiEg3JAZAxWtKn4h4SmBwyY=.sha256", // fake blog so we pass isBlog()
            },
          },
        };

        if (previewObj.thumbnail?.link) {
          previewOpts.value.content.thumbnail = previewObj.thumbnail.link;
          previewObj.thumbnail = previewObj.thumbnail?.link
        }

        if (previewObj.summary) {
          previewOpts.value.content.summary = previewObj.summary;
        }

        api.message.sheet.preview(previewOpts, (err, confirmed) => {
          if (err) throw err;
          if (confirmed) {
            publishBlogPost(previewObj);
          }
        });

        function publishBlogPost(data) {
          publishing.set(true);

          let msgToPost = { type: "blog" };
          let blogContent = data.content;

          const commonFields = [
            "channel",
            "contentWarning",
            "thumbnail",
            "title",
            "summary",
          ];

          commonFields.forEach((f) => {
            if (
              typeof data[f] !== "undefined" &&
              data[f] !== null &&
              data[f] !== false &&
              data[f].length > 0
            ) {
              msgToPost[f] = data[f];
            }
          });

          msgToPost.mentions = ssbMentions(blogContent) || [];

          if (
            msgToPost.contentWarning && msgToPost.contentWarning.length > 0
          ) {
            let moreMentions = ssbMentions(msgToPost.contentWarning);
            msgToPost.mentions = msgToPost.mentions.concat(moreMentions);
          }

          msgToPost.mentions = msgToPost.mentions.filter((n) => n); // prevent null elements...

          const file = new File([blogContent], "blogpost.txt", {
            type: "text/plain",
          });

          pull(
            blobFiles([file], api.sbot.obs.connection, function (err, blob) {
              // 'hash' is the hash-id of the blob
              if (err) {
                publishing.set(false);
                showDialog({
                  type: "error",
                  title: i18n("Error"),
                  buttons: ["OK"],
                  message: i18n(
                    "could not create blog post blob",
                  ),
                  detail: err.message,
                });
              } else {
                msgToPost.blog = blob.link;

                api.sbot.async.publish(msgToPost, function (err, msg) {
                  console.log(msg);
                  console.log(err);
                  if (err) {
                    publishing.set(false);
                    showDialog({
                      type: "error",
                      title: i18n("Error"),
                      buttons: ["OK"],
                      message: i18n(
                        "An error occurred while attempting to publish blog.",
                      ),
                      detail: err.message,
                    });
                  } else {
                    publishing.set(false);
                    close();
                  }
                });
              }
            }),
          );
        }
      }
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
      const electron = require("electron");
      electron.remote.dialog.showMessageBox(
        electron.remote.getCurrentWindow(),
        opts,
      );
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
