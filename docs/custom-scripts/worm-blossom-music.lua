local wbMusic = {
	NAME = "Music From Worm Blossom"
}

--[[
Auxiliary functions
]]

function string:contains(sub)
    return self:find(sub, 1, true) ~= nil
end

function string:startswith(start)
    local sub = self:sub(1, #start) == start
    return sub
end

function string:endswith(ending)
    return ending == "" or self:sub(-#ending) == ending
end

local function extractWormBlossomURL(text)
	local m = string.match(text, '[a-z]*://[^ \n >,;]*')

	if m and m:startswith("https://worm-blossom.org/#y") then
		return m
	else
		return false
	end
end


--[[
Button actions add a button to a message if it "buttonAction"
returns true

The action function is called if the user press the button.
]]

function wbMusic.buttonAction(msg)
	if msg == nil then 
		return false, "no message"
	end

	if msg.value.content.type ~= "post" then
		return false, "message is not post"
	end

	local text =  msg.value.content.text
	local url = extractWormBlossomURL(text)

	if url then
		return true, "Open in Worm Blossom Player"
	else
		return false, "no blossom url"
	end
end

function wbMusic.action(msg)
	local text =  msg.value.content.text
	local url = extractWormBlossomURL(text)

	local co = coroutine.create(function() -- must wrapped in a coroutine because fetch is async
		local content = fetch(url)
		if content then
			local iframe = querySelect(content, "iframe")
			local src = getAttribute(iframe, "src")
			local song = getParam(src, "song")
			log(song)
			openWindowFromAssets("worm-blossom-player/player.html", {
				data = song
			})
		end
	end)
	coroutine.resume(co)
end

--[[
Menu adds a menu item to the "MORE" button.
]]

function wbMusic.menuAction() 
	return "All Worm Blossom Music"
end

function wbMusic.menu()
	local opts = {
		query ={{	
			["$filter"] = {
				value = {
					content = {
						channel = "worm-blossom",
						type = "post"
					}
				}
			},
			["$sort"] = {{"value","timestamp"}}
		}},
		limit = 100,
		reverse = true
	}
	local music = queryAndDrain(opts)
	
end


return wbMusic