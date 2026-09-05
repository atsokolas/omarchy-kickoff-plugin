// Pure helpers for the Kickoff Omarchy plugin. QML imports this file; Node
// tests require the same exports at the bottom.

var API_BASE = "https://www.fotmob.com/api/data"
var IMAGE_BASE = "https://images.fotmob.com/image_resources/logo"
var USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
// The Nerd Font MDI block in JetBrainsMono is offset from the v3 codepoints,
// so U+F0878 lands on a "high definition" badge rather than a ball. Use the
// emoji instead — the shell falls back to Noto Color Emoji for these.
var BALL_GLYPH = "⚽"
var NET_GLYPH = "🥅"
var SOCCER_GLYPH = BALL_GLYPH
var APP_NAME = "Kickoff"
var toastReplaceWindowMs = 10 * 60 * 1000
var toastAppName = APP_NAME

var DEFAULT_FEATURED_IDS = [47, 87, 54, 55, 53, 42, 73, 913550]

var FEATURED_LEAGUES = [
  { id: 47, name: "Premier League" },
  { id: 87, name: "LaLiga" },
  { id: 54, name: "Bundesliga" },
  { id: 55, name: "Serie A" },
  { id: 53, name: "Ligue 1" },
  { id: 42, name: "Champions League" },
  { id: 73, name: "Europa League" },
  { id: 913550, name: "MLS" }
]

function pad2(value) {
  var n = Number(value)
  if (!isFinite(n)) return "00"
  n = Math.floor(n)
  return n < 10 ? "0" + n : String(n)
}

function dateKeyFromDate(date) {
  var d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate())
}

function parseDateKey(key) {
  var s = String(key || "")
  if (!/^\d{8}$/.test(s)) return null
  var d = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  return isNaN(d.getTime()) ? null : d
}

function shiftDateKey(key, days) {
  var d = parseDateKey(key)
  if (!d) return String(key || "")
  d.setDate(d.getDate() + (parseInt(days, 10) || 0))
  return dateKeyFromDate(d)
}

function dateHeading(key, todayKey) {
  var current = String(key || "")
  var today = String(todayKey || "")
  if (current && current === today) return "Today"
  if (current && current === shiftDateKey(today, -1)) return "Yesterday"
  if (current && current === shiftDateKey(today, 1)) return "Tomorrow"
  var d = parseDateKey(current)
  if (!d) return current
  var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return days[d.getDay()] + " " + d.getDate() + " " + months[d.getMonth()]
}

function matchesUrl(dateKey) {
  return API_BASE + "/matches?date=" + encodeURIComponent(String(dateKey || ""))
}

function matchDetailsUrl(matchId) {
  return API_BASE + "/matchDetails?matchId=" + encodeURIComponent(String(matchId || ""))
}

function leagueUrl(leagueId) {
  return API_BASE + "/leagues?id=" + encodeURIComponent(String(leagueId || ""))
}

function searchUrl(term) {
  return API_BASE + "/search/suggest?term=" + encodeURIComponent(String(term || ""))
}

function teamLogoUrl(teamId) {
  var id = String(teamId || "")
  if (!id) return ""
  return IMAGE_BASE + "/teamlogo/" + encodeURIComponent(id) + "_small.png"
}

function leagueLogoUrl(leagueId) {
  var id = String(leagueId || "")
  if (!id) return ""
  return IMAGE_BASE + "/leaguelogo/" + encodeURIComponent(id) + ".png"
}

function matchPageUrl(matchId) {
  return "https://www.fotmob.com/matches/" + encodeURIComponent(String(matchId || ""))
}

function curlCommand(url, timeoutSec) {
  var timeout = String(Math.max(4, parseInt(timeoutSec, 10) || 12))
  return [
    "curl", "-fsS", "--max-time", timeout,
    "-A", USER_AGENT,
    "-H", "Accept: application/json",
    "-H", "Referer: https://www.fotmob.com/",
    String(url || "")
  ]
}

function openMatchCommand(matchId) {
  return ["xdg-open", matchPageUrl(matchId)]
}

