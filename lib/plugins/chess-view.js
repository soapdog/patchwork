const { chessFlumeview } = require('ssb-chess-index');

exports.manifest = {
  get: 'async',
  read: 'source'
}

exports.init = function (ssb) {
    const chessFlumeView = ssb._flumeUse('chess-view', chessFlumeview);

    return {
        get: chessFlumeView.get,
        read: chessFlumeView.read
    }
}