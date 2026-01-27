const { h } = require('mutant')
const nest = require('depnest')

exports.needs = nest({
  'feed.html.rollup': 'first',
  'sbot.pull.resumeStream': 'first',
  'sbot.pull.stream': 'first',
  'gathering.sheet.edit': 'first',
  'intl.sync.i18n': 'first',
   "scripts.lua.environment.init": "first",
  "scripts.lua.environment.call": "first",
    "scripts.lua.environment.has": "first",
        "scripts.lua.environment.get": "first",

})

exports.gives = nest('page.html.render')

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  return nest('page.html.render', function channel (path) {
    if (!path.startsWith('/custom-script')) return

    const url = new URL(path, "https://example.com")
    const scriptName = url.searchParams.get("script")

    if (!scriptName) {
      return
    }

    const L = api.scripts.lua.environment.init(scriptName)

    if (!L) {
      return
    }

    const has = api.scripts.lua.environment.has(L, "menu")

    if (!has) {
      return
    }


    const prepend = [
      h('PageHeading', [
        h('h1', [h('strong', api.scripts.lua.environment.get(L, "NAME"))]),
        h('div.meta', [])
      ])
    ]

    const getStream = api.sbot.pull.resumeStream((sbot, opts) => {
      return sbot.patchwork.gatherings.roots(opts)
    }, { limit: 40, reverse: true })

    return api.feed.html.rollup(getStream, {
      prepend,
      updateStream: api.sbot.pull.stream(sbot => sbot.patchwork.gatherings.latest())
    })
  })
}
