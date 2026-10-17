// The feed may not send more than the plugin will hold, and what it sends
// is only ever text and crests from the feed's own hosts.
const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const { spawn } = require("node:child_process")
const Model = require("../Model.js")

// Serve a body of `size` bytes, either with a Content-Length or chunked.
function serve(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler)
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

function body(size) { return "[" + "1,".repeat(Math.max(0, (size - 3) / 2)) + "1]" }

// The real fetch script, pointed at the local server instead of the feed.
function fetch(url, cap) {
  const cmd = Model.curlCommand(Model.matchesUrl("20260904"), 5, cap)
  cmd[cmd.length - 1] = url
  return new Promise(resolve => {
    const child = spawn(cmd[0], cmd.slice(1))
    let out = ""
    child.stdout.on("data", c => { out += c })
    child.on("close", code => resolve({ code, out }))
  })
}

test("a response within the cap comes through untouched", async () => {
  const text = body(1001)
  const server = await serve((req, res) => res.end(text))
  const r = await fetch("http://127.0.0.1:" + server.address().port + "/", 2000)
  server.close()
  assert.equal(r.code, 0)
  assert.equal(r.out, text)
  assert.equal(Model.parseJson(r.out, 2000).ok, true)
})

test("a response of exactly the cap is accepted", async () => {
  const text = body(1001)
  const server = await serve((req, res) => res.end(text))
  const r = await fetch("http://127.0.0.1:" + server.address().port + "/", text.length)
  server.close()
  assert.equal(r.code, 0)
  assert.equal(r.out.length, text.length)
})

test("an oversized response with a declared length is refused", async () => {
  const text = body(20001)
  const server = await serve((req, res) => { res.setHeader("Content-Length", text.length); res.end(text) })
  const r = await fetch("http://127.0.0.1:" + server.address().port + "/", 10000)
  server.close()
  assert.equal(r.code, Model.FEED_TOO_LARGE_EXIT)
  assert.equal(r.out, "")
})

test("one byte past the cap that slips through is still refused", async () => {
  const text = body(1003)
  const server = await serve((req, res) => res.end(text))
  const r = await fetch("http://127.0.0.1:" + server.address().port + "/", text.length - 2)
  server.close()
  assert.ok(r.out.length <= text.length - 1)
  assert.equal(Model.parseJson(r.out, text.length - 2).ok, false)
})

test("an oversized chunked response with no length is cut off and refused", async () => {
  const server = await serve((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" })
    let sent = 0
    const tick = () => {
      if (sent > 5 * 1024 * 1024 || res.destroyed) return res.end()
      sent += 64 * 1024
      res.write("1".repeat(64 * 1024), tick)
    }
    tick()
  })
  const r = await fetch("http://127.0.0.1:" + server.address().port + "/", 100000)
  server.close()
  // The command fails, so the service never parses; and no more than one
  // byte past the cap was ever held.
  assert.notEqual(r.code, 0)
  assert.ok(r.out.length <= 100001, String(r.out.length))
})

test("a failing feed fails the command", async () => {
  const server = await serve((req, res) => { res.statusCode = 500; res.end("nope") })
  const r = await fetch("http://127.0.0.1:" + server.address().port + "/", 1000)
  server.close()
  assert.notEqual(r.code, 0)
  assert.equal(r.out, "")
})

test("the parser refuses text past the cap even if it got through", () => {
  const parsed = Model.parseJson(body(5001), 1000)
  assert.equal(parsed.ok, false)
  assert.match(parsed.error, /too much/)
  assert.equal(Model.parseMatches(" ".repeat(Model.FEED_LIMITS.matches + 1) + "{}").ok, false)
})

test("every feed has a cap well above its real size", () => {
  // Measured October 2026: busiest match day ~420 KB, details ~250 KB,
  // a league ~850 KB, a search ~3 KB.
  assert.ok(Model.FEED_LIMITS.matches >= 4200000)
  assert.ok(Model.FEED_LIMITS.details >= 2500000)
  assert.ok(Model.FEED_LIMITS.league >= 8500000)
  assert.ok(Model.FEED_LIMITS.search >= 30000)
})

test("only the feed's own API is ever fetched", () => {
  for (const url of ["http://www.fotmob.com/api/data/matches", "https://evil.example/api/data", "file:///etc/passwd", "https://www.fotmob.com.evil.example/api/data/x"]) {
    assert.equal(Model.curlCommand(url, 5, 1000).slice(-1)[0], "", url)
  }
})

test("crests come only from the feed's image host over https", () => {
  const good = "https://images.fotmob.com/image_resources/logo/teamlogo/9825_small.png"
  assert.equal(Model.crestUrl(good, 1), good)
  for (const bad of [
    "http://images.fotmob.com/image_resources/logo/teamlogo/9825_small.png",
    "https://evil.example/logo.png",
    "file:///home/demo/.ssh/id_rsa",
    "https://images.fotmob.com/image_resources/logo/../../secret.png",
    "javascript:alert(1)",
    "<img src=x>"
  ]) assert.equal(Model.crestUrl(bad, 9825), Model.teamLogoUrl(9825), bad)
  assert.equal(Model.crestUrl("data:image/png;base64,AAAA", "../x"), "")
})

test("ids that aren't numbers never reach a crest URL", () => {
  for (const bad of ["../../etc", "9825/../1", "9825?x=1", "<b>1</b>", "1 2", ""]) {
    assert.equal(Model.teamLogoUrl(bad), "", bad)
    assert.equal(Model.leagueLogoUrl(bad), "", bad)
  }
  assert.match(Model.teamLogoUrl(9825), /teamlogo\/9825_small\.png$/)
})

test("markup in feed names stays literal text all the way to the row", () => {
  const raw = JSON.stringify({ leagues: [{ id: 47, primaryId: 47, name: "<font color=red>League</font>", matches: [{
    id: 1, leagueId: 47, time: "04.09.2026 21:00",
    home: { id: 1, name: "<img src=https://evil.example/x.png>", score: 0 },
    away: { id: 2, name: "<b>Away</b> &amp;", score: 0 },
    status: { utcTime: "2026-09-04T19:00:00.000Z", started: false, finished: false }
  }] }] })
  const parsed = Model.parseMatches(raw)
  assert.equal(parsed.ok, true)
  const m = parsed.leagues[0].matches[0]
  assert.equal(m.home.name, "<img src=https://evil.example/x.png>")
  assert.equal(m.away.name, "<b>Away</b> &amp;")
})
