const {h, Value} = require("mutant")
const announcements = require("./announcements.js")
const electron = require("electron");


const path = require("path")
const requireStyle = (moduleName, specificFilePath = false) => {
  const stylesPath = path.join(__dirname, "../styles", moduleName);
  const filePath = !specificFilePath
    ? path.resolve(stylesPath, `${moduleName}.css`)
    : path.resolve(stylesPath, specificFilePath);
  const urlStr = `@import "${filePath}"`;
  return urlStr;
};


module.exports = function (config) {
	let announcementsContent = Value("loading...")
	let checked = Value(false)
	const header = h("header", [
		h("h1", "Poncho Wonky Announcements")
	])

	const content = h("main", h("content", {
		innerHTML: announcementsContent
	}))

	const footer = h("footer", [
		h("div.spacer"),
		h("div", [
			h("input", {
				type: "checkbox", 
				id: "read",
				"ev-change": () => {
					checked.set(!checked())
				}
			}),
			h("label", {for: "read"}, "Don't show again")
		]),
		h("div", [
			h("button",{
				"ev-click": () => {
					if (checked()) {
						electron.ipcRenderer.invoke("clear-announcements").then(()=>{
							window.close()
						})
					} else {
						window.close()
					}
				}
			}, "close")
		])
	])

	 document.head.appendChild(
    h("style", {
      innerHTML: requireStyle("announcements"),
    }),
  );

	electron.ipcRenderer.invoke("get-announcements").then((html) => {
		console.log("got announcement", html)
		announcementsContent.set(html)
	})

	return [header, content, footer]
}