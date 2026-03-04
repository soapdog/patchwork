const {
  Value,
  computed,
  onceTrue,
  Array: MutantArray,
  h,
  Dict,
  map,
  dictToCollection,
} = require("mutant");
const nest = require("depnest");
const pull = require("pull-stream");
const { glob } = require("glob");
const Duration = require("duration-js");
const humanSize = require("human-size");
const { fileTypeFromFile } = require("file-type");
const fs = require("fs");

exports.needs = nest({
  "app.refresh": "first",
  "sbot.pull.stream": "first",
  "sbot.obs.connection": "first",
  "progress.obs": {
    indexes: "first",
    plugins: "first",
    replicate: "first",
    migration: "first",
    peer: "first",
  },
  "intl.sync.i18n": "first",
});

exports.gives = nest("page.html.render");

exports.create = function (api) {
  return nest("page.html.render", function channel(path) {
    if (path !== "/storage-manager") return;

    const i18n = api.intl.sync.i18n;
    const showLoading = Value(true);
    const allFiles = MutantArray([]);

    let totalBlobSize = Value("");
    let imageTotal = Value("");
    let videoTotal = Value("");
    let audioTotal = Value("");
    let othersTotal = Value("");

    glob("/Users/agarzia/.ssb/blobs/sha256/**/*", {
      // need stat so we have mtime
      stat: true,
      withFileTypes: true,
      // only want the files, not the dirs
      nodir: true,
    }).then((files) => {
      allFiles.set(files);
      calculateTotals(files);
    });

    const calculateTotals = async (files) => {
      document.querySelectorAll(".ui").forEach((el) => {
        el.style.display = "none";
      });

      let bytes = 0;
      let imageBytes = 0;
      let videoBytes = 0;
      let audioBytes = 0;
      let otherBytes = 0;
      console.log("running");
      for (const f of files) {
        bytes += f.size;

        const type = await fileTypeFromFile(f.fullpath());

        if (type?.mime.startsWith("image/")) {
          imageBytes += f.size;
        } else if (type?.mime.startsWith("audio/")) {
          audioBytes += f.size;
        } else if (type?.mime.startsWith("video/")) {
          videoBytes += f.size;
        } else {
          otherBytes += f.size;
        }
      }

      totalBlobSize.set(humanSize(bytes, 2));
      imageTotal.set(humanSize(imageBytes, 2));
      videoTotal.set(humanSize(videoBytes, 2));
      othersTotal.set(humanSize(otherBytes, 2));
      audioTotal.set(humanSize(audioBytes, 2));

      document.getElementById("spinner").style.display = "none";
      document.querySelectorAll(".ui").forEach((el) => {
        el.style.display = "block";
      });
    };

    const prepend = [
      h("PageHeading", [
        h("h1", [
          h("strong", i18n("Storage Manager")),
        ]),
        h("div.meta", [
          h("button -add", {
            "ev-click": (ev) => {
              api.app.refresh("/storage-manager");
            },
          }, i18n("Refresh")),
        ]),
      ]),
    ];

    const spinnerContent = [
      h("Loading -large", {
        id: "spinner",
      }),
    ];
    const totalSize = h("p", [
      `SSB is using a total of `,
      h("strong", totalBlobSize),
      ` of storage for blobs.`,
    ]);
    const videoSize = h("p", [
      `🎬 Video files occupy a total of `,
      h("strong", videoTotal),
    ]);
    const imageSize = h("p", [
      `🖼️ Image files occupy a total of `,
      h("strong", imageTotal),
    ]);
    const audioSize = h("p", [
      `🔊 Audio files occupy a total of `,
      h("strong", audioTotal),
    ]);
    const otherSize = h("p", [
      `📁 Other files occupy a total of `,
      h("strong", othersTotal),
    ]);

    const reportTotals = h("section", [
      totalSize,
      videoSize,
      imageSize,
      audioSize,
      otherSize,
    ]);

    /*
== Select Files by Age ===========================================================================================================
    */

    const durationV = Value("6");
    const durationS = Value("w");
    const duration = computed([durationV, durationS], (v, s) => {
      return `${v}${s}`;
    });

    const selectedFilesByAge = computed([allFiles, duration], (files, d) => {
      let r = [];
      for (const f of files) {
        const lastAccess = (new Date(f.mtime)).getTime();
        const durationParsed = Duration.parse(d);
        const cutoffDate = new Date() - durationParsed;
        const yes = cutoffDate > lastAccess;

        if (yes) {
          const age = new Duration(cutoffDate - lastAccess);
          r.push(f);
        }
      }
      return r;
    });

    const selectedFilesByAgeBytesTotal = computed(
      [selectedFilesByAge],
      (fs) => {
        let bytes = 0;
        for (const f of fs) {
          bytes += f.size;
        }

        return humanSize(bytes, 2);
      },
    );

    const durationInput = h("input", {
      type: "number",
      placeholder: "6",
      style: {
        "font-size": "1.1em",
        "padding": "0",
        "margin-left": "5px",
        "margin-right": "5px",
        "width": "65px",
      },
      "ev-change": (ev) => {
        durationV.set(ev.target.value);
      },
    });

    const durationSelector = h("select", {
      "ev-change": (ev) => {
        durationS.set(ev.target.value);
      },
    }, [
      h("option", { value: "w" }, "Weeks"),
      h("option", { value: "d" }, "Days"),
    ]);

     const removeFilesByAgeButton = h("button", {
      "ev-click": (ev) => {
        if (confirm("Are you sure you want to remove these blobs?")) {
          const filesToRemove = selectedFilesByAge();
          console.log("Files to remove", filesToRemove);
          for (const f of filesToRemove) {
            const filePath = f.fullpath();
            if (filePath.includes("/blobs/sha256/")) {
              fs.rmSync(filePath);
              console.log(`removed`, filePath);
            }
          }
          console.log("File removal complete.");
          api.app.refresh("/storage-manager");
        }
      },
    }, "Delete Matching Files");

    const removeFilesByAge = h("section", [
      h("h3", "Remove Files By When They Were Last Accessed"),
      h("p", "Want to remove files that haven't been accessed in a while?"),
      h("p", [
        `Select files that haven't been accessed in`,
        durationInput,
        " ",
        durationSelector,
      ]),
      h("p", [
        `Files that haven't been accessed in `,
        duration,
        ` occupy a total of `,
        selectedFilesByAgeBytesTotal,
      ]),
      h("p", [removeFilesByAgeButton]),
    ]);

    /*
== Remove Files by Size ===========================================================================================================
    */

    const sizeLimit = Value(700);

    const selectedFilesBySize = computed(
      [allFiles, sizeLimit],
      (files, sizeLimit) => {
        let r = [];
        for (const f of files) {
          if (f.size >= Number(sizeLimit * 1024)) {
            r.push(f);
          }
        }
        return r;
      },
    );

    const selectedFilesBySizeBytesTotal = computed(
      [selectedFilesBySize],
      (fs) => {
        let bytes = 0;
        for (const f of fs) {
          bytes += f.size;
        }

        return humanSize(bytes, 2);
      },
    );

    const sizeInput = h("input", {
      type: "number",
      placeholder: "700",
      style: {
        "font-size": "1.1em",
        "padding": "0",
        "margin-left": "5px",
        "margin-right": "5px",
        "width": "65px",
      },
      "ev-change": (ev) => {
        sizeLimit.set(ev.target.value);
      },
    });

    const sizeLimitHuman = computed([sizeLimit], (sizeLimit) => {
      return humanSize(sizeLimit * 1024, 2);
    });

    const removeFilesBySizeButton = h("button", {
      "ev-click": (ev) => {
        if (confirm("Are you sure you want to remove these blobs?")) {
          const filesToRemove = selectedFilesBySize();
          console.log("Files to remove", filesToRemove);
          for (const f of filesToRemove) {
            const filePath = f.fullpath();
            if (filePath.includes("/blobs/sha256/")) {
              fs.rmSync(filePath);
              console.log(`removed`, filePath);
            }
          }
          console.log("File removal complete.");
          api.app.refresh("/storage-manager");
        }
      },
    }, "Delete Matching Files");

    const removeFilesBySize = h("section", [
      h("h3", "Remove Files By Size"),
      h(
        "p",
        "Want to remove files that are too big? Remember that maximum blob size if 5 megabytes.",
      ),
      h("p", [
        `Select files that are this size or larger`,
        sizeInput,
        " kilobytes",
      ]),
      h("p", [
        `Files that match or exceed `,
        sizeLimitHuman,
        ` occupy a total of `,
        selectedFilesBySizeBytesTotal,
      ]),
      h("p", [removeFilesBySizeButton]),
    ]);

    /*
== Sections ===========================================================================================================
    */

    return h("Scroller", { style: { overflow: "auto" } }, [
      h("div.wrapper", [
        h("section.prepend", prepend),
        h("section.content.ui", { style: { display: "none" } }, [
          reportTotals,
          removeFilesBySize,
          removeFilesByAge,
        ]),
        h("section.content", [spinnerContent]),
      ]),
    ]);
  });
};