function notificationText(text) {
  var value = String(text || "").replace(/\s+/g, " ").trim()
  if (value.length > 180) value = value.substring(0, 177) + "…"
  return value.charAt(0) === "-" ? "\u2060" + value : value
}

function toastCommand(headline, description, replaceId) {
  var command = [
    "omarchy-notification-send",
    "--app-name", toastAppName,
    "-g", SOCCER_GLYPH,
    "-u", "normal",
    notificationText(headline)
  ]
  if (String(description || "") !== "") command.push(notificationText(description))
  command.push("-p")
  var id = Number(replaceId || 0)
  if (isFinite(id) && id > 0) command.push("-r", String(id))
  return command
}

function replaceableToastId(id, atMs, nowMs) {
  var value = Number(id || 0)
  if (!isFinite(value) || value <= 0) return 0
  return Number(nowMs) - Number(atMs || 0) > toastReplaceWindowMs ? 0 : value
}

function parseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(String(raw || "")), error: "" }
  } catch (e) {
    return { ok: false, value: null, error: "Could not read the score feed" }
  }
}

function teamRef(raw) {
  var t = raw || {}
  var score = t.score
  var n = score === undefined || score === null || score === "" ? null : Number(score)
  return {
    id: String(t.id || ""),
    name: String(t.name || t.longName || ""),
    longName: String(t.longName || t.name || ""),
    score: isFinite(n) ? n : null
  }
}

function cleanClock(value) {
  return String(value || "")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/[’′]/g, "'")
    .trim()
}

function kickoffLabel(utcTime) {
  if (!utcTime) return ""
  var d = new Date(utcTime)
  if (isNaN(d.getTime())) return ""
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes())
}

function matchState(status) {
  var st = status || {}
  if (st.cancelled === true) return "cancelled"
  if (st.finished === true) return "finished"
  if (st.started === true || st.ongoing === true) return "live"
  return "upcoming"
}

function normalizeMatch(raw, league) {
  var m = raw || {}
  var status = m.status || {}
  var reason = status.reason || {}
  var liveTime = status.liveTime || {}
  var lg = league || {}
  var home = teamRef(m.home)
  var away = teamRef(m.away)
  var state = matchState(status)
  return {
    id: String(m.id || ""),
    leagueId: String(m.leagueId || lg.id || ""),
    leagueName: String(lg.name || ""),
    country: String(lg.ccode || ""),
    time: String(m.time || ""),
    timeTS: Number(m.timeTS || 0),
    utcTime: String(status.utcTime || ""),
    home: home,
    away: away,
    started: status.started === true,
    finished: status.finished === true,
    cancelled: status.cancelled === true,
    ongoing: status.ongoing === true,
    scoreStr: String(status.scoreStr || ""),
    liveTimeShort: cleanClock(liveTime.short || ""),
    statusReason: String(reason.short || ""),
    state: state
  }
}

function normalizeLeague(raw) {
  var lg = raw || {}
  var matches = []
  var source = lg.matches || []
  for (var i = 0; i < source.length; i++) matches.push(normalizeMatch(source[i], lg))
  return {
    id: String(lg.id || lg.primaryId || ""),
    primaryId: String(lg.primaryId || lg.id || ""),
    name: String(lg.name || ""),
    country: String(lg.ccode || ""),
    matches: matches
  }
}

function parseMatches(raw) {
  var parsed = parseJson(raw)
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object")
    return { ok: false, error: parsed.error || "Unexpected matches payload", date: "", leagues: [] }
  var data = parsed.value
  var source = data.leagues || []
  var leagues = []
  for (var i = 0; i < source.length; i++) leagues.push(normalizeLeague(source[i]))
  return { ok: true, error: "", date: String(data.date || ""), leagues: leagues }
}

function flattenMatches(leagues) {
  var out = []
  var list = leagues || []
  for (var i = 0; i < list.length; i++) {
    var matches = list[i].matches || []
    for (var j = 0; j < matches.length; j++) out.push(matches[j])
  }
  return out
}

function indexIds(values) {
  var map = {}
  var list = parseIdList(values)
  for (var i = 0; i < list.length; i++) map[String(list[i].id)] = true
  return map
}

