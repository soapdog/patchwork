const { h } = require('mutant')
const nest = require('depnest')

exports.needs = nest({
  'feed.html.rollup': 'first',
  'sbot.pull.resumeStream': 'first',
  'sbot.pull.stream': 'first',
  'intl.sync.i18n': 'first'
})

exports.gives = nest('page.html.render')

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  return nest('page.html.render', function channel (path) {
    if (path !== '/blogs') return

    const prepend = [
      h('PageHeading', [
        h('h1', [h('strong', i18n('Blog Posts'))]),
        h('div.meta', [
          h('button -add', {
            'ev-click': composeBlogPost
          }, i18n('Compose New Blog Post'))
        ])
      ])
    ]

    const getStream = api.sbot.pull.resumeStream((sbot, opts) => {
      return sbot.patchwork.blogs.roots(opts)
    }, { limit: 40, reverse: true })

    return api.feed.html.rollup(getStream, {
      prepend,
      updateStream: api.sbot.pull.stream(sbot => sbot.patchwork.blogs.latest())
    })
  })

  function composeBlogPost () {
    api.blogs.sheet.compose()
  }
}
