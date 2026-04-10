const ref = require("ssb-ref");
const nest = require("depnest");
const { Value, onceTrue, Array: MutantArray } = require("mutant");
const pull = require("pull-stream");

exports.needs = nest("sbot.obs.connection", "first");

exports.gives = nest("message.obs.edits");

exports.create = function (api) {
  return nest("message.obs.edits", function (key, hintMessage = null) {
    if (!ref.isMsg(key)) throw new Error("a msg id must be specified");
    const edited = Value(false);

    onceTrue(api.sbot.obs.connection, (sbot) => {
      pull(
        sbot.query.read({
          query: [{
            "$filter": {
              value: {
                content: {
                  type: "post-edit",
                  revisionRoot: key,
                },
              },
            },
          }],
        }),
        pull.collect((err, ary) => {
          if (ary.length == 0) return;
          edited.set(ary);
        }),
      );
    });

    return edited;
  });
};
