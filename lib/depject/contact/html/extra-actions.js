const nest = require('depnest')
const electron = require('electron')
const remote = require('@electron/remote')
const { h, when, computed } = require('mutant')

exports.gives = nest('contact.html.extraActions')
exports.needs = nest({
  'intl.sync.i18n': 'first',
  'keys.sync.id': 'first',
})

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  return nest('contact.html.extraActions', function (id, opts) {
    const yourId = api.keys.sync.id()

    if (id !== yourId) {
      return [
        h('a ToggleButton -drop -options', {
          href: '#',
          title: i18n('Click for extra actions such as adding a fixed IP to this profile'),
          'ev-click': (ev) => popupExtraActionMenu(ev.currentTarget, id, opts)
        }, i18n('Extra'))
      ]
    } else {
      return []
    }
  })

  function popupExtraActionMenu (element, id, {fixedIpToggle}) {
    const rects = element.getBoundingClientRect()

    const factor = remote.getCurrentWindow().webContents.getZoomFactor()
    const menu = remote.Menu.buildFromTemplate([
      {
        type: 'normal',
        label: i18n('Add Fixed IP'),
        click: () => {
          fixedIpToggle("type in the IP")
        }
      },
    ])
    menu.popup({
      window: remote.getCurrentWindow(),
      x: Math.round(rects.left * factor),
      y: Math.round(rects.bottom * factor) + 4
    })
  }

}