// QML hands settings arrays over as V4 wrappers that fail Array.isArray, so
// accept anything indexable. Without this, a followed-teams list stringifies
// to "[object V4ReferenceObject]" and gets shredded into junk entries.
function arrayLike(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== "object") return null
  if (typeof value.length !== "number" || value.length < 0) return null
  var copy = []
  for (var i = 0; i < value.length; i++) copy.push(value[i])
  return copy
}

function parseIdList(value) {
  if (!value && value !== 0) return []
  if (typeof value === "string") return parseIdText(value)
  var list = arrayLike(value)
  if (list === null) return parseIdText(String(value))
  {
    var out = []
    var seen = {}
    for (var i = 0; i < list.length; i++) {
      var item = list[i]
      var team = null
      if (item && typeof item === "object") {
        var id = String(item.id || "").trim()
        if (!id) continue
        team = {
          id: id,
          name: String(item.name || id),
          leagueId: String(item.leagueId || ""),
          leagueName: String(item.leagueName || "")
        }
      } else {
        var sid = String(item || "").trim()
        if (!sid) continue
        team = { id: sid, name: sid, leagueId: "", leagueName: "" }
      }
      if (seen[team.id]) continue
      seen[team.id] = true
      out.push(team)
    }
    return out
  }
}

function parseIdText(value) {
  var text = String(value === undefined || value === null ? "" : value).trim()
  if (!text) return []
  // A bracketed string is either JSON or a stringified object. Never split
  // the latter on whitespace — that is what produced the junk entries.
  if (text.charAt(0) === "[") {
    var parsed = parseJson(text)
    return parsed.ok ? parseIdList(parsed.value) : []
  }
  return parseIdList(text.split(/[,\s]+/))
}

function featuredIds(value) {
  var list = parseIdList(value)
  if (list.length === 0) {
    var defaults = []
    for (var i = 0; i < DEFAULT_FEATURED_IDS.length; i++)
      defaults.push({ id: String(DEFAULT_FEATURED_IDS[i]), name: "", leagueId: "", leagueName: "" })
    return defaults
  }
  return list
}

function isFollowed(teams, id) {
  return !!indexIds(teams)[String(id || "")]
}

function toggleFollowed(teams, team) {
  var id = String(team && team.id || "").trim()
  if (!id) return parseIdList(teams)
  var list = parseIdList(teams)
  var next = []
  var found = false
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].id) === id) {
      found = true
      continue
    }
    next.push(list[i])
  }
  if (!found) {
    next.push({
      id: id,
      name: String(team.name || id),
      leagueId: String(team.leagueId || ""),
      leagueName: String(team.leagueName || "")
    })
  }
  return next
}

function involvedFollowed(match, followedIds) {
  if (!match) return false
  var followed = indexIds(followedIds)
  return !!(followed[String(match.home && match.home.id)] || followed[String(match.away && match.away.id)])
}

function filterLeagues(leagues, featured, followed, mode) {
  var list = leagues || []
  if (String(mode || "featured") === "all") return list
  var feat = indexIds(featuredIds(featured))
  var fol = indexIds(followed)
  var out = []
  var liveFallback = []
  for (var i = 0; i < list.length; i++) {
    var lg = list[i]
    var featuredHit = feat[String(lg.id)] || feat[String(lg.primaryId)]
    var followedHit = false
    var liveHit = false
    var matches = lg.matches || []
    for (var j = 0; j < matches.length; j++) {
      if (involvedFollowed(matches[j], followed)) followedHit = true
      if (matches[j].state === "live") liveHit = true
    }
    if (featuredHit || followedHit) out.push(lg)
    else if (liveHit) liveFallback.push(lg)
  }
  if (out.length === 0) return liveFallback
  return out
}

var PINNED_LEAGUE_ID = "followed"
var PINNED_LEAGUE_NAME = "YOUR CLUBS"

function matchOrderRank(match) {
  var state = match ? match.state : ""
  if (state === "live") return 0
  if (state === "upcoming") return 1
  if (state === "finished") return 2
  return 3
}

// Live first, then whatever kicks off soonest, then what is already done.
function compareMatches(a, b) {
  var rank = matchOrderRank(a) - matchOrderRank(b)
  if (rank !== 0) return rank
  return Number((a && a.timeTS) || 0) - Number((b && b.timeTS) || 0)
}

