const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const panel = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

test("panel uses the scoped bar API when changing hover reveal state", () => {
  assert.match(panel, /typeof root\.bar\.setCenterHoverRevealSuppressed === "function"/)
  assert.match(panel, /root\.bar\.setCenterHoverRevealSuppressed\(value\)/)
  assert.doesNotMatch(panel, /root\.bar\.centerHoverRevealSuppressed\s*=/)
})

test("colours come from the theme, not from surfaces plugins can't see", () => {
  // The shell's Color singleton isn't reliably there for third-party
  // plugins; reading its accent or urgent assigns undefined.
  for (const file of fs.readdirSync(path.join(__dirname, "..")).filter(f => f.endsWith(".qml")))
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), /\bColor\./, file)
})

test("every Text renders plain, so feed markup can't style or fetch", () => {
  for (const file of ["BarWidget.qml", "KickoffIcon.qml", "MatchRow.qml", "Panel.qml"]) {
    const lines = fs.readFileSync(path.join(__dirname, "..", file), "utf8").split("\n")
    lines.forEach((line, i) => {
      if (!/(^|[\s:])Text \{/.test(line)) return
      const block = lines.slice(i, i + 4).join("\n")
      assert.match(block, /textFormat: Text\.PlainText/, file + ":" + (i + 1))
    })
  }
})

test("every crest image decodes at a bounded size", () => {
  for (const file of ["BarWidget.qml", "MatchRow.qml", "Panel.qml"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8")
    const images = source.split(/\bImage \{/).slice(1)
    assert.ok(images.length > 0, file)
    for (const block of images) assert.match(block.slice(0, 600), /sourceSize\.width: \d+/, file)
  }
})
