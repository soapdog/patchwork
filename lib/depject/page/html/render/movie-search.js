const {
  Array: MutantArray,
  h,
  when,
  map,
  Value,
} = require("mutant");
const nest = require("depnest");
const preferences = require("../../../../preferences.js");

exports.needs = nest({
  "app.navigate": "first",
  "feed.html.rollup": "first",
  "sbot.pull.resumeStream": "first",
  "sbot.pull.stream": "first",
  "intl.sync.i18n": "first",
});

exports.gives = nest("page.html.render");

exports.create = function (api) {
  const i18n = api.intl.sync.i18n;
  return nest("page.html.render", function channel(path) {
    if (path !== "/movie-search") return;

    const loading = Value(false);
    const searchSpinner = Value(false);
    const listOfMovies = MutantArray();
    const status = Value(false);
    const imdbID = Value(false);
    const terms = Value();
    const apiKey = preferences.get("omdbApiKey", "");

    if (apiKey === "") {
      status.set(
        "You need to set your OMDB API Key in the settings page before using this feature.",
      );
    }

    const search = async (ev) => {
      console.log("searching...");
      ev.preventDefault();
      searchSpinner.set(true);
      loading.set(true);

      const url = `http://www.omdbapi.com/?s=${
        encodeURIComponent(terms())
      }&apikey=${apiKey}`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          alert("Couldn't find the movie using OMDB API. Sorry.");
          console.error(`Response status: ${response.status}`);
          return;
        }

        const results = await response.json();
        console.log("movie metadata from omdb", results);

        if (results.Response === "True") {
          listOfMovies.set(results.Search);
          searchSpinner.set(false);
          loading.set(false);
          console.log(
            "search done, displaying results...",
          );
        } else {
          status.set(results.Error);
          searchSpinner.set(false);
          loading.set(false);
        }
        return true;
      } catch (error) {
        console.log(error);
        console.error(error.message);
        return true;
      }
    };

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

    const prepend = [
      h("PageHeading", [
        h("h1", [h("strong", i18n("Movie Search"))]),
        h("p", `Search for movies using OMDB API.`),
      ]),
    ];

    const searchForm = [
      h("form.MovieSearch", [
        h("div.controls", [
          h("input.search", {
            placeholder: i18n("Search terms"),
            hooks: [ValueHook(terms)],
          }),
          h("button", {
            "ev-click": search,
            disabled: apiKey === "",
          }, "Fetch metadata using OMDBAPI"),
        ]),
      ]),
    ];

    return h("Scroller", { style: { overflow: "auto" } }, [
      h("div.wrapper", [
        h("section.prepend", prepend),
        h("section.search", searchForm),
        h("br"),
        h("hr"),
        h("br"),
        h(
          "section.content",
          /*
          == GRID MOVIE ===========================================================================================================
          */
          h("MovieGrid", [map(listOfMovies, (i) => {
            return h("div.Movie", {
              "ev-click": () => {
                const id = i.imdbID;
                console.log("navigating to omdb import");
                api.app.navigate(`/movie-omdb-import?id=${id}`);
              },
            }, [
              h("img", { src: i.Poster }),
              h("h2", i.Title),
              h("h4", i.Year),
            ]);
          })]),
        ),
        when(status, h("h1", status)),
        when(
          loading,
          searchSpinner ? h("Loading -large -search") : h("Loading -large"),
        ),
      ]),
    ]);
  });
};
