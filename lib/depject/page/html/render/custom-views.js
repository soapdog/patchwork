const {
  Array: MutantArray,
  onceTrue,
  computed,
  Proxy,
  h,
  when,
  map,
  Value,
  watch,
  resolve,
} = require("mutant");
const nest = require("depnest");
const pull = require("pull-stream");
const fengari = require("fengari");
const luaJson = require("lua-json")
const customViews = require("../../../../custom-views.js");
const luaconf = fengari.luaconf;
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;

exports.needs = nest({
  "app.navigate": "first",
  "app.refresh": "first",
  "intl.sync.i18n": "first",
  "books.sheet.edit": "first",
  "books.sync.fix": "first",
  "sbot.pull.stream": "first",
  "sbot.obs.connection": "first",
  "blob.sync.url": "first",
  "about.obs.color": "first",
  "message.html.markdown": "first",
});

exports.gives = nest("page.html.render");

exports.create = function (api) {
  return nest("page.html.render", function channel(path) {
    if (!path.startsWith("/custom-views")) return;
    const i18n = api.intl.sync.i18n;
    const loading = Value(true);
    const searchSpinner = Value(false);

    const params = new URLSearchParams(path.split("?")[1]);

    if (params.size < 1 || !params.has("view")) {
      return;
    }

    const customViewFilename = params.get("view");
    const customViewContent = customViews.get(customViewFilename);

    const L = lauxlib.luaL_newstate();

    lualib.luaL_openlibs(L);

    if (
      lauxlib.luaL_dostring(L, to_luastring(customViewContent)) !== lua.LUA_OK
    ) {
      console.log("error loading lua custom view");
      return;
    }

    if (!lua.lua_istable(L, -1)) {
      console.log("lua custom view is not a table");
      return;
    }

    /*
== Auxiliary functions ===========================================================================================================
    */

    onceTrue(api.sbot.obs.connection, (sbot) => {
      pull(
        book.pull.books({ reverse: true }, true, false),
        pull.drain((item) => {
          lua.lua_getglobal(L, "view");
          if (!lua.lua_istable(L, -1)) {
            console.log("lua view global is not a table");
            return;
          }
          const luaTable = luaJson.format(item)
          lua.lua_getfield(L, -1, "drain")
          lua.lua_dostring(L, lua.to_luastring(luaTable))
          if (lua.lua_pcall(L, 1, 1, 0) !== lua.LUA_OK) {
            console.log("error in lua pcall", lua.lua_tojsstring(L, -1))
          }
          

          loading.set(false);
        }),
      );
    });

    /*
== mutant content ===========================================================================================================
    */

    const prepend = [
      h("PageHeading", [
        h("h1", [h("strong", i18n("Custom View"))]),
        h("div.meta", [
          h("button -add", {
            "ev-click": addNewBook,
          }, i18n("Add New Book")),
          h("button -add", {
            "ev-click": refresh,
            "style": {
              "margin-left": "10px",
            },
          }, i18n("Refresh List")),
        ]),
      ]),
    ];

    return h("Scroller", { style: { overflow: "auto" } }, [
      h("div.wrapper", [
        h("section.prepend", prepend),
        h(
          "section.content",
          h("BookGrid", [map(listOfBooks, (i) => i)]),
        ),
        when(
          loading,
          searchSpinner ? h("Loading -large -search") : h("Loading -large"),
        ),
      ]),
    ]);
  });
};
