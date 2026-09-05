const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../Model.js")

const fixtures = path.join(__dirname, "fixtures")
const matchesRaw = fs.readFileSync(path.join(fixtures, "matches.json"), "utf8")

function sampleMatch(overrides) {
  const base = {
    id: 1,
    leagueId: 47,
    time: "04.09.2026 21:00",
    timeTS: 1788548400000,
    home: { id: 9825, score: 1, name: "Arsenal", longName: "Arsenal" },
    away: { id: 8455, score: 0, name: "Chelsea", longName: "Chelsea" },
    status: {
      utcTime: "2026-09-04T19:00:00.000Z",
      started: true,
      finished: false,
      cancelled: false,
      ongoing: true,
      scoreStr: "1 - 0",
      liveTime: { short: "67\u200e’\u200e" },
      reason: { short: "" }
    }
  }
  return Object.assign(base, overrides, {
    home: Object.assign({}, base.home, overrides && overrides.home),
    away: Object.assign({}, base.away, overrides && overrides.away),
    status: Object.assign({}, base.status, overrides && overrides.status, {
      liveTime: Object.assign({}, base.status.liveTime, overrides && overrides.status && overrides.status.liveTime),
      reason: Object.assign({}, base.status.reason, overrides && overrides.status && overrides.status.reason)
    })
  })
}

test("dateKeyFromDate and shiftDateKey stay on local calendar days", () => {
  const d = new Date(2026, 8, 4)
  assert.equal(Model.dateKeyFromDate(d), "20260904")
  assert.equal(Model.shiftDateKey("20260904", 1), "20260905")
  assert.equal(Model.shiftDateKey("20260901", -1), "20260831")
  assert.equal(Model.dateHeading("20260904", "20260904"), "Today")
  assert.equal(Model.dateHeading("20260903", "20260904"), "Yesterday")
  assert.equal(Model.dateHeading("20260905", "20260904"), "Tomorrow")
  assert.match(Model.dateHeading("20260906", "20260904"), /Sep/)
})

test("curl and resource URLs stay on the upstream feed host", () => {
  assert.equal(Model.matchesUrl("20260904"), "https://www.fotmob.com/api/data/matches?date=20260904")
  assert.equal(Model.matchDetailsUrl("5795441"), "https://www.fotmob.com/api/data/matchDetails?matchId=5795441")
  assert.equal(Model.searchUrl("real madrid"), "https://www.fotmob.com/api/data/search/suggest?term=real%20madrid")
  assert.match(Model.teamLogoUrl(9825), /teamlogo\/9825_small\.png$/)
  const curl = Model.curlCommand(Model.matchesUrl("20260904"), 12)
  assert.equal(curl[0], "curl")
  assert.ok(curl.indexOf("Accept: application/json") !== -1)
  assert.ok(curl.indexOf(Model.matchesUrl("20260904")) !== -1)
})

test("parseMatches groups today's fixtures and cleans live clocks", () => {
  const parsed = Model.parseMatches(matchesRaw)
  assert.equal(parsed.ok, true)
  assert.ok(parsed.leagues.length >= 5)
  const pl = parsed.leagues.find(l => String(l.id) === "47")
  assert.ok(pl)
  assert.equal(pl.name, "Premier League")
  assert.equal(pl.matches[0].home.name, "Ipswich")
  assert.equal(pl.matches[0].away.name, "Liverpool")
  assert.equal(pl.matches[0].state, "finished")
  assert.equal(Model.scoreLabel(pl.matches[0]), "0 - 2")
  assert.equal(Model.matchClock(pl.matches[0]), "FT")

  const live = Model.liveMatches(parsed.leagues)
  assert.ok(live.length >= 1)
  assert.equal(live[0].state, "live")
  assert.doesNotMatch(live[0].liveTimeShort, /\u200e/)
})

