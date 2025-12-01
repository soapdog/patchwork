const nest = require('depnest')
const book = require('scuttle-book')
const { h, when, resolve } = require('mutant')
const addContextMenu = require('../../../../message/html/decorate/context-menu')

exports.gives = nest('message.html', {
  canRender: true,
  render: true
})

exports.needs = nest({
  'about.obs.color': 'first',
  'app.navigate': 'first',
  'blob.sync.url': 'first',
  'message.html.layout': 'first',
  'message.html.markdown': 'first',
  'sbot.obs.connection': 'first'
})

exports.create = function (api) {
  return nest('message.html', {
    render: bookRenderer,
    canRender
  })

  function bookRenderer (msg, opts) {
    if (!canRender(msg)) return

    // show a card (if there's no body loaded) or the full blog (if the blog body is loaded)
    // msg is decorated with a `body` attribute when loaded using feed.obs.thread from patchcore
    if (msg.book) {
      content = h('BlogFull.Markdown', [
        h('h1', msg.value.content.title),
        api.message.html.markdown(msg.body)
      ])
    } else {
      content = BookCard({
        book: msg.value.content,
        onClick: () => api.app.navigate(msg.key),
        color: api.about.obs.color,
        blobUrl: api.blob.sync.url
      })
    }

    const element = api.message.html.layout(msg, Object.assign({}, {
      content,
      layout: 'default'
    }, opts))

    return addContextMenu(element, { msg })
  }
}

function BookCard ({ book, blobUrl, onClick, color }) {
  const thumbnail = when(book.image,
    h('Thumbnail', {
      style: {
        'background-image': `url("${blobUrl(resolve(book.image.link))}")`,
        'background-position': 'center',
        'background-size': 'cover'
      }
    }),
    h('Thumbnail -empty', {
      style: { 'background-color': color(book.title) }
    }, [
      h('i.fa.fa-file-text-o')
    ])
  )

  const abbreviatedDescription = book.description.split(/\s+/).slice(0, 100).join(' ') + '...'

  const b = h('BookCard', { 'ev-click': onClick }, [
    // h('div.context', [
    //   api.about.html.avatar(author, 'tiny'),
    //   h('div.name', api.about.obs.name(author)),
    //   api.message.html.timeago(blog)
    // ]),
    h('div.content', [
      thumbnail,
      h('div.text.Markdown', [
        h('h1', book.title),
        h('div.summary', abbreviatedDescription),
        h('div.read', 'Read More')
      ])
    ])
  ])

  return b
}

function canRender (msg) {
  if (msg.value.content.type === "bookclub") {
    return true
  } else if (msg.value.content.type === "bookclubUpdate") {
    return true
  } else {
    return false
  }
}
