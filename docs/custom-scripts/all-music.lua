local view = {
	NAME = "All Music View"
}

function view.query()
	local res = {
		query = {
			type = "post"
		}
	}
	return res
end

function view.filter(msg)

end

function view.drain(msg)

end

return view