test("filterLeagues keeps featured competitions and followed-team leagues", () => {
  const parsed = Model.parseMatches(matchesRaw)
  const featured = Model.filterLeagues(parsed.leagues, [47, 87], [], "featured")
  const names = featured.map(l => l.name)
  assert.ok(names.indexOf("Premier League") !== -1)
  assert.ok(names.indexOf("LaLiga") !== -1)
  assert.equal(names.indexOf("Ligue 1") === -1 || featured.length < parsed.leagues.length, true)

  const withFollow = Model.filterLeagues(parsed.leagues, [47], [{ id: "546238", name: "NYCFC" }], "featured")
  assert.ok(withFollow.some(l => l.name === "Major League Soccer"))
})

test("barHeadline prefers a followed live match and otherwise counts LIVE", () => {
  const parsed = Model.parseMatches(matchesRaw)
  const none = Model.barHeadline(parsed.leagues, [])
  assert.equal(none.live, true)
  assert.match(none.text, /LIVE|-\d|HT/)

  const live = Model.liveMatches(parsed.leagues)[0]
  const followed = Model.barHeadline(parsed.leagues, [{ id: live.home.id, name: live.home.name }])
  assert.equal(followed.live, true)
  assert.ok(followed.text.indexOf(live.home.name) !== -1 || followed.text.indexOf("LIVE") !== -1)
})

test("goalEvents fire only for followed teams when the score increases", () => {
  const league = {
    id: "47",
    name: "Premier League",
    matches: [Model.normalizeMatch(sampleMatch({ home: { score: 1 }, away: { score: 0 } }), { id: 47, name: "Premier League", ccode: "ENG" })]
  }
  const previous = Model.scoreSnapshot([league])
  league.matches = [Model.normalizeMatch(sampleMatch({ home: { score: 2 }, away: { score: 0 } }), { id: 47, name: "Premier League", ccode: "ENG" })]
  const current = Model.scoreSnapshot([league])

  assert.deepEqual(Model.goalEvents(previous, current, []), [])
  const events = Model.goalEvents(previous, current, [{ id: "9825", name: "Arsenal" }])
  assert.equal(events.length, 1)
  assert.match(events[0].headline, /GOAL/)
  assert.match(events[0].headline, /2-0/)
  assert.match(events[0].description, /Arsenal/)
})

test("toggleFollowed adds and removes a team without duplicates", () => {
  const arsenal = { id: "9825", name: "Arsenal", leagueId: 47, leagueName: "Premier League" }
  const once = Model.toggleFollowed([], arsenal)
  assert.equal(once.length, 1)
  assert.equal(once[0].name, "Arsenal")
  const twice = Model.toggleFollowed(once, arsenal)
  assert.equal(twice.length, 0)
  const fromString = Model.parseIdList("9825,8455")
  assert.equal(fromString.length, 2)
  assert.equal(Model.isFollowed(fromString, "8455"), true)
})

test("parseSearch keeps unique teams", () => {
  const raw = JSON.stringify([
    {
      title: { key: "all", value: "All" },
      suggestions: [
        { type: "team", id: "8633", name: "Real Madrid", leagueId: 87, leagueName: "LaLiga" },
        { type: "match", id: "1", homeTeamName: "Real Madrid" },
        { type: "team", id: "8633", name: "Real Madrid", leagueId: 87, leagueName: "LaLiga" }
      ]
    },
    {
      title: { key: "teams", value: "Teams" },
      suggestions: [
        { type: "team", id: "8633", name: "Real Madrid", leagueId: 87, leagueName: "LaLiga" },
        { type: "team", id: "1077486", name: "Real Madrid (W)", leagueId: 9907, leagueName: "Liga F" }
      ]
    }
  ])
  const teams = Model.parseSearch(raw)
  assert.equal(teams.length, 2)
  assert.equal(teams[0].name, "Real Madrid")
  assert.equal(teams[1].id, "1077486")
})

