const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const ssbMarkdown = require("ssb-markdown");
const fengari = require("fengari");

const customScripts = {
	appData: (...extra) => {
		let result;
		switch (process.platform) {
			case "win32":
				result = path.join(process.env.APPDATA, ...extra);
				break;
			case "darwin":
				result = path.join(
					process.env.HOME,
					"Library",
					"Application Support",
					...extra,
				);
				break;
			case "linux":
				result = path.join(process.env.HOME, ".config", ...extra);
				break;
			default:
				result = path.join(process.env.HOME, ".config", ...extra);
				break;
		}
		return result;
	},
	scriptsFolder: () => {
		return customScripts.appData(
			"Patchwork",
			"custom-scripts",
		);
	},
	assetsFolder: () => {
		return path.join(customScripts.scriptsFolder(), "assets");
	},
	samplesFolder: () => {
		return path.join(customScripts.scriptsFolder(), "samples");
	},
	activeFolder: () => {
		return path.join(customScripts.scriptsFolder(), "active");
	},
	copySamples: () => {
		const samplesFolder = customScripts.samplesFolder();
		const activeFolder = customScripts.activeFolder();
		const assetsFolder = customScripts.assetsFolder();

		const sourceFolder = path.join(
			app.getAppPath(),
			"docs",
			"custom-scripts",
		);

		const sampleFiles = fs.readdirSync(sourceFolder);

		fs.mkdirSync(activeFolder, { recursive: true });
		fs.mkdirSync(samplesFolder, { recursive: true });
		fs.mkdirSync(assetsFolder, { recursive: true });

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
	isThereAnyActiveScript: () => {
		const activeFolder = customScripts.activeFolder();
		const customViewFiles = fs.readdirSync(activeFolder);

		return customViewFiles.length > 0;
	},
	get: (viewFile) => {
		const activeFolder = customScripts.activeFolder();
		const filePath = path.join(activeFolder, viewFile);
		const content = fs.readFileSync(filePath, "utf8");
		return content;
	},
	getActiveScriptsList: () => {
		const activeFolder = customScripts.activeFolder();
		const activeViews = fs.readdirSync(activeFolder);
		const result = activeViews
		.filter((f) => {
			if (f.endsWith(".lua")) {
				return true
			} else {
				return false
			}
		})
		.map((f) => {
			const p = path.join(activeFolder, f);
			const name = path.basename(f);

			return { path: p, name };
		});

		return result;
	},
};

module.exports = customScripts;