// Lifts every match involving a followed club into a pinned group at the top
// of the day, and takes them out of their league groups so nothing appears
// twice. Follow nobody and the list comes back untouched.
function pinFollowed(leagues, followed) {
  var list = arrayLike(leagues) || []
  var followedList = parseIdList(followed)
  if (!followedList.length) return list

  var pinned = []
  var rest = []
  for (var i = 0; i < list.length; i++) {
    var league = list[i] || {}
    var matches = arrayLike(league.matches) || []
    var remaining = []
    for (var j = 0; j < matches.length; j++) {
      if (involvedFollowed(matches[j], followedList)) pinned.push(matches[j])
      else remaining.push(matches[j])
    }
    if (remaining.length === matches.length) {
      rest.push(league)
      continue
    }
    if (!remaining.length) continue
    var copy = {}
    for (var key in league) copy[key] = league[key]
    copy.matches = remaining
    rest.push(copy)
  }

  if (!pinned.length) return list
  pinned.sort(compareMatches)
  return [{
    id: PINNED_LEAGUE_ID,
    name: PINNED_LEAGUE_NAME,
    country: "",
    pinned: true,
    matches: pinned
  }].concat(rest)
}

function followingMatches(leagues, followed) {
  var list = flattenMatches(leagues)
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (involvedFollowed(list[i], followed)) out.push(list[i])
  }
  return out
}

function liveMatches(leagues) {
  var list = flattenMatches(leagues)
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].state === "live") out.push(list[i])
  }
  return out
}

function matchClock(match) {
  if (!match) return ""
  if (match.state === "cancelled") return match.statusReason || "PP"
  if (match.state === "finished") return match.statusReason || "FT"
  if (match.state === "live") return match.liveTimeShort || match.statusReason || "LIVE"
  return kickoffLabel(match.utcTime)
}

function hasScore(team) {
  return !!(team && team.score !== null && team.score !== undefined && team.score !== "")
}

function scoreLabel(match) {
  if (!match) return "-"
  if (match.state === "upcoming" || match.state === "cancelled") return "-"
  if (hasScore(match.home) && hasScore(match.away))
    return match.home.score + " - " + match.away.score
  return match.scoreStr || "-"
}

function compactScore(match) {
  if (!match) return "-"
  if (match.state === "upcoming" || match.state === "cancelled") return "vs"
  if (match.home && match.home.score !== null && match.away && match.away.score !== null)
    return match.home.score + "-" + match.away.score
  return String(match.scoreStr || "vs").replace(/\s+/g, "")
}

function barHeadline(leagues, followed) {
  var matches = flattenMatches(leagues)
  var followedList = parseIdList(followed)
  var liveFollowed = []
  var liveAll = []
  var nextFollowed = null
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i]
    var mine = involvedFollowed(m, followedList)
    if (m.state === "live") {
      liveAll.push(m)
      if (mine) liveFollowed.push(m)
    } else if (m.state === "upcoming" && mine) {
      if (!nextFollowed || Number(m.timeTS || 0) < Number(nextFollowed.timeTS || 0)) nextFollowed = m
    }
  }

  function line(match) {
    return match.home.name + " " + compactScore(match) + " " + match.away.name + "  " + matchClock(match)
  }

  if (liveFollowed.length === 1)
    return { text: line(liveFollowed[0]), live: true, count: 1, matchId: liveFollowed[0].id }
  if (liveFollowed.length > 1)
    return { text: "LIVE " + liveFollowed.length, live: true, count: liveFollowed.length, matchId: liveFollowed[0].id }
  if (followedList.length === 0 && liveAll.length === 1)
    return { text: line(liveAll[0]), live: true, count: 1, matchId: liveAll[0].id }
  if (followedList.length === 0 && liveAll.length > 1)
    return { text: "LIVE " + liveAll.length, live: true, count: liveAll.length, matchId: liveAll[0].id }
  if (nextFollowed)
    return { text: nextFollowed.home.name + " vs " + nextFollowed.away.name + "  " + kickoffLabel(nextFollowed.utcTime), live: false, count: 0, matchId: nextFollowed.id }
  if (liveAll.length)
    return { text: "LIVE " + liveAll.length, live: true, count: liveAll.length, matchId: liveAll[0].id }
  return { text: APP_NAME, live: false, count: 0, matchId: "" }
}