test("parseTable reads the all-standings rows", () => {
  const raw = JSON.stringify({
    details: { name: "Premier League" },
    table: [{
      data: {
        leagueName: "Premier League",
        table: {
          all: [
            { idx: 1, id: 8456, shortName: "Man City", name: "Manchester City", played: 2, wins: 2, draws: 0, losses: 0, goalConDiff: 4, pts: 6, scoresStr: "6-2", qualColor: "#2AD572" },
            { idx: 2, id: 9825, shortName: "Arsenal", name: "Arsenal", played: 2, wins: 2, draws: 0, losses: 0, goalConDiff: 4, pts: 6, scoresStr: "4-0", qualColor: "#2AD572" }
          ]
        }
      }
    }]
  })
  const table = Model.parseTable(raw)
  assert.equal(table.ok, true)
  assert.equal(table.name, "Premier League")
  assert.equal(table.rows.length, 2)
  assert.equal(table.rows[0].pos, 1)
  assert.equal(table.rows[0].pts, 6)
  assert.equal(table.rows[1].name, "Arsenal")
})

test("parseMatchDetails keeps goals, cards, and top stats", () => {
  const raw = JSON.stringify({
    general: { matchId: "5795441", leagueName: "Premier League", started: true, finished: true, homeTeam: { name: "Ipswich Town", id: 9902 }, awayTeam: { name: "Liverpool", id: 8650 } },
    header: {
      teams: [
        { name: "Ipswich Town", id: 9902, score: 0, imageUrl: "https://images.fotmob.com/image_resources/logo/teamlogo/9902_small.png" },
        { name: "Liverpool", id: 8650, score: 2, imageUrl: "https://images.fotmob.com/image_resources/logo/teamlogo/8650_small.png" }
      ],
      status: { utcTime: "2026-09-04T19:00:00.000Z", started: true, finished: true, reason: { short: "FT" } }
    },
    content: {
      matchFacts: {
        events: {
          events: [
            { type: "Goal", time: 6, timeStr: 6, isHome: false, nameStr: "Alexander Isak", assistInput: "Cody Gakpo", newScore: [0, 1] },
            { type: "Card", time: 10, timeStr: 10, isHome: false, nameStr: "Alexis Mac Allister", card: "Yellow" },
            { type: "Substitution", time: 64, isHome: false },
            { type: "Half", time: 45, halfStrShort: "HT" }
          ]
        }
      },
      stats: {
        Periods: {
          All: {
            stats: [{
              title: "Top stats",
              stats: [
                { title: "Ball possession", stats: [48, 52], type: "graph" },
                { title: "Expected goals (xG)", stats: ["1.00", "1.24"], type: "text" }
              ]
            }]
          }
        }
      }
    }
  })
  const details = Model.parseMatchDetails(raw)
  assert.equal(details.ok, true)
  assert.equal(details.match.home.name, "Ipswich Town")
  assert.equal(details.match.away.score, 2)
  assert.equal(details.match.events.length, 3)
  assert.equal(details.match.events[0].type, "Goal")
  assert.match(details.match.events[0].label, /Isak/)
  assert.match(details.match.events[0].clock, /6/)
  assert.equal(details.match.stats[0].title, "Ball possession")
  assert.equal(details.match.stats[1].away, "1.24")
})

test("toastCommand identifies as Kickoff and guards leading dashes", () => {
  const command = Model.toastCommand("-Liverpool score", "Premier League", 9)
  assert.equal(command[0], "omarchy-notification-send")
  assert.ok(command.indexOf("Kickoff") !== -1)
  assert.ok(command.some(part => String(part).indexOf("\u2060") === 0))
  assert.ok(command.indexOf("-r") !== -1)
})

test("winnerSide marks the leader in live and finished games only", () => {
  assert.equal(Model.winnerSide({ state: "live", home: { score: 2 }, away: { score: 1 } }), "home")
  assert.equal(Model.winnerSide({ state: "finished", home: { score: 0 }, away: { score: 3 } }), "away")
  assert.equal(Model.winnerSide({ state: "live", home: { score: 1 }, away: { score: 1 } }), "")
  assert.equal(Model.winnerSide({ state: "upcoming", home: { score: null }, away: { score: null } }), "")
  assert.equal(Model.winnerSide({ state: "cancelled", home: { score: 1 }, away: { score: 0 } }), "")
  assert.equal(Model.winnerSide(null), "")
})

