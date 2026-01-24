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
const customScripts = require("./custom-scripts.js");
const luaconf = fengari.luaconf;
const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;

exports.needs = nest({
  "app.navigate": "first",
  "app.refresh": "first",
  "intl.sync.i18n": "first",
  "sbot.pull.stream": "first",
  "sbot.obs.connection": "first",
  "blob.sync.url": "first",
  "about.obs.color": "first",
  "message.html.markdown": "first",
  "message.html.render": "first",
});

exports.gives = nest({
  "scripts.lua.environment.init": true,
  "scripts.lua.environment.call": true,
  "scripts.lua.environment.has": true,
  "scripts.lua.environment.get": true,
});

/*
== Auxiliary functions ===========================================================================================================
    */

function pushValueIntoLuaStack(L, o) {
  lua.lua_checkstack(L, 1);
  if (typeof o == "string") {
    lua.lua_pushstring(L, fengari.to_luastring(o));
  } else if (typeof o == "number") {
    lua.lua_pushnumber(L, o);
  } else if (typeof o == "boolean") {
    lua.lua_pushboolean(L, o);
  } else if (typeof o == "object") {
    if (Array.isArray(o)) {
      pushArrayIntoLuaStack(L, o);
    } else if (o !== null) {
      // console.log("o", o)
      pushObjectIntoLuaStack(L, o);
    }
  }
}

function pushObjectIntoLuaStack(L, o) {
  const keys = Object.keys(o);
  lua.lua_checkstack(L, keys.length);
  lua.lua_createtable(L, 0, keys.length);
  keys.forEach((k) => {
    if (o[k] == null) {
      return;
    }
    pushValueIntoLuaStack(L, o[k]);
    lua.lua_setfield(L, -2, fengari.to_luastring(k));
  });
}

function pushArrayIntoLuaStack(L, o) {
  lua.lua_checkstack(L, o.length);
  lua.lua_createtable(L, o.length, 0);
  let index = 1;
  o.forEach((k) => {
    lua.lua_pushnumber(L, index++);
    pushValueIntoLuaStack(L, k);
    lua.lua_settable(L, -3);
  });
}

function parseLuaTable(L, result, idx) {
  lua.lua_pushnil(L);
  const arr = [];
  while (lua.lua_next(L, idx) !== 0) {
    let key;
    let value;
    if (lua.lua_type(L, -2) == lua.LUA_TSTRING) {
      key = lua.lua_tojsstring(L, -2);
      value = parseLuaValue(L);
      result[key] = value;
    } else if (lua.lua_type(L, -2) == lua.LUA_TNUMBER) {
      key = lua.lua_tonumber(L, -2);
      value = parseLuaValue(L);
      result[key - 1] = value;
      let keys = Object.keys(result).toSorted();
      for (const i in keys) {
        arr.push(result[i]);
        // delete result[i]
      }
      result = arr;
    }

    lua.lua_pop(L, 1);
  }
  return result;
}

function parseLuaValue(L, idx=-1) {
  const type = lua.lua_type(L, idx);
  let result = {};

  if (type == lua.LUA_TBOOLEAN) {
    result = lua.lua_toboolean(L, idx);
  } else if (type == lua.LUA_TNUMBER) {
    result = lua.lua_tonumber(L, idx);
  } else if (type == lua.LUA_TSTRING) {
    result = lua.lua_tojsstring(L, idx);
  } else if (type == lua.LUA_TTABLE) {
    result = parseLuaTable(L, result, idx);
  } else if (type == lua.LUA_TFUNCTION) {
    return "LUA FUNCTION"
  } else {
    console.log("type", lua.lua_type(L, idx));
    return null;
  }
  return result;
}

function log(L) {
  const text = lua.lua_tojsstring(L, -1)
  console.log(`[LUA]`, text)
  return 1
}

/*
    == Implementation ===========================================================================================================
    */

exports.create = function (api) {
  function init(path) {
    const customViewContent = customScripts.get(path);
    // console.log("file", path);
    // console.log("content", customViewContent);

    const L = lauxlib.luaL_newstate();

    lualib.luaL_openlibs(L);

    lua.lua_pushjsfunction(L, log)
    lua.lua_setglobal(L, "log")
    lua.lua_pop(L, -1)

    if (
      lauxlib.luaL_dostring(L, fengari.to_luastring(customViewContent)) !==
        lua.LUA_OK
    ) {
      console.log(
        "error loading lua custom script:",
        lua.lua_tojsstring(L, -1),
      );
      return;
    }

    if (!lua.lua_istable(L, -1)) {
      console.log(
        "lua custom script is not a table:",
        lua.lua_tojsstring(L, -1),
      );
      console.log(lua.lua_tojsstring(L, -1));
      return false;
    }

    lua.lua_setglobal(L, fengari.to_luastring("script"));
    return L;
  }

  function has(L, key) {
    lua.lua_getglobal(L, "script");
    if (!lua.lua_istable(L, -1)) {
      console.log(
        "query: lua script global is not a table:",
        lua.lua_tojsstring(L, -1),
      );
      return false;
    }
    const v = lua.lua_getfield(L, -1, key);
    return v;
  }

  function get(L, key) {
    lua.lua_getglobal(L, "script");
    if (!lua.lua_istable(L, -1)) {
      console.log(
        "query: lua script global is not a table:",
        lua.lua_tojsstring(L, -1),
      );
      return false;
    }
    lua.lua_getfield(L, -1, key);
    const v = parseLuaValue(L);
    return v;
  }

  function dumpstack(L) {
    const top = lua.lua_gettop(L);
    console.log("==== dumping stack ====");
    console.log("items in stack", top);
    const decoder = new TextDecoder("utf-8");
    for (let i = 1; i <= top; i++) {
      const type = lua.lua_type(L, i)
      const typename = decoder.decode(lua.lua_typename(L, type))
      const value = parseLuaValue(L, i)
      console.log(
        `${i} (type: ${type} ${typename})`, JSON.stringify(value));
    }
    console.log("====================");
  }

  function call(L, method, args = [], numberOfResults = 0) {
    // Get query to run
    lua.lua_getglobal(L, "script");
    if (!lua.lua_istable(L, -1)) {
      console.log(
        "query: lua script global is not a table:",
        lua.lua_tojsstring(L, -1),
      );
      return;
    }
    lua.lua_getfield(L, -1, method);
    for (const i of args) {
      pushValueIntoLuaStack(L, i);
    }
    // dumpstack(L);
    if (lua.lua_pcall(L, args.length, numberOfResults, 0) !== lua.LUA_OK) {
      console.log("error in lua pcall", lua.lua_tojsstring(L, -1));
      return [null, lua.lua_tojsstring(L, -1)];
    }
    lua.lua_remove(L, 1) // remove custom script table from stack
    let res = [];
    // dumpstack(L)
    for (let i = 1; i <= numberOfResults; i++) {
      res.push(parseLuaValue(L, i));
    }
    return res;
  }

  return nest({
    "scripts.lua.environment.init": init,
    "scripts.lua.environment.call": call,
    "scripts.lua.environment.has": has,
    "scripts.lua.environment.get": get,
  });
};
