const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const ssbMarkdown = require("ssb-markdown");

const announcements = {
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
	destinationFolder: () => {
		return announcements.appData(
			"Patchwork",
			"announcements",
		);
	},
	unreadBox: () => {
		return path.join(announcements.destinationFolder(), "unread");
	},
	readBox: () => {
		return path.join(announcements.destinationFolder(), "read");
	},
	copy: () => {
		const readBox = announcements.readBox()
		const unreadBox = announcements.unreadBox()

		const sourceFolder = path.join(
			app.getAppPath(),
			"docs",
			"announcements",
		);

		const announcementFiles = fs.readdirSync(sourceFolder);

		fs.mkdirSync(unreadBox, { recursive: true });
		fs.mkdirSync(readBox, { recursive: true });

		announcementFiles.forEach((filename) => {
			if (!fs.existsSync(path.join(readBox, filename))) {
				fs.copyFileSync(
					path.join(sourceFolder, filename),
					path.join(unreadBox, filename),
				);

				console.log("copying announcement: " + filename);
			}
		});
	},
	markAsRead: () => {
		const readBox = announcements.readBox()
		const unreadBox = announcements.unreadBox()
		const announcementFiles = fs.readdirSync(unreadBox);

		announcementFiles.forEach((filename) => {
			fs.renameSync(
				path.join(unreadBox, filename),
				path.join(readBox, filename),
			);

			console.log("moving announcement: " + filename);
		});
	},
	available: () => {
		const unreadBox = announcements.unreadBox()
		const announcementFiles = fs.readdirSync(unreadBox);

		return announcementFiles.length > 0;
	},
	getAsHTML: () => {
		const unreadBox = announcements.unreadBox()
		const announcementFiles = fs.readdirSync(unreadBox);
		const html = announcementFiles.map((f) => {
			const markdownContent = fs.readFileSync(path.join(unreadBox, f));
			const htmlContent = ssbMarkdown.block(markdownContent);

			return htmlContent;
		});

		return html.join(`---\n\n`);
	},
	markUpdateNoticeAsSeen: (version) => {
		const readBox = announcements.readBox()
		let filename = `ignore-update-${version}.ini`;
		let fullPath = path.join(readBox, filename);
		let content = `
		version = "${version}"	
		`;

		fs.writeFileSync(fullPath, content);
	},
	isUpdateNoticeIgnored: (version) => {
		const readBox = announcements.readBox()
		let filename = `ignore-update-${version}.ini`;
		let fullPath = path.join(readBox, filename);
		return fs.existsSync(fullPath);
	},
};

module.exports = announcements