test("dayTally counts matches by state across leagues", () => {
  const leagues = [
    { matches: [{ state: "live" }, { state: "finished" }] },
    { matches: [{ state: "upcoming" }, { state: "upcoming" }, { state: "cancelled" }] }
  ]
  const tally = Model.dayTally(leagues)
  assert.equal(tally.total, 5)
  assert.equal(tally.live, 1)
  assert.equal(tally.upcoming, 2)
  assert.equal(tally.finished, 1)
})

test("heroLine prefers errors, then live, then what is left of the day", () => {
  assert.equal(Model.heroLine({ error: "Could not reach the score feed", liveCount: 3 }), "Could not reach the score feed")
  assert.equal(Model.heroLine({ refreshing: true, liveCount: 3 }), "Chasing the ball\u2026")
  assert.equal(Model.heroLine({ liveCount: 1 }), "One match live. Stay with it.")
  assert.equal(Model.heroLine({ liveCount: 4 }), "4 matches live right now.")
  assert.equal(Model.heroLine({ liveCount: 0, upcomingCount: 1 }), "One kickoff still to come.")
  assert.equal(Model.heroLine({ liveCount: 0, upcomingCount: 6 }), "6 kickoffs still to come.")
  assert.equal(Model.heroLine({ liveCount: 0, upcomingCount: 0, finishedCount: 1 }), "One match done and dusted.")
  assert.ok(Model.heroLine({ seed: 20260905 }).length > 0)
})

test("line rotation is stable for a given seed and wraps", () => {
  const lines = ["a", "b", "c"]
  assert.equal(Model.pickLine(lines, 4), "b")
  assert.equal(Model.pickLine(lines, 4), "b")
  assert.equal(Model.pickLine(lines, -1), "b")
  assert.equal(Model.pickLine([], 3), "")
  assert.equal(Model.emptyDayLine(20260905), Model.emptyDayLine(20260905))
})

test("parseIdList accepts QML array wrappers and never shreds a stringified object", () => {
  // QML hands settings arrays over as objects that fail Array.isArray.
  const wrapper = { length: 2, 0: { id: "8634", name: "Barcelona" }, 1: { id: "8669", name: "Coventry City" } }
  const teams = Model.parseIdList(wrapper)
  assert.equal(teams.length, 2)
  assert.equal(teams[0].id, "8634")
  assert.equal(teams[1].name, "Coventry City")

  assert.deepEqual(Model.parseIdList("[object V4ReferenceObject]"), [])
  assert.deepEqual(Model.parseIdList([]), [])
  assert.equal(Model.parseIdList("47, 87").length, 2)
  assert.equal(Model.parseIdList('["47","87"]').length, 2)
  assert.equal(Model.parseIdList(47)[0].id, "47")
})

const SNAP_BEFORE = {
  "1": { home: 0, away: 0, state: "live", homeName: "Barcelona", awayName: "Sevilla", homeId: "8634", awayId: "9", leagueName: "LaLiga" },
  "2": { home: 1, away: 1, state: "live", homeName: "Leeds", awayName: "Brighton", homeId: "7", awayId: "8", leagueName: "Premier League" }
}
const SNAP_AFTER = {
  "1": { home: 1, away: 0, state: "live", homeName: "Barcelona", awayName: "Sevilla", homeId: "8634", awayId: "9", leagueName: "LaLiga" },
  "2": { home: 1, away: 2, state: "live", homeName: "Leeds", awayName: "Brighton", homeId: "7", awayId: "8", leagueName: "Premier League" }
}

test("celebrationEvents narrows to followed clubs, or opens up when none are followed", () => {
  const followed = Model.celebrationEvents(SNAP_BEFORE, SNAP_AFTER, [{ id: "8634", name: "Barcelona" }])
  assert.equal(followed.length, 1)
  assert.equal(followed[0].team, "Barcelona")
  assert.equal(followed[0].side, "home")

  const all = Model.celebrationEvents(SNAP_BEFORE, SNAP_AFTER, [])
  assert.equal(all.length, 2)
  const brighton = all.find(e => e.team === "Brighton")
  assert.equal(brighton.side, "away")
  assert.equal(brighton.homeScore, 1)
  assert.equal(brighton.awayScore, 2)

  assert.deepEqual(Model.celebrationEvents(null, SNAP_AFTER, []), [])
})

