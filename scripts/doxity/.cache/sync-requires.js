// prefer default export if available
const preferDefault = m => m && m.default || m


exports.components = {
  "component---cache-dev-404-page-js": preferDefault(require("/home/x3/Melon/protocol/scripts/doxity/.cache/dev-404-page.js"))
}

exports.json = {
  "dev-404-page.json": require("/home/x3/Melon/protocol/scripts/doxity/.cache/json/dev-404-page.json")
}

exports.layouts = {

}