function scoreSnapshot(leagues) {
  var map = {}
  var matches = flattenMatches(leagues)
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i]
    map[String(m.id)] = {
      home: m.home && m.home.score !== null ? m.home.score : 0,
      away: m.away && m.away.score !== null ? m.away.score : 0,
      state: m.state,
      homeName: m.home ? m.home.name : "",
      awayName: m.away ? m.away.name : "",
      homeId: m.home ? String(m.home.id) : "",
      awayId: m.away ? String(m.away.id) : "",
      leagueName: m.leagueName || ""
    }
  }
  return map
}

// Core goal scan. `accept` filters which matches count; everything else is
// shared between the toast path (followed clubs only) and the celebration
// path (whatever the bar is actually showing).
function scanGoals(previous, current, accept) {
  var events = []
  if (!previous || !current) return events
  for (var id in current) {
    if (!Object.prototype.hasOwnProperty.call(current, id)) continue
    var now = current[id]
    var was = previous[id]
    if (!now || !was) continue
    if (accept && !accept(now)) continue
    var homeUp = Number(now.home) > Number(was.home)
    var awayUp = Number(now.away) > Number(was.away)
    if (!homeUp && !awayUp) continue
    var side = homeUp ? "home" : "away"
    var team = homeUp ? now.homeName : now.awayName
    events.push({
      matchId: String(id),
      side: side,
      team: team,
      opponent: homeUp ? now.awayName : now.homeName,
      homeName: now.homeName,
      awayName: now.awayName,
      homeScore: Number(now.home),
      awayScore: Number(now.away),
      leagueName: now.leagueName || "",
      headline: "GOAL · " + now.homeName + " " + now.home + "-" + now.away + " " + now.awayName,
      description: team + (now.leagueName ? " · " + now.leagueName : "")
    })
  }
  return events
}

function goalEvents(previous, current, followed) {
  var followedList = parseIdList(followed)
  if (!followedList.length) return []
  var fol = indexIds(followedList)
  return scanGoals(previous, current, function (now) {
    return !!(fol[now.homeId] || fol[now.awayId])
  })
}

// What the bar celebrates. Follow clubs and it is their goals only; follow
// nobody and every goal is worth a little animation. Same rule the bar
// headline uses, so the pill never celebrates a match it is not showing.
function celebrationEvents(previous, current, followed) {
  if (parseIdList(followed).length) return goalEvents(previous, current, followed)
  return scanGoals(previous, current, null)
}

var CELEBRATION_LINES = [
  "GET IN!",
  "GOAL!",
  "BACK OF THE NET!",
  "HAVE IT!",
  "TOP CORNER!",
  "GOOOAAAL!"
]

function celebrationLine(seed) {
  return pickLine(CELEBRATION_LINES, seed)
}

// Synthesises the event a goal in `match` would produce, for the demo hook
// (`omarchy-shell atsokolas.kickoff celebrate`). Awards it to whoever is
// behind, because a leveller is more fun than a fourth for the winner.
function demoGoalEvent(match) {
  if (!match || !match.home || !match.away) {
    return {
      matchId: "demo", side: "home", team: "Kickoff FC", opponent: "Real Nowhere",
      homeName: "Kickoff FC", awayName: "Real Nowhere", homeScore: 1, awayScore: 0,
      leagueName: "", headline: "GOAL · Kickoff FC 1-0 Real Nowhere",
      description: "Kickoff FC"
    }
  }
  var home = hasScore(match.home) ? Number(match.home.score) : 0
  var away = hasScore(match.away) ? Number(match.away.score) : 0
  var side = home > away ? "away" : "home"
  if (side === "home") home = home + 1
  else away = away + 1
  var snapshot = {}
  snapshot[String(match.id)] = {
    home: home, away: away, state: match.state,
    homeName: match.home.name, awayName: match.away.name,
    homeId: String(match.home.id), awayId: String(match.away.id),
    leagueName: match.leagueName || ""
  }
  var before = {}
  before[String(match.id)] = {
    home: side === "home" ? home - 1 : home,
    away: side === "away" ? away - 1 : away,
    state: match.state,
    homeName: match.home.name, awayName: match.away.name,
    homeId: String(match.home.id), awayId: String(match.away.id),
    leagueName: match.leagueName || ""
  }
  var events = scanGoals(before, snapshot, null)
  return events.length ? events[0] : null
}

