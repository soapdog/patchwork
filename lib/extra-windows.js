const Path = require("path");
const electron = require("electron");
const extend = require("xtend/mutable");

const extraWindows = {
	openProtocolGuideWindow: (config) => {
		let display = electron.screen.getPrimaryDisplay();
		let width = display.bounds.width;
		let height = display.bounds.height;
		const win = new electron.BrowserWindow(extend({
			show: false,
			resizable: true,
			devTools: true,
			width: 1000,
			center: true,
			height: 600,
			webPreferences: {
				nodeIntegration: false, // XXX: Maybe not always necessary (?),
				contextIsolation: false,
			},
		}));

		win.once("ready-to-show", () => {
			win.show();
		});

		const p = Path.join(__dirname, "docs", "protocol-guide", "index.html");
		win.loadFile(
			p,
		);
		return win;
	},
	openAudioPlayer: (config, msg) => {
		let display = electron.screen.getPrimaryDisplay();
		let width = display.bounds.width;
		let height = display.bounds.height;
		const win = openWindow(
			config,
			Path.join(__dirname, "lib", "audio-player-window.js"),
			{
				minWidth: 100,
				center: true,
				width: 250,
				height: 300,
				x: width - 300,
				y: height - 350,
				// titleBarStyle: "hiddenInset",
				autoHideMenuBar: true,
				title: "Poncho Wonky Audio Player",
				webPreferences: {
					nodeIntegration: true,
					contextIsolation: false,
				},
				data: msg,
				show: true,
				backgroundColor: "#EEE",
			},
		);

		win.setAlwaysOnTop(true);
		return win;
	},
};

module.exports = extraWindows;
