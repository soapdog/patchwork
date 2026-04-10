local script = {
	name = "Music From Worm Blossom"
}

function script.contextMenu(msg)
	return "View Raw Message"
end

function script.contextMenuAction()
	local m = [[
# Testing markdown support

Does this work?

* Yes
* no
]]

	openWebView(markdown(m))
end

return script