test("goal events carry the scoreline the caption needs", () => {
  const [event] = Model.celebrationEvents(SNAP_BEFORE, SNAP_AFTER, [{ id: "8634" }])
  assert.equal(Model.goalCaption(event), "Barcelona 1-0")
  assert.equal(Model.goalCaption(null), "GOAL!")
  assert.match(event.headline, /^GOAL · Barcelona 1-0 Sevilla$/)
})

test("demoGoalEvent awards the goal to whoever is behind", () => {
  const trailing = Model.demoGoalEvent({
    id: "77", state: "live", leagueName: "Serie A",
    home: { id: "1", name: "Roma", score: 2 },
    away: { id: "2", name: "Lazio", score: 0 }
  })
  assert.equal(trailing.team, "Lazio")
  assert.equal(trailing.homeScore, 2)
  assert.equal(trailing.awayScore, 1)

  const level = Model.demoGoalEvent({
    id: "78", state: "upcoming", leagueName: "",
    home: { id: "1", name: "Roma", score: null },
    away: { id: "2", name: "Lazio", score: null }
  })
  assert.equal(level.team, "Roma")
  assert.equal(level.homeScore, 1)

  const fallback = Model.demoGoalEvent(null)
  assert.equal(fallback.matchId, "demo")
  assert.ok(Model.goalCaption(fallback).length > 0)
})

test("celebrationLine is stable per goal and cycles through the shouts", () => {
  assert.equal(Model.celebrationLine(3), Model.celebrationLine(3))
  const shouts = new Set([0, 1, 2, 3, 4, 5].map(n => Model.celebrationLine(n)))
  assert.equal(shouts.size, 6)
  assert.equal(Model.celebrationLine(6), Model.celebrationLine(0))
})

const DAY = () => ([
  { id: "47", name: "Premier League", country: "ENG", matches: [
    { id: "a", state: "upcoming", timeTS: 300, leagueId: "47", home: { id: "1", name: "Man City" }, away: { id: "8669", name: "Coventry" } },
    { id: "b", state: "upcoming", timeTS: 100, leagueId: "47", home: { id: "2", name: "Leeds" }, away: { id: "3", name: "Brighton" } }
  ]},
  { id: "87", name: "LaLiga", country: "ESP", matches: [
    { id: "c", state: "live", timeTS: 900, leagueId: "87", home: { id: "8634", name: "Barcelona" }, away: { id: "4", name: "Sevilla" } }
  ]}
])

test("pinFollowed lifts followed clubs into a group at the top", () => {
  const out = Model.pinFollowed(DAY(), [{ id: "8634" }, { id: "8669" }])
  assert.equal(out[0].id, Model.PINNED_LEAGUE_ID)
  assert.equal(out[0].pinned, true)
  // Live first, then the upcoming one.
  assert.deepEqual(out[0].matches.map(m => m.id), ["c", "a"])
})

test("pinFollowed takes lifted matches out of their league, and drops emptied leagues", () => {
  const out = Model.pinFollowed(DAY(), [{ id: "8634" }, { id: "8669" }])
  const names = out.map(l => l.name)
  assert.deepEqual(names, ["YOUR CLUBS", "Premier League"])
  // "a" moved up, "b" stayed put, LaLiga had nothing left so it is gone.
  assert.deepEqual(out[1].matches.map(m => m.id), ["b"])
  assert.equal(names.indexOf("LaLiga"), -1)
})

test("pinFollowed leaves the day alone when there is nothing to pin", () => {
  const day = DAY()
  assert.equal(Model.pinFollowed(day, []), day, "no followed clubs returns the same array")
  const noFixtures = Model.pinFollowed(day, [{ id: "999999" }])
  assert.deepEqual(noFixtures.map(l => l.name), ["Premier League", "LaLiga"])
  assert.equal(noFixtures[0].matches.length, 2)
})

test("pinFollowed does not mutate the leagues it was given", () => {
  const day = DAY()
  Model.pinFollowed(day, [{ id: "8669" }])
  assert.deepEqual(day[0].matches.map(m => m.id), ["a", "b"])
  assert.equal(day.length, 2)
})

