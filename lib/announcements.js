const path = require("path");
const fs = require("fs");
const {app} = require("electron")
const ssbMarkdown = require("ssb-markdown")

module.exports = {
	copy: () => {
		const destinationFolder = path.join(app.getPath("appData"), "Patchwork", "announcements")
		const unreadBox = path.join(destinationFolder, "unread")
		const readBox = path.join(destinationFolder, "read")
		const sourceFolder = path.join(app.getAppPath(),"docs","announcements")

		const announcementFiles = fs.readdirSync(sourceFolder)

		fs.mkdirSync(unreadBox, {recursive: true})
		fs.mkdirSync(readBox, {recursive: true})

		announcementFiles.forEach(filename => {
			if (!fs.existsSync(path.join(readBox, filename))) {
				fs.copyFileSync(path.join(sourceFolder, filename),
				path.join(unreadBox, filename))

				console.log("copying announcement: " + filename)
			}
		})
	},
	markAsRead: () => {
		const destinationFolder = path.join(app.getPath("appData"), "Patchwork", "announcements")
		const unreadBox = path.join(destinationFolder, "unread")
		const readBox = path.join(destinationFolder, "read")

		const announcementFiles = fs.readdirSync(unreadBox)

		announcementFiles.forEach(filename => {
				fs.renameSync(
					path.join(unreadBox, filename),
					path.join(readBox, filename))

				console.log("moving announcement: " + filename)
		})
	},
	available: () => {
		const destinationFolder = path.join(app.getPath("appData"), "Patchwork", "announcements")
		const unreadBox = path.join(destinationFolder, "unread")
		const announcementFiles = fs.readdirSync(unreadBox)

		return announcementFiles.length > 0
	},
	getAsHTML: () => {
		const destinationFolder = path.join(app.getPath("appData"), "Patchwork", "announcements")
		const unreadBox = path.join(destinationFolder, "unread")
		const announcementFiles = fs.readdirSync(unreadBox)

		const html = announcementFiles.map(f => {
			const markdownContent = fs.readFileSync(path.join(unreadBox, f))
			const htmlContent = ssbMarkdown.block(markdownContent)

			return htmlContent
		})

		return html.join(`---\n\n`)
	}

}