const { h } = require("mutant")

const iframe = h("iframe", {
	src: assetsFolder("worm-blossom-music/player.html#song=" + data)
})

document.documentElement.replaceChild(h("body", [iframe]), document.body)