// Short scoreline for the celebration caption: "Barcelona 2-1".
function goalCaption(event) {
  if (!event) return "GOAL!"
  var score = String(event.homeScore) + "-" + String(event.awayScore)
  var team = String(event.team || "").trim()
  return team ? team + " " + score : score
}

function parseSearch(raw) {
  var parsed = parseJson(raw)
  if (!parsed.ok || !Array.isArray(parsed.value)) return []
  var teams = []
  var seen = {}
  for (var i = 0; i < parsed.value.length; i++) {
    var suggestions = (parsed.value[i] && parsed.value[i].suggestions) || []
    for (var j = 0; j < suggestions.length; j++) {
      var s = suggestions[j]
      if (!s || s.type !== "team") continue
      var id = String(s.id || "")
      if (!id || seen[id]) continue
      seen[id] = true
      teams.push({
        id: id,
        name: String(s.name || id),
        leagueId: String(s.leagueId || ""),
        leagueName: String(s.leagueName || "")
      })
    }
  }
  return teams
}

function parseTable(raw) {
  var parsed = parseJson(raw)
  if (!parsed.ok || !parsed.value) return { ok: false, error: parsed.error || "Unexpected table payload", name: "", rows: [] }
  var data = parsed.value
  var blocks = data.table
  var inner = null
  var name = (data.details && data.details.name) || ""
  if (Array.isArray(blocks) && blocks[0] && blocks[0].data) {
    inner = blocks[0].data.table
    name = blocks[0].data.leagueName || name
  } else if (blocks && blocks.data) {
    inner = blocks.data.table
    name = blocks.data.leagueName || name
  }
  var rows = []
  if (inner && Array.isArray(inner.all)) rows = inner.all
  else if (Array.isArray(inner)) rows = inner
  var out = []
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {}
    out.push({
      pos: r.idx,
      id: String(r.id || ""),
      name: String(r.shortName || r.name || ""),
      longName: String(r.name || r.shortName || ""),
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      gd: r.goalConDiff,
      pts: r.pts,
      goals: String(r.scoresStr || ""),
      qualColor: String(r.qualColor || "")
    })
  }
  return { ok: true, error: "", name: name, rows: out }
}

