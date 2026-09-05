import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// One engine per shell. Every bar — one per monitor — reads this instance
// so the score feed is polled once, and goal toasts fire once.
Item {
  id: root

  property var shell: null
  property var settings: ({})
  property bool active: true

  property var leagues: []
  property string dateKey: Model.dateKeyFromDate(new Date())
  property string todayKey: Model.dateKeyFromDate(new Date())
  property bool refreshing: false
  property bool refreshPending: false
  property string lastError: ""
  property date lastUpdated: new Date(0)

  property var matchDetail: null
  property bool detailLoading: false
  property string detailError: ""

  property var table: ({ name: "", rows: [] })
  property string tableLeagueId: "47"
  property bool tableLoading: false
  property string tableError: ""

  // Fired for every goal the bar should celebrate. Distinct from the toast
  // path: toasts stay followed-clubs-only, this follows whatever the bar is
  // actually showing.
  signal goalScored(var event)

  // matchId -> timestamp, so a row that just scored can flash in the panel.
  property var goalFlashIds: ({})

  property var searchResults: []
  property string searchQuery: ""
  property bool searchLoading: false

  property var _previousScores: null
  property var _toastQueue: []
  property string _matchesOutput: ""
  property string _detailOutput: ""
  property string _tableOutput: ""
  property string _searchOutput: ""
  property string _toastOutput: ""

  readonly property var followedTeams: Model.parseIdList(setting("followedTeams", []))
  readonly property var featuredLeagueIds: Model.featuredIds(setting("featuredLeagueIds", []))
  readonly property bool notify: setting("notify", true) === true
  readonly property string matchesFilter: Model.choiceSetting(setting("matchesFilter", "featured"), "featured", ["featured", "all"])
  readonly property var visibleLeagues: Model.pinFollowed(
    Model.filterLeagues(leagues, featuredLeagueIds, followedTeams, matchesFilter), followedTeams)
  readonly property var followedMatches: Model.followingMatches(leagues, followedTeams)
  readonly property var live: Model.liveMatches(leagues)
  readonly property int liveCount: live.length
  readonly property var headline: Model.barHeadline(leagues, followedTeams)
  readonly property string barText: headline.text
  readonly property bool barLive: headline.live === true
  readonly property int pollMs: liveCount > 0 ? 20000 : 180000

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function refreshMatches() {
    if (!active) return
    if (matchesProcess.running) {
      refreshPending = true
      return
    }
    refreshing = true
    lastError = ""
    todayKey = Model.dateKeyFromDate(new Date())
    _matchesOutput = ""
    matchesProcess.command = Model.curlCommand(Model.matchesUrl(dateKey), 15)
    matchesProcess.running = true
  }

  function setDateKey(key) {
    var next = String(key || Model.dateKeyFromDate(new Date()))
    if (next === dateKey) {
      refreshMatches()
      return
    }
    dateKey = next
    refreshMatches()
  }

  function shiftDate(days) {
    setDateKey(Model.shiftDateKey(dateKey, days))
  }

  function jumpToday() {
    setDateKey(Model.dateKeyFromDate(new Date()))
  }

  function refreshIfStale() {
    var stale = liveCount > 0 ? 15000 : 60000
    if (Date.now() - lastUpdated.getTime() > stale) refreshMatches()
  }

  function applyMatches(raw) {
    var parsed = Model.parseMatches(raw)
    if (!parsed.ok) {
      lastError = parsed.error || "Could not read matches"
      refreshing = false
      return
    }
    var current = Model.scoreSnapshot(parsed.leagues)
    if (_previousScores) {
      if (notify)
        enqueueToasts(Model.goalEvents(_previousScores, current, followedTeams))
      var celebrations = Model.celebrationEvents(_previousScores, current, followedTeams)
      for (var c = 0; c < celebrations.length; c++) noteGoal(celebrations[c])
    }
    _previousScores = current
    leagues = parsed.leagues
    lastUpdated = new Date()
    lastError = ""
    refreshing = false
    if (refreshPending) {
      refreshPending = false
      Qt.callLater(refreshMatches)
    }
  }

  function loadMatch(matchId) {
    var id = String(matchId || "")
    if (!id) return
    detailLoading = true
    detailError = ""
    matchDetail = matchDetail && String(matchDetail.id) === id ? matchDetail : null
    _detailOutput = ""
    detailsProcess.command = Model.curlCommand(Model.matchDetailsUrl(id), 15)
    detailsProcess.running = true
  }

  function applyDetails(raw) {
    var parsed = Model.parseMatchDetails(raw)
    detailLoading = false
    if (!parsed.ok || !parsed.match) {
      detailError = parsed.error || "Could not read match"
      return
    }
    matchDetail = parsed.match
    detailError = ""
  }

  function loadTable(leagueId) {
    var id = String(leagueId || tableLeagueId || "47")
    tableLeagueId = id
    tableLoading = true
    tableError = ""
    _tableOutput = ""
    tableProcess.command = Model.curlCommand(Model.leagueUrl(id), 18)
    tableProcess.running = true
  }

  function applyTable(raw) {
    var parsed = Model.parseTable(raw)
    tableLoading = false
    if (!parsed.ok) {
      tableError = parsed.error || "Could not read table"
      return
    }
    table = parsed
    tableError = ""
  }

  function requestSearch(term) {
    searchQuery = String(term || "")
    if (searchQuery.replace(/^\s+|\s+$/g, "").length < 2) {
      searchResults = []
      searchLoading = false
      searchDebounce.stop()
      return
    }
    searchDebounce.restart()
  }

  function runSearch() {
    var term = String(searchQuery || "").replace(/^\s+|\s+$/g, "")
    if (term.length < 2) {
      searchResults = []
      searchLoading = false
      return
    }
    searchLoading = true
    _searchOutput = ""
    searchProcess.command = Model.curlCommand(Model.searchUrl(term), 8)
    searchProcess.running = true
  }

  function applySearch(raw) {
    searchLoading = false
    searchResults = Model.parseSearch(raw)
  }

  function enqueueToasts(events) {
    if (!events || !events.length) return
    _toastQueue = _toastQueue.concat(events)
    if (!toastProcess.running) sendNextToast()
  }

  function sendNextToast() {
    if (!active || !notify || toastProcess.running || _toastQueue.length === 0) return
    var event = _toastQueue[0]
    _toastQueue = _toastQueue.slice(1)
    _toastOutput = ""
    toastProcess.command = Model.toastCommand(event.headline, event.description, 0)
    toastProcess.running = true
  }

  function noteGoal(event) {
    if (!event) return
    var flags = {}
    for (var key in goalFlashIds) flags[key] = goalFlashIds[key]
    flags[String(event.matchId)] = Date.now()
    goalFlashIds = flags
    goalFlashTimer.start()
    goalScored(event)
  }

  // Demo hook. Runs the real goal path — flash map, signal, bar animation —
  // against the first match on screen, so nothing about it is a special case.
  function demoGoal() {
    var matches = Model.flattenMatches(visibleLeagues)
    var event = Model.demoGoalEvent(matches.length ? matches[0] : null)
    if (event) noteGoal(event)
  }

  function justScored(matchId) {
    return goalFlashIds[String(matchId || "")] !== undefined
  }

  Timer {
    id: goalFlashTimer
    interval: 5000
    repeat: true
    onTriggered: {
      var now = Date.now()
      var next = {}
      var any = false
      for (var key in root.goalFlashIds) {
        if (now - Number(root.goalFlashIds[key]) < 30000) {
          next[key] = root.goalFlashIds[key]
          any = true
        }
      }
      root.goalFlashIds = next
      if (!any) stop()
    }
  }

  function openMatch(matchId) {
    Quickshell.execDetached(Model.openMatchCommand(matchId))
  }

  Process {
    id: matchesProcess
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._matchesOutput = text
    }
    onExited: function(code) {
      if (code !== 0) {
        root.lastError = "Could not reach the score feed"
        root.refreshing = false
        if (root.refreshPending) {
          root.refreshPending = false
          Qt.callLater(root.refreshMatches)
        }
        return
      }
      root.applyMatches(root._matchesOutput)
    }
  }

  Process {
    id: detailsProcess
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._detailOutput = text
    }
    onExited: function(code) {
      if (code !== 0) {
        root.detailLoading = false
        root.detailError = "Could not reach the score feed"
        return
      }
      root.applyDetails(root._detailOutput)
    }
  }

  Process {
    id: tableProcess
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._tableOutput = text
    }
    onExited: function(code) {
      if (code !== 0) {
        root.tableLoading = false
        root.tableError = "Could not reach the score feed"
        return
      }
      root.applyTable(root._tableOutput)
    }
  }

  Process {
    id: searchProcess
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._searchOutput = text
    }
    onExited: function(code) {
      if (code !== 0) {
        root.searchLoading = false
        root.searchResults = []
        return
      }
      root.applySearch(root._searchOutput)
    }
  }

  Process {
    id: toastProcess
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._toastOutput = text
    }
    onExited: function() { Qt.callLater(root.sendNextToast) }
  }

  Timer {
    id: searchDebounce
    interval: 280
    onTriggered: root.runSearch()
  }

  Timer {
    interval: root.pollMs
    running: root.active
    repeat: true
    triggeredOnStart: true
    onTriggered: {
      root.todayKey = Model.dateKeyFromDate(new Date())
      if (root.dateKey === root.todayKey) root.refreshMatches()
      else if (root.liveCount === 0) root.refreshMatches()
    }
  }

  // Roll the selected day over at local midnight while the panel sits on Today.
  Timer {
    interval: 30000
    running: root.active
    repeat: true
    onTriggered: {
      var today = Model.dateKeyFromDate(new Date())
      if (root.todayKey === today) return
      var wasToday = root.dateKey === root.todayKey
      root.todayKey = today
      if (wasToday) root.setDateKey(today)
    }
  }
}
