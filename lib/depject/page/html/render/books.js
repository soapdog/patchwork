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
    if (path !== '/books') return

    const prepend = [
      h('PageHeading', [
        h('h1', [h('strong', i18n('Books'))]),
        h('div.meta', [
          h('button -add', {
            'ev-click': addNewBook
          }, i18n('Add New Book'))
        ])
      ])
    ]

    const getStream = api.sbot.pull.resumeStream((sbot, opts) => {
      return sbot.patchwork.books.roots(opts)
    }, { limit: 300, reverse: true })

    return api.feed.html.rollup(getStream, {
      prepend,
      updateStream: api.sbot.pull.stream(sbot => sbot.patchwork.books.latest())
    })
  })

  function addNewBook () {
    // api.blogs.sheet.compose()
  }
}