test("compareMatches ranks live over upcoming over finished, then by kickoff", () => {
  const live = { state: "live", timeTS: 900 }
  const soon = { state: "upcoming", timeTS: 100 }
  const later = { state: "upcoming", timeTS: 500 }
  const done = { state: "finished", timeTS: 10 }
  const off = { state: "cancelled", timeTS: 5 }
  const sorted = [done, later, off, live, soon].sort(Model.compareMatches)
  assert.deepEqual(sorted, [live, soon, later, done, off])
})

test("the pinned group has no crest to fetch", () => {
  assert.equal(Model.leagueLogoUrl("followed"), "")
  assert.equal(Model.leagueLogoUrl(""), "")
  assert.match(Model.leagueLogoUrl("47"), /leaguelogo\/47\.png$/)
})

test("goal events name the scorer's club so the bar can show its crest", () => {
  const before = { 1: { home: 0, away: 0, state: "live", homeName: "Arsenal", awayName: "Chelsea", homeId: "9825", awayId: "8455" } }
  const after = { 1: { home: 0, away: 1, state: "live", homeName: "Arsenal", awayName: "Chelsea", homeId: "9825", awayId: "8455" } }
  const [goal] = Model.celebrationEvents(before, after, [])
  assert.equal(goal.teamId, "8455")
  assert.equal(goal.team, "Chelsea")
})

test("the whistle blows once, when a shown match goes from live to finished", () => {
  const row = { home: 2, away: 1, homeName: "Arsenal", awayName: "Chelsea", homeId: "9825", awayId: "8455", leagueName: "Premier League" }
  const live = { 1: Object.assign({ state: "live" }, row) }
  const done = { 1: Object.assign({ state: "finished" }, row) }
  assert.equal(Model.fullTimeEvents(live, done, []).length, 1)
  assert.equal(Model.fullTimeEvents(done, done, []).length, 0)
  assert.equal(Model.fullTimeEvents(live, live, []).length, 0)
  // An upcoming match cancelled straight to finished never blew a whistle.
  assert.equal(Model.fullTimeEvents({ 1: Object.assign({ state: "upcoming" }, row) }, done, []).length, 0)
  // Following a club narrows it to their matches.
  assert.equal(Model.fullTimeEvents(live, done, ["8455"]).length, 1)
  assert.equal(Model.fullTimeEvents(live, done, ["1"]).length, 0)
  const [event] = Model.fullTimeEvents(live, done, ["8455"])
  assert.equal(event.headline, "FT · Arsenal 2-1 Chelsea")
  assert.equal(event.winner, "home")
  assert.equal(event.mine, "away")
})

test("the whistle's caption gives a followed club a verdict and a neutral the score", () => {
  const base = { homeScore: 2, awayScore: 1, winner: "home" }
  assert.equal(Model.fullTimeCaption(Object.assign({ mine: "home" }, base)), "THAT'S THE WIN 2-1")
  assert.equal(Model.fullTimeCaption(Object.assign({ mine: "away" }, base)), "NEXT TIME 2-1")
  assert.equal(Model.fullTimeCaption({ homeScore: 1, awayScore: 1, winner: "", mine: "home" }), "HONOURS EVEN 1-1")
  assert.equal(Model.fullTimeCaption(Object.assign({ mine: "" }, base)), "FT 2-1")
  assert.equal(Model.fullTimeCaption(null), "FULL TIME")
})

test("demoFullTimeEvent ends whatever is on screen, or a made-up match", () => {
  const made = Model.demoFullTimeEvent(null, [])
  assert.equal(made.headline, "FT · Kickoff FC 2-1 Real Nowhere")
  const match = Model.normalizeMatch(sampleMatch(), { id: 47, name: "Premier League" })
  const real = Model.demoFullTimeEvent(match, ["9825"])
  assert.equal(real.mine, "home")
  assert.equal(real.winner, "home")
  assert.equal(Model.fullTimeCaption(real), "THAT'S THE WIN 1-0")
})
