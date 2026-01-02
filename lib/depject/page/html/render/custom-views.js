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
const luaJson = require("lua-json");
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
    console.log("custom view", customViewFilename);
    console.log("custom view content", customViewContent);

    const L = lauxlib.luaL_newstate();

    lualib.luaL_openlibs(L);

    if (
      lauxlib.luaL_dostring(L, fengari.to_luastring(customViewContent)) !==
        lua.LUA_OK
    ) {
      console.log("error loading lua custom view:", lua.lua_tojsstring(L, -1));
      return;
    }

    if (!lua.lua_istable(L, -1)) {
      console.log(
        "lua custom view ias not a table:",
        lua.lua_tojsstring(L, -1),
      );
      console.log(lua.lua_tojsstring(L, -1));
      return;
    }

    lua.lua_setglobal(L, fengari.to_luastring("view"))

    /*
== Auxiliary functions ===========================================================================================================
    */

    function pushValueIntoLuaStack(o) {
      lua.lua_checkstack(L, 1)
      if (typeof o == "string") {
        lua.lua_pushstring(L, fengari.to_luastring(o))
      } else if (typeof o == "number") {
        lua.lua_pushnumber(L, o)
      } else if (typeof o == "boolean") {
        lua.lua_pushboolean(L, o)
      } else if (typeof o == "object") {
        if (Array.isArray(o)) {
          pushArrayIntoLuaStack(o)
        } else if (o !== null) {
          // console.log("o", o)
          pushObjectIntoLuaStack(o)
        }
      }
    }

    function pushObjectIntoLuaStack(o) {
      const keys = Object.keys(o)
      lua.lua_checkstack(L, keys.length)
      lua.lua_createtable(L, 0, keys.length)
      keys.forEach(k => {
        if (o[k] == null) {
          return
        }
        pushValueIntoLuaStack(o[k])
        lua.lua_setfield(L, -2, fengari.to_luastring(k))
      })
    }

    function pushArrayIntoLuaStack(o) {
      lua.lua_checkstack(L, o.length)
      lua.lua_createtable(L, o.length, 0)
      let index = 1
      o.forEach(k => {
        lua.lua_pushnumber(L, index++)
        pushValueIntoLuaStack(k)
        lua.lua_settable(L, -3)
      })
    }

    function parseLuaTable(result) {
      lua.lua_pushnil(L);
      while (lua.lua_next(L, -2) !== 0) {
        let key;
        let value
        if (lua.lua_type(L, -2) == lua.LUA_TSTRING) {
          key = lua.lua_tojsstring(L, -2);
          value = parseLuaValue();
          result[key] = value;
        } else if (lua.lua_type(L, -2) == lua.LUA_TNUMBER) {
          key = lua.lua_tonumber(L, -2);
          value = parseLuaValue()
          result[key - 1] = value
          const arr = []
          Object.keys(result).toSorted().forEach(i => {
            arr.push(result[i])
          })
          result = arr
        }

        lua.lua_pop(L, 1);
      }
      return result;
    }

    function parseLuaValue() {
      const type = lua.lua_type(L, -1);
      let result = {};

      if (type == lua.LUA_TBOOLEAN) {
        result = lua.lua_toboolean(L, -1);
      } else if (type == lua.LUA_TNUMBER) {
        result = lua.lua_tonumber(L, -1);
      } else if (type == lua.LUA_TSTRING) {
        result = lua.lua_tojsstring(L, -1);
      } else if (type == lua.LUA_TTABLE) {
        parseLuaTable(result);
      } else {
        console.log("type", lua.lua_type(L, -1));
      }
      return result;
    }

    // Get query to run
    lua.lua_getglobal(L, "view");
    if (!lua.lua_istable(L, -1)) {
      console.log("query: lua view global is not a table:", lua.lua_tojsstring(L, -1));
      return;
    }
    lua.lua_getfield(L, -1, "query");
    if (lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
      console.log("error in lua pcall", lua.lua_tojsstring(L, -1));
    }
    if (!lua.lua_istable(L, -1)) {
      console.log("lua query result is not a table");
      return;
    }

    const queryData = parseLuaTable({});
    console.log("query data", queryData);
    let x = Value(0)
    x(i => console.log(i))
    onceTrue(api.sbot.obs.connection, (sbot) => {
      pull(
        sbot.query.read({
          query: queryData
        }),
        pull.drain((item) => {
          console.log("item", item);
          lua.lua_getglobal(L, "view");
          if (!lua.lua_istable(L, -1)) {
            console.log(
              "lua view global is not a table:",
              lua.lua_tojsstring(L, -1),
            );
            return;
          }
          lua.lua_getfield(L, -1, "drain");
          pushValueIntoLuaStack(item)
          if (lua.lua_pcall(L, 1, 1, 0) !== lua.LUA_OK) {
            console.log("error in lua pcall", lua.lua_tojsstring(L, -1));
          }
          const q = parseLuaTable({});
          console.log("item from drain", q);
          lua.lua_pop(L, 2)
          x.set(x()+1)

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
            "ev-click": () => {},
          }, i18n("Add New Book")),
          h("button -add", {
            "ev-click": () => {},
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
          h("BookGrid", []),
        ),
        when(
          loading,
          searchSpinner ? h("Loading -large -search") : h("Loading -large"),
        ),
      ]),
    ]);
  });
};
