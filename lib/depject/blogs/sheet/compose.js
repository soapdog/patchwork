const nest = require("depnest");
const extend = require("xtend");
const ssbMentions = require("ssb-mentions");
const displaySheet = require("../../../sheet/display");

const { Value, h, computed, when } = require("mutant");

exports.gives = nest("blogs.sheet.compose");

exports.needs = nest({
  "message.sheet.preview": "first",
  "keys.sync.id": "first",
  "sbot.async.publish": "first",
  "sbot.async.get": "first",
  "about.async.latestValues": "first",
  "blob.html.input": "first",
  "blob.sync.url": "first",
  "intl.sync.i18n": "first",
  "suggest.hook": "first",
});

exports.create = function (api) {
  const i18n = api.intl.sync.i18n;
  return nest("blogs.sheet.compose", function (id) {
    displaySheet((close) => {
      const publishing = Value(false);

      const blogPost = {
        title: Value(),
        summary: Value(),
        thumbnail: Value(),
        blog: Value(),
      };

      const imageUrl = computed(
        blogPost.thumbnail,
        (id) => id && api.blob.sync.url(id),
      );

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
          }, [i18n("Compose Blog Post")]),
          h("BlogPostEditor", [
            h("input.title", {
              placeholder: i18n("Type a title"),
              hooks: [ValueHook(blogPost.title), FocusHook()],
            }),
            h("ThumbnailAndSummary", [
              h("textarea.summary", {
                placeholder: i18n("Type a summary"),
                hooks: [
                  ValueHook(blogPost.summary),
                ],
              }),
              h("ImageInput .banner", {
                style: {
                  "background-image": computed(imageUrl, (x) => `url(${x})`),
                },
              }, [
                h("span", ["🖼 ", i18n("Choose Banner Image...")]),
                api.blob.html.input((err, file) => {
                  if (err) {
                    console.log("err thumb", err);
                    return;
                  }
                  blogPost.thumbnail.set(file);
                }, {
                  accept: "image/*",
                }),
              ]),
            ]),
            h("textarea.content", {
              placeholder: i18n("Type your post"),
              hooks: [ValueHook(blogPost.blog)],
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
              blog: "&51ZXxNYIvTDCoNTE9R94NiEg3JAZAxWtKn4h4SmBwyY=.sha256" // fake blog so we pass isBlog()
            },
          },
        }

        if (previewObj.thumbnail?.link) {
          previewOpts.value.content.thumbnail = previewObj.thumbnail.link
        }

        if (previewObj.summary) {
          previewOpts.value.content.summary = previewObj.summary
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
 
          pull(
            pull.values([blogContent]),
            api.sbot.blobs.add(function (err, hash) {
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
                msgToPost.blog = hash;

                api.sbot.async.publish(msgToPost, function (err, msg) {
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
  });
};
