const nest = require("depnest");
const { h, Value, when, computed, Proxy, Array: MutantArray } = require(
  "mutant",
);
const ref = require("ssb-ref");
const catchLinks = require("../../catch-links.js");
const displaySheet = require("../../sheet/display.js");

exports.gives = nest("sheet.editPost");

exports.needs = nest({
  "keys.sync.id": "first",
  "sbot.obs.connection": "first",
  "intl.sync.i18n": "first",
  "app.navigate": "first",
  "message.html.link": "first",
  "message.obs.edits": "first",
  "blob.html.input": "first",
  "suggest.hook": "first",
  "sbot.async.publish": "first",
});

exports.create = function (api) {
  const i18n = api.intl.sync.i18n;
  return nest({ "sheet.editPost": editPost });

  function editPost({ msg }, callback) {
    callback = callback || function () {};
    const msgId = msg.key;

    displaySheet(function (close) {
      const { content, onMount, onSave } = edit({ msg });

      const wrapper = h("div", [
        h("h2", {
          style: { "font-weight": "normal", "text-align": "center" },
        }, [
          i18n("Edit Post"),
          ": ",
          api.message.html.link(msgId, { inContext: true }),
        ]),
        content,
      ]);

      catchLinks(wrapper, (href, external, anchor) => {
        if (!external) {
          api.app.navigate(href, anchor);
        }
      });

      return {
        content: wrapper,
        footer: [
          h("button.save", { "ev-click": publish }, i18n("Save")),
          h("button.cancel", { "ev-click": close }, i18n("Cancel")),
        ],
        onMount,
      };

      function publish() {
        close();
        onSave();
      }
    });

    function edit({ msg }) {
      const participants = Proxy([]);
      const publishing = Value(false);
      const edits = api.message.obs.edits(msg.key);
      const text = Value(msg.value.content.text);
      const root = Value(msg.value.content.root ?? msg.key);
      const revisionRoot = Value(msg.key);
      const revisionBranch = Value(msg.key);

      const textArea = h("textarea", {
        hooks: [api.suggest.hook({ participants })],
        "ev-dragover": onDragOver,
        "ev-drop": onDrop,
        "ev-paste": (ev) => {
          const files = ev.clipboardData && ev.clipboardData.files;
          if (!files || !files.length) return;
          attachFiles(files);
        },
        "ev-input": (ev) => {
          text.set(ev.target.value);
        },
        "ev-keydown": (ev) => {
          if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
            publish();
            ev.preventDefault();
          }
        },
        disabled: publishing,
        placeholder: "Edit your post",
        value: text,
      });

      const editor = [textArea];

      return {
        content: h("EditPost", [
          when(edits, editControl()),
          editor,
        ]),
        onMount,
        onSave,
      };

      function onMount() {
      }

      function onSave() {
        const obj = {
          type: "post-edit",
          root: root(),
          text: text(),
          revisionRoot: revisionRoot(),
          revisionBranch: revisionBranch(),
        };

        api.sbot.async.publish(obj, done);

        function done(err, msg) {
          if (err) {
            showDialog({
              type: "error",
              title: i18n("Error"),
              buttons: [i18n("OK")],
              message: i18n(
                "An error occurred while publishing your message.",
              ),
              detail: err.message,
            });
          } else {
            callback(msg);
          }
        }
      }

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
          isPrivate: resolve(isPrivate),
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

        const pos = textArea.selectionStart;
        let before = textArea.value.slice(0, pos);
        let after = textArea.value.slice(pos);

        let embed = isEmbeddable(file.type) ? "!" : "";
        // todo: ssb-blob-files uses simple-mime module that doesn't contain a mimetype for webp. this is an inplace fix
        if (file.name.endsWith(".webp")) {
          embed = "!";
        }

        const spacer = embed ? "\n" : " ";
        if (before && !before.endsWith(spacer)) before += spacer;
        if (!after.startsWith(spacer)) after = spacer + after;

        const embedPrefix = getEmbedPrefix(file.type);

        textArea.value =
          `${before}${embed}[${embedPrefix}${file.name}](${file.link})${after}`;
        console.log("added:", file);
      }

      function editControl() {
        const showing = Value(-1);
        edits((es) => {
          showing.set(es.length - 1);
        });

        const bubbles = computed([edits, showing], (es, s) => {
          // check boundaries
          if (!es) return;
          if (s > es.length - 1) {
            showing.set(es.length - 1);
            s = es.length - 1;
          } else if (s < -1) {
            showing.set(-1);
            s = -1;
          }

          // find content
          if (s === -1) {
            revisionBranch.set(msg.key);
            text.set(msg.value.content.text); // back to original
          } else {
            const t = es[s].value.content.text;
            revisionBranch.set(es[s].key);
            text.set(t);
          }

          // bubbles
          let b = s !== -1 ? [h("span", " • ")] : [h("span", " o ")];

          if (!Array.isArray(es)) return;

          for (let i = 0; i <= es.length - 1; i++) {
            if (i === s) {
              b.push(h("span", " o "));
            } else {
              b.push(h("span", " • "));
            }
          }
          return b;
        });

        return h("div -edit", [
          h("button", {
            "ev-click": (_ev) => {
              showing.set(showing() - 1);
            },
          }, "◀"),
          bubbles,
          h("button", {
            "ev-click": (_ev) => {
              showing.set(showing() + 1);
            },
          }, "▶"),
        ]);
      }
    }
  }
};
