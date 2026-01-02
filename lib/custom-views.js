const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const ssbMarkdown = require("ssb-markdown");
const fengari = require("fengari")

const customViews = {
	appData: (...extra) => {
		let result
		switch(process.platform) {
		case "win32": 
			result = path.join(process.env.APPDATA, ...extra)
			break
		case "darwin":
			result = path.join(process.env.HOME, 'Library', 'Application Support', ...extra)
			break
		case "linux":
			result = path.join(process.env.HOME, ".config", ...extra)
			break
		default:
			result = path.join(process.env.HOME, ".config", ...extra)
			break
		}
		return result
	},
	customViewsFolder: () => {
		return customViews.appData(
			"Patchwork",
			"custom-views",
		);
	},
	samplesFolder: () => {
		return path.join(customViews.customViewsFolder(), "samples");
	},
	activeFolder: () => {
		return path.join(customViews.customViewsFolder(), "active");
	},
	copySamples: () => {
		const samplesFolder = customViews.samplesFolder()
		const activeFolder = customViews.activeFolder()

		const sourceFolder = path.join(
			app.getAppPath(),
			"docs",
			"custom-views",
		);

		const sampleFiles = fs.readdirSync(sourceFolder);

		fs.mkdirSync(activeFolder, { recursive: true });
		fs.mkdirSync(samplesFolder, { recursive: true });

		sampleFiles.forEach((filename) => {
			if (!fs.existsSync(path.join(samplesFolder, filename))) {
				fs.copyFileSync(
					path.join(sourceFolder, filename),
					path.join(samplesFolder, filename),
				);

				console.log("copying sample: " + filename);
			}
		});
	},
	isThereAnyActiveView: () => {
		const activeFolder = customViews.activeFolder()
		const customViewFiles = fs.readdirSync(activeFolder);

		return customViewFiles.length > 0;
	},
	get: (viewFile) => {
		const activeFolder = customViews.activeFolder()
		const filePath = path.join(activeFolder, viewFile);
		const content = fs.readFileSync(filePath, "utf8");
		return content;
	},
	getActiveViewsList: () => {
		const activeFolder = customViews.activeFolder()
		const activeViews = fs.readdirSync(activeFolder);
		const result = activeViews.map((f) => {
			const path = path.join(activeFolder, f)
			const name = path.basename(f);

			return {path, name};
		});

		return result;
	}
};

module.exports = customViews