function eventClock(event) {
  var e = event || {}
  if (e.type === "Half") return cleanClock(e.halfStrShort || "HT")
  var base = e.timeStr !== undefined && e.timeStr !== null ? String(e.timeStr) : String(e.time || "")
  if (e.overloadTime) base = String(e.time || base) + "+" + e.overloadTime
  base = cleanClock(base)
  if (!base) return ""
  if (e.type === "Half" || /HT|FT|['+]/.test(base)) return base
  return base + "'"
}

function normalizeEvent(event) {
  var e = event || {}
  var label = ""
  if (e.type === "Goal") {
    label = String(e.nameStr || e.fullName || "")
    if (e.ownGoal) label = (label ? label + " " : "") + "OG"
    if (e.assistInput) label += " (" + e.assistInput + ")"
    if (e.suffix) label += " " + e.suffix
  } else if (e.type === "Card") {
    label = String(e.card || "Card") + " · " + String(e.nameStr || e.fullName || "")
  } else if (e.type === "Half") {
    label = String(e.halfStrShort || "HT")
  }
  return {
    type: String(e.type || ""),
    clock: eventClock(e),
    isHome: e.isHome === true,
    label: label,
    card: String(e.card || ""),
    newScore: e.newScore || null
  }
}

function topStats(data) {
  var content = data && data.content ? data.content : {}
  var periods = content.stats && content.stats.Periods
  var all = periods && (periods.All || periods.all)
  var groups = all && all.stats
  if (!groups || !groups.length) return []
  var top = groups[0].stats || []
  var out = []
  for (var i = 0; i < top.length && out.length < 8; i++) {
    var s = top[i]
    if (!s || s.type === "title" || !s.stats) continue
    out.push({
      title: String(s.title || ""),
      home: s.stats[0] === undefined || s.stats[0] === null ? "" : s.stats[0],
      away: s.stats[1] === undefined || s.stats[1] === null ? "" : s.stats[1]
    })
  }
  return out
}

function parseMatchDetails(raw) {
  var parsed = parseJson(raw)
  if (!parsed.ok || !parsed.value) return { ok: false, error: parsed.error || "Unexpected match payload", match: null }
  var data = parsed.value
  var general = data.general || {}
  var header = data.header || {}
  var teams = header.teams || []
  var homeRaw = teams[0] || general.homeTeam || {}
  var awayRaw = teams[1] || general.awayTeam || {}
  var status = header.status || {}
  var facts = (data.content && data.content.matchFacts) || {}
  var sourceEvents = (facts.events && facts.events.events) || []
  var events = []
  for (var i = 0; i < sourceEvents.length; i++) {
    var type = sourceEvents[i] && sourceEvents[i].type
    if (type === "Goal" || type === "Card" || type === "Half") events.push(normalizeEvent(sourceEvents[i]))
  }
  var state = matchState(status)
  var match = {
    id: String(general.matchId || ""),
    leagueName: String(general.leagueName || ""),
    home: {
      id: String(homeRaw.id || ""),
      name: String(homeRaw.name || ""),
      score: homeRaw.score,
      imageUrl: String(homeRaw.imageUrl || teamLogoUrl(homeRaw.id))
    },
    away: {
      id: String(awayRaw.id || ""),
      name: String(awayRaw.name || ""),
      score: awayRaw.score,
      imageUrl: String(awayRaw.imageUrl || teamLogoUrl(awayRaw.id))
    },
    utcTime: String(status.utcTime || general.matchTimeUTCDate || ""),
    started: general.started === true || status.started === true,
    finished: general.finished === true || status.finished === true,
    state: state,
    liveTimeShort: cleanClock((status.liveTime && status.liveTime.short) || ""),
    statusReason: String((status.reason && status.reason.short) || ""),
    events: events,
    stats: topStats(data)
  }
  match.clock = matchClock(match)
  match.scoreStr = scoreLabel(match)
  return { ok: true, error: "", match: match }
}

function initials(name) {
  var text = String(name || "").trim()
  if (!text) return "?"
  var parts = text.split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function choiceSetting(value, fallback, choices) {
  var current = String(value === undefined || value === null ? fallback : value)
  return choices.indexOf(current) === -1 ? fallback : current
}

// ---- Flourishes -------------------------------------------------------
// Small bits of personality. Kept here (rather than inline in QML) so the
// Node tests can pin the wording and the rotation down.

var QUIET_LINES = [
  "No whistle yet. Boots on.",
  "The pitch is empty. For now.",
  "Grass is growing. That is about it.",
  "Quiet day. Bench yourself."
]

var EMPTY_DAY_LINES = [
  "Nothing on today. The nets are getting a rest.",
  "No fixtures. Somebody had to have a day off.",
  "Empty schedule. Go outside, the grass is real out there.",
  "Not a single kickoff. Suspicious."
]

// Deterministic pick, so a binding that re-evaluates does not flicker
// through the list. Callers pass a seed that only changes with the day.
function pickLine(lines, seed) {
  if (!lines || !lines.length) return ""
  var n = Math.abs(parseInt(seed, 10) || 0)
  return lines[n % lines.length]
}

// "home" / "away" for whoever is ahead, "" for level, upcoming, or unplayed.
// Live matches count: whoever leads right now is the one wearing the net.
function winnerSide(match) {
  if (!match) return ""
  if (match.state !== "finished" && match.state !== "live") return ""
  if (!hasScore(match.home) || !hasScore(match.away)) return ""
  var home = Number(match.home.score)
  var away = Number(match.away.score)
  if (!isFinite(home) || !isFinite(away)) return ""
  if (home === away) return ""
  return home > away ? "home" : "away"
}

function dayTally(leagues) {
  var matches = flattenMatches(leagues)
  var tally = { total: matches.length, live: 0, upcoming: 0, finished: 0 }
  for (var i = 0; i < matches.length; i++) {
    var state = matches[i].state
    if (state === "live") tally.live++
    else if (state === "upcoming") tally.upcoming++
    else if (state === "finished") tally.finished++
  }
  return tally
}

function plural(count, one, many) {
  return count === 1 ? one : String(count) + " " + many
}

function heroLine(opts) {
  var o = opts || {}
  if (o.error) return String(o.error)
  if (o.refreshing) return "Chasing the ball\u2026"
  var live = Math.max(0, parseInt(o.liveCount, 10) || 0)
  if (live === 1) return "One match live. Stay with it."
  if (live > 1) return String(live) + " matches live right now."
  var upcoming = Math.max(0, parseInt(o.upcomingCount, 10) || 0)
  if (upcoming > 0) return plural(upcoming, "One kickoff", "kickoffs") + " still to come."
  var finished = Math.max(0, parseInt(o.finishedCount, 10) || 0)
  if (finished > 0) return plural(finished, "One match", "matches") + " done and dusted."
  return pickLine(QUIET_LINES, o.seed)
}

function emptyDayLine(seed) {
  return pickLine(EMPTY_DAY_LINES, seed)
}

if (typeof module !== "undefined") {
  module.exports = {
    API_BASE: API_BASE,
    SOCCER_GLYPH: SOCCER_GLYPH,
    BALL_GLYPH: BALL_GLYPH,
    NET_GLYPH: NET_GLYPH,
    APP_NAME: APP_NAME,
    DEFAULT_FEATURED_IDS: DEFAULT_FEATURED_IDS,
    FEATURED_LEAGUES: FEATURED_LEAGUES,
    pad2: pad2,
    dateKeyFromDate: dateKeyFromDate,
    parseDateKey: parseDateKey,
    shiftDateKey: shiftDateKey,
    dateHeading: dateHeading,
    matchesUrl: matchesUrl,
    matchDetailsUrl: matchDetailsUrl,
    leagueUrl: leagueUrl,
    searchUrl: searchUrl,
    teamLogoUrl: teamLogoUrl,
    leagueLogoUrl: leagueLogoUrl,
    matchPageUrl: matchPageUrl,
    curlCommand: curlCommand,
    openMatchCommand: openMatchCommand,
    notificationText: notificationText,
    toastCommand: toastCommand,
    replaceableToastId: replaceableToastId,
    parseJson: parseJson,
    parseMatches: parseMatches,
    normalizeMatch: normalizeMatch,
    flattenMatches: flattenMatches,
    parseIdList: parseIdList,
    arrayLike: arrayLike,
    featuredIds: featuredIds,
    isFollowed: isFollowed,
    toggleFollowed: toggleFollowed,
    involvedFollowed: involvedFollowed,
    filterLeagues: filterLeagues,
    pinFollowed: pinFollowed,
    compareMatches: compareMatches,
    matchOrderRank: matchOrderRank,
    PINNED_LEAGUE_ID: PINNED_LEAGUE_ID,
    followingMatches: followingMatches,
    liveMatches: liveMatches,
    matchClock: matchClock,
    hasScore: hasScore,
    scoreLabel: scoreLabel,
    compactScore: compactScore,
    barHeadline: barHeadline,
    scoreSnapshot: scoreSnapshot,
    goalEvents: goalEvents,
    scanGoals: scanGoals,
    celebrationEvents: celebrationEvents,
    celebrationLine: celebrationLine,
    goalCaption: goalCaption,
    demoGoalEvent: demoGoalEvent,
    parseSearch: parseSearch,
    parseTable: parseTable,
    parseMatchDetails: parseMatchDetails,
    normalizeEvent: normalizeEvent,
    initials: initials,
    choiceSetting: choiceSetting,
    pickLine: pickLine,
    winnerSide: winnerSide,
    dayTally: dayTally,
    heroLine: heroLine,
    emptyDayLine: emptyDayLine,
    kickoffLabel: kickoffLabel,
    cleanClock: cleanClock,
    matchState: matchState
  }
}
