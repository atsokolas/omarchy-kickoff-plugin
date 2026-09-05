import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "atsokolas.kickoff"
  ipcTarget: "atsokolas.kickoff"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property bool openedFromHotkey: false
  property string tab: "matches"
  property string page: "list"
  property string selectedMatchId: ""
  property int selectedIndex: 0
  property bool cursorActive: false

  readonly property var barIdentity: hostWidget || root
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  property string emojiFamily: "Noto Color Emoji"

  // Content settles in behind the panel frame each time it opens. Driven by
  // `opened` rather than by content, so a background refresh never re-runs it.
  property real reveal: 1

  NumberAnimation {
    id: revealAnimation
    target: root
    property: "reveal"
    from: 0
    to: 1
    duration: 260
    easing.type: Easing.OutCubic
  }

  readonly property var sharedService: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(moduleName) : null
  readonly property var service: sharedService || localService
  readonly property string label: service.barText
  readonly property bool live: service.barLive

  // Relayed to the bar widget, which owns the ball-into-net animation.
  signal goalScored(var event)

  Connections {
    target: root.service
    ignoreUnknownSignals: true
    function onGoalScored(event) { root.goalScored(event) }
  }

  readonly property var featuredLeagues: Model.FEATURED_LEAGUES
  readonly property var dayTally: Model.dayTally(service.visibleLeagues)
  readonly property var cursorMatches: {
    if (tab === "following") return service.followedMatches
    var leagues = service.visibleLeagues
    var out = []
    for (var i = 0; i < leagues.length; i++) {
      var matches = leagues[i].matches || []
      for (var j = 0; j < matches.length; j++) out.push(matches[j])
    }
    return out
  }

  function pushSettings() { if (service) service.settings = settings }
  onSettingsChanged: pushSettings()
  onServiceChanged: pushSettings()
  Component.onCompleted: pushSettings()

  function persistSettings(values) {
    var entry = { id: root.moduleName }
    for (var existing in root.settings) if (existing !== "id") entry[existing] = root.settings[existing]
    for (var key in values) {
      if (values[key] === undefined) delete entry[key]
      else entry[key] = values[key]
    }
    root.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
    pushSettings()
  }

  function open() {
    openedFromHotkey = false
    setCenterHoverRevealSuppressed(false)
    root.controller.show()
    service.refreshIfStale()
  }

  function openFromHotkey() {
    openedFromHotkey = true
    root.controller.show()
    service.refreshIfStale()
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  function refresh() { service.refreshMatches() }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  function setTab(value) {
    tab = String(value || "matches")
    selectedIndex = 0
    cursorActive = false
    if (listFlick) listFlick.contentY = 0
    if (tab === "table" && (!service.table.rows || service.table.rows.length === 0))
      service.loadTable(service.tableLeagueId)
  }

  function showSettings() {
    page = "settings"
    if (settingsFlick) settingsFlick.contentY = 0
  }

  function showList() {
    page = "list"
  }

  function openMatch(match) {
    if (!match || !match.id) return
    selectedMatchId = String(match.id)
    page = "match"
    service.loadMatch(match.id)
    if (detailFlick) detailFlick.contentY = 0
  }

  function followTeam(team) {
    persistSettings({ followedTeams: Model.toggleFollowed(service.followedTeams, team) })
  }

  function toggleNotify() {
    persistSettings({ notify: !service.notify })
  }

  function toggleAllCompetitions() {
    persistSettings({ matchesFilter: service.matchesFilter === "all" ? "featured" : "all" })
  }

  function moveSelection(delta) {
    if (page !== "list" || tab === "table") return
    var matches = cursorMatches
    if (!matches.length) return
    if (!cursorActive) {
      selectedIndex = 0
      cursorActive = true
      selectedMatchId = String(matches[0].id)
      return
    }
    selectedIndex = Math.max(0, Math.min(matches.length - 1, selectedIndex + delta))
    selectedMatchId = String(matches[selectedIndex].id)
    cursorActive = true
  }

  function activateSelection() {
    if (page === "match") {
      service.openMatch(selectedMatchId)
      return
    }
    if (page !== "list" || tab === "table") return
    var matches = cursorMatches
    if (!matches.length) return
    var index = cursorActive ? selectedIndex : 0
    if (index < 0 || index >= matches.length) return
    openMatch(matches[index])
  }

  function handleClose() {
    if (page === "settings" || page === "match") showList()
    else root.close()
  }

  function handleMove(dx, dy) {
    if (page !== "list") return
    if (dx !== 0 && tab === "matches") service.shiftDate(dx)
    else if (dy !== 0) moveSelection(dy)
  }

  onOpenedChanged: {
    if (!opened) {
      page = "list"
      return
    }
    cursorActive = false
    revealAnimation.restart()
    service.refreshIfStale()
    Qt.callLater(function() { if (keyCatcher) keyCatcher.forceActiveFocus() })
  }

  Service {
    id: localService
    active: root.sharedService === null
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(470))
    contentHeight: panel.fittedContentHeight(Style.space(560), Style.space(640))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: root.page === "settings"
      onMoveRequested: function(dx, dy) { root.handleMove(dx, dy) }
      onActivateRequested: root.activateSelection()
      onCloseRequested: root.handleClose()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        if (text === "r" || text === "R") root.refresh()
        else if (text === "s" || text === "S") root.page === "settings" ? root.showList() : root.showSettings()
        else if (text === "n" || text === "N") root.toggleNotify()
        else if (text === "t" || text === "T") service.jumpToday()
        else if (text === "1") root.setTab("matches")
        else if (text === "2") root.setTab("following")
        else if (text === "3") root.setTab("table")
      }

      ColumnLayout {
        anchors.fill: parent
        spacing: Style.space(10)
        opacity: root.reveal
        transform: Translate { y: (1 - root.reveal) * Style.space(7) }

        // ---- Header
        Item {
          Layout.fillWidth: true
          implicitHeight: Math.max(heroIcon.height, heroLabels.height, headerButtons.height)

          KickoffIcon {
            id: heroIcon
            lively: root.live
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            iconSize: Style.font.display
            iconColor: root.live ? Color.accent : root.foreground
          }

          Column {
            id: heroLabels
            anchors.left: heroIcon.right
            anchors.leftMargin: Style.space(12)
            anchors.right: headerButtons.left
            anchors.rightMargin: Style.space(8)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Text {
              text: root.page === "match" && service.matchDetail ? service.matchDetail.leagueName : Model.APP_NAME
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
              elide: Text.ElideRight
              width: parent.width
            }

            Text {
              width: parent.width
              text: Model.heroLine({
                error: service.lastError,
                refreshing: service.refreshing,
                liveCount: root.dayTally.live,
                upcomingCount: root.dayTally.upcoming,
                finishedCount: root.dayTally.finished,
                seed: service.dateKey
              })
              color: service.lastError !== "" ? Color.urgent : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              elide: Text.ElideRight
            }
          }

          Row {
            id: headerButtons
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            PanelActionButton {
              visible: root.page !== "list"
              iconText: "󰁍"
              tooltipText: "Back"
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.showList()
            }

            PanelActionButton {
              visible: root.page === "list"
              iconText: "󰒓"
              tooltipText: "Settings"
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.showSettings()
            }

            PanelActionButton {
              id: refreshButton
              iconText: service.refreshing ? "󰑓" : "󰑐"
              tooltipText: "Refresh"
              foreground: root.foreground
              fontFamily: root.fontFamily
              enabled: !service.refreshing
              onClicked: root.refresh()

              RotationAnimation on rotation {
                running: service.refreshing
                loops: Animation.Infinite
                from: 0
                to: 360
                duration: 900
                onRunningChanged: if (!running) refreshButton.rotation = 0
              }
            }
          }
        }

        PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

        // ---- Date + tabs (list page)
        Column {
          Layout.fillWidth: true
          spacing: Style.space(8)
          visible: root.page === "list"

          RowLayout {
            width: parent.width
            visible: root.tab !== "table"
            spacing: Style.space(4)

            PanelActionButton {
              iconText: "󰅁"
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: service.shiftDate(-1)
            }

            Item {
              Layout.fillWidth: true
              Layout.preferredHeight: Style.space(22)

              Text {
                anchors.centerIn: parent
                text: Model.dateHeading(service.dateKey, service.todayKey)
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true

                TapHandler { onTapped: service.jumpToday() }
                HoverHandler { cursorShape: Qt.PointingHandCursor }
              }
            }

            PanelActionButton {
              iconText: "󰅂"
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: service.shiftDate(1)
            }
          }

          RowLayout {
            width: parent.width
            spacing: Style.space(2)

            Button {
              text: "MATCHES"
              selected: root.tab === "matches"
              foreground: root.foreground
              background: "transparent"
              accent: Color.accent
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              horizontalPadding: Style.space(7)
              verticalPadding: Style.space(1)
              onClicked: root.setTab("matches")
            }

            Button {
              text: "FOLLOWING"
              selected: root.tab === "following"
              foreground: root.foreground
              background: "transparent"
              accent: Color.accent
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              horizontalPadding: Style.space(7)
              verticalPadding: Style.space(1)
              onClicked: root.setTab("following")
            }

            Button {
              text: "TABLE"
              selected: root.tab === "table"
              foreground: root.foreground
              background: "transparent"
              accent: Color.accent
              fontFamily: root.fontFamily
              fontSize: Style.font.caption
              horizontalPadding: Style.space(7)
              verticalPadding: Style.space(1)
              onClicked: root.setTab("table")
            }

            Item { Layout.fillWidth: true }
          }
        }

        // ---- Pages
        Flickable {
          id: listFlick
          Layout.fillWidth: true
          Layout.fillHeight: true
          visible: root.page === "list"
          clip: true
          contentWidth: width
          contentHeight: listColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          Column {
            id: listColumn
            width: listFlick.width
            spacing: Style.space(10)

            Column {
              visible: root.tab === "matches" && service.visibleLeagues.length === 0 && !service.refreshing
              width: parent.width
              spacing: Style.space(10)

              // Nothing to report, so the ball rolls itself around instead.
              Item {
                id: idleTrack
                width: parent.width
                height: Style.space(24)

                Text {
                  id: idleBall
                  text: Model.BALL_GLYPH
                  font.family: root.emojiFamily
                  font.pixelSize: Style.font.body
                  y: (idleTrack.height - height) / 2
                  transformOrigin: Item.Center

                  SequentialAnimation {
                    running: idleTrack.visible
                    loops: Animation.Infinite

                    ParallelAnimation {
                      NumberAnimation {
                        target: idleBall; property: "x"
                        from: 0; to: Math.max(0, idleTrack.width - idleBall.width)
                        duration: 2800; easing.type: Easing.InOutSine
                      }
                      NumberAnimation {
                        target: idleBall; property: "rotation"
                        from: 0; to: 540
                        duration: 2800; easing.type: Easing.InOutSine
                      }
                    }

                    ParallelAnimation {
                      NumberAnimation {
                        target: idleBall; property: "x"; to: 0
                        duration: 2800; easing.type: Easing.InOutSine
                      }
                      NumberAnimation {
                        target: idleBall; property: "rotation"; to: 0
                        duration: 2800; easing.type: Easing.InOutSine
                      }
                    }
                  }
                }
              }

              Text {
                width: parent.width
                text: Model.emptyDayLine(service.dateKey)
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                wrapMode: Text.WordWrap
              }
            }

            Repeater {
              model: root.tab === "matches" ? service.visibleLeagues : []
              delegate: Column {
                id: leagueBlock
                required property var modelData
                readonly property var league: modelData
                width: listColumn.width
                spacing: Style.space(6)

                Row {
                  width: parent.width
                  spacing: Style.space(8)

                  Image {
                    width: Style.space(16)
                    height: Style.space(16)
                    anchors.verticalCenter: parent.verticalCenter
                    source: Model.leagueLogoUrl(leagueBlock.league.id)
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    visible: status === Image.Ready
                  }

                  Text {
                    text: leagueBlock.league.name
                    // The pinned group earns the accent; competitions stay grey.
                    color: leagueBlock.league.pinned ? Color.accent : root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    font.letterSpacing: 0.6
                    anchors.verticalCenter: parent.verticalCenter
                  }

                  Item { width: Style.space(4); height: 1 }

                  Text {
                    text: leagueBlock.league.country
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    anchors.verticalCenter: parent.verticalCenter
                  }
                }

                Repeater {
                  model: leagueBlock.league.matches
                  delegate: MatchRow {
                    required property var modelData
                    width: leagueBlock.width
                    match: modelData
                    selected: root.selectedMatchId === String(modelData.id)
                    foreground: root.foreground
                    dim: root.dim
                    accent: Color.accent
                    fontFamily: root.fontFamily
                    goalFlashIds: service.goalFlashIds
                    showCompetition: leagueBlock.league.pinned === true
                    onClicked: root.openMatch(modelData)
                  }
                }
              }
            }

            Text {
              visible: root.tab === "following" && service.followedTeams.length === 0
              width: parent.width
              text: "Follow clubs in Settings to pin their matches here and get goal notifications."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
            }

            Text {
              visible: root.tab === "following" && service.followedTeams.length > 0 && service.followedMatches.length === 0
              width: parent.width
              text: "None of your teams play on this date."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
            }

            Repeater {
              model: root.tab === "following" ? service.followedMatches : []
              delegate: MatchRow {
                required property var modelData
                width: listColumn.width
                match: modelData
                selected: root.selectedMatchId === String(modelData.id)
                foreground: root.foreground
                dim: root.dim
                accent: Color.accent
                fontFamily: root.fontFamily
                goalFlashIds: service.goalFlashIds
                onClicked: root.openMatch(modelData)
              }
            }

            Column {
              visible: root.tab === "table"
              width: parent.width
              spacing: Style.space(8)

              Flickable {
                width: parent.width
                height: Style.space(28)
                clip: true
                contentWidth: leagueChips.implicitWidth
                contentHeight: height
                flickableDirection: Flickable.HorizontalFlick
                boundsBehavior: Flickable.StopAtBounds

                Row {
                  id: leagueChips
                  spacing: Style.space(4)
                  height: parent.height

                  Repeater {
                    model: root.featuredLeagues
                    delegate: Button {
                      required property var modelData
                      text: modelData.name
                      selected: String(service.tableLeagueId) === String(modelData.id)
                      foreground: root.foreground
                      background: "transparent"
                      accent: Color.accent
                      fontFamily: root.fontFamily
                      fontSize: Style.font.caption
                      horizontalPadding: Style.space(8)
                      verticalPadding: Style.space(1)
                      onClicked: service.loadTable(modelData.id)
                    }
                  }
                }
              }

              Text {
                visible: service.tableLoading
                text: "Loading table…"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }

              Text {
                visible: service.tableError !== ""
                text: service.tableError
                color: Color.urgent
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                wrapMode: Text.WordWrap
                width: parent.width
              }

              Row {
                width: parent.width
                visible: service.table.rows && service.table.rows.length > 0
                spacing: Style.space(8)

                Text { width: Style.space(22); text: "#"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption; font.bold: true }
                Text { width: parent.width - Style.space(148); text: "CLUB"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption; font.bold: true }
                Text { width: Style.space(28); text: "P"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption; font.bold: true; horizontalAlignment: Text.AlignRight }
                Text { width: Style.space(36); text: "GD"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption; font.bold: true; horizontalAlignment: Text.AlignRight }
                Text { width: Style.space(36); text: "PTS"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption; font.bold: true; horizontalAlignment: Text.AlignRight }
              }

              Repeater {
                model: root.tab === "table" ? (service.table.rows || []) : []
                delegate: Row {
                  required property var modelData
                  width: listColumn.width
                  height: Style.space(26)
                  spacing: Style.space(8)

                  Rectangle {
                    width: Style.space(3)
                    height: parent.height - Style.space(8)
                    anchors.verticalCenter: parent.verticalCenter
                    color: modelData.qualColor || "transparent"
                    radius: 1
                  }

                  Text {
                    width: Style.space(18)
                    text: String(modelData.pos)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    anchors.verticalCenter: parent.verticalCenter
                  }

                  Text {
                    width: parent.width - Style.space(154)
                    text: modelData.name
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    elide: Text.ElideRight
                    anchors.verticalCenter: parent.verticalCenter
                  }

                  Text {
                    width: Style.space(28)
                    text: String(modelData.played)
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    horizontalAlignment: Text.AlignRight
                    anchors.verticalCenter: parent.verticalCenter
                  }

                  Text {
                    width: Style.space(36)
                    text: (Number(modelData.gd) > 0 ? "+" : "") + String(modelData.gd)
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    horizontalAlignment: Text.AlignRight
                    anchors.verticalCenter: parent.verticalCenter
                  }

                  Text {
                    width: Style.space(36)
                    text: String(modelData.pts)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    horizontalAlignment: Text.AlignRight
                    anchors.verticalCenter: parent.verticalCenter
                  }
                }
              }
            }
          }
        }

        Flickable {
          id: detailFlick
          Layout.fillWidth: true
          Layout.fillHeight: true
          visible: root.page === "match"
          clip: true
          contentWidth: width
          contentHeight: detailColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          Column {
            id: detailColumn
            width: detailFlick.width
            spacing: Style.space(14)

            Text {
              visible: service.detailLoading && !service.matchDetail
              text: "Loading match…"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }

            Text {
              visible: service.detailError !== ""
              text: service.detailError
              color: Color.urgent
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
              width: parent.width
            }

            Column {
              visible: service.matchDetail !== null
              width: parent.width
              spacing: Style.space(12)

              Row {
                width: parent.width
                spacing: Style.space(10)

                Column {
                  width: (parent.width - Style.space(90)) / 2
                  spacing: Style.space(6)

                  Image {
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Style.space(36)
                    height: Style.space(36)
                    source: service.matchDetail ? service.matchDetail.home.imageUrl : ""
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                  }

                  Text {
                    width: parent.width
                    text: service.matchDetail ? service.matchDetail.home.name : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.WordWrap
                  }
                }

                Column {
                  width: Style.space(70)
                  anchors.verticalCenter: parent.verticalCenter
                  spacing: Style.space(2)

                  Text {
                    width: parent.width
                    text: service.matchDetail ? Model.scoreLabel(service.matchDetail) : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.heading
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                  }

                  Text {
                    width: parent.width
                    text: service.matchDetail ? service.matchDetail.clock : ""
                    color: service.matchDetail && service.matchDetail.state === "live" ? Color.accent : root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                  }
                }

                Column {
                  width: (parent.width - Style.space(90)) / 2
                  spacing: Style.space(6)

                  Image {
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Style.space(36)
                    height: Style.space(36)
                    source: service.matchDetail ? service.matchDetail.away.imageUrl : ""
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                  }

                  Text {
                    width: parent.width
                    text: service.matchDetail ? service.matchDetail.away.name : ""
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.WordWrap
                  }
                }
              }

              Row {
                spacing: Style.space(8)
                anchors.horizontalCenter: parent.horizontalCenter

                Button {
                  visible: service.matchDetail !== null
                  text: service.matchDetail && Model.isFollowed(service.followedTeams, service.matchDetail.home.id) ? "FOLLOWING HOME" : "FOLLOW HOME"
                  selected: service.matchDetail && Model.isFollowed(service.followedTeams, service.matchDetail.home.id)
                  foreground: root.foreground
                  background: "transparent"
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.caption
                  horizontalPadding: Style.space(8)
                  verticalPadding: Style.space(1)
                  onClicked: if (service.matchDetail) root.followTeam(service.matchDetail.home)
                }

                Button {
                  visible: service.matchDetail !== null
                  text: service.matchDetail && Model.isFollowed(service.followedTeams, service.matchDetail.away.id) ? "FOLLOWING AWAY" : "FOLLOW AWAY"
                  selected: service.matchDetail && Model.isFollowed(service.followedTeams, service.matchDetail.away.id)
                  foreground: root.foreground
                  background: "transparent"
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.caption
                  horizontalPadding: Style.space(8)
                  verticalPadding: Style.space(1)
                  onClicked: if (service.matchDetail) root.followTeam(service.matchDetail.away)
                }
              }

              PanelSeparator { foreground: root.foreground }

              Repeater {
                model: service.matchDetail ? service.matchDetail.events : []
                delegate: Row {
                  required property var modelData
                  width: detailColumn.width
                  spacing: Style.space(10)

                  Text {
                    width: Style.space(40)
                    text: modelData.clock
                    color: modelData.type === "Goal" ? Color.accent : root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: modelData.type === "Goal"
                  }

                  Text {
                    width: parent.width - Style.space(50)
                    text: (modelData.type === "Goal" ? "⚽ " : (modelData.card === "Yellow" ? "■ " : (modelData.card === "Red" ? "■ " : ""))) + modelData.label
                    color: modelData.isHome ? root.foreground : root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    wrapMode: Text.WordWrap
                  }
                }
              }

              Repeater {
                model: service.matchDetail ? service.matchDetail.stats : []
                delegate: Row {
                  required property var modelData
                  width: detailColumn.width
                  spacing: Style.space(8)

                  Text {
                    width: Style.space(48)
                    text: String(modelData.home)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                    horizontalAlignment: Text.AlignRight
                  }

                  Text {
                    width: parent.width - Style.space(104)
                    text: modelData.title
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    horizontalAlignment: Text.AlignHCenter
                    elide: Text.ElideRight
                  }

                  Text {
                    width: Style.space(48)
                    text: String(modelData.away)
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                  }
                }
              }

              Button {
                text: "OPEN MATCH"
                foreground: root.foreground
                background: "transparent"
                accent: Color.accent
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                horizontalPadding: Style.space(8)
                verticalPadding: Style.space(1)
                onClicked: service.openMatch(root.selectedMatchId)
              }
            }
          }
        }

        Flickable {
          id: settingsFlick
          Layout.fillWidth: true
          Layout.fillHeight: true
          visible: root.page === "settings"
          clip: true
          contentWidth: width
          contentHeight: settingsColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          Column {
            id: settingsColumn
            width: settingsFlick.width
            spacing: Style.space(12)

            Toggle {
              width: parent.width
              label: "Goal notifications"
              description: "Toast when a followed club scores."
              checked: service.notify
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              onClicked: root.toggleNotify()
            }

            Toggle {
              width: parent.width
              label: "All competitions"
              description: "Show every league on Matches, not just the featured set."
              checked: service.matchesFilter === "all"
              foreground: root.foreground
              accent: Color.accent
              fontFamily: root.fontFamily
              onClicked: root.toggleAllCompetitions()
            }

            PanelSectionHeader {
              text: "FOLLOW TEAMS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            TextField {
              id: searchField
              width: parent.width
              placeholderText: "Search clubs"
              foreground: root.foreground
              font.family: root.fontFamily
              onTextChanged: service.requestSearch(text)
              Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) {
                  root.showList()
                  event.accepted = true
                }
              }
            }

            Repeater {
              model: service.searchResults
              delegate: Row {
                required property var modelData
                width: settingsColumn.width
                height: Style.space(32)
                spacing: Style.space(8)

                Image {
                  width: Style.space(18)
                  height: Style.space(18)
                  anchors.verticalCenter: parent.verticalCenter
                  source: Model.teamLogoUrl(modelData.id)
                  fillMode: Image.PreserveAspectFit
                  asynchronous: true
                }

                Column {
                  width: parent.width - Style.space(110)
                  anchors.verticalCenter: parent.verticalCenter
                  Text {
                    width: parent.width
                    text: modelData.name
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    elide: Text.ElideRight
                  }
                  Text {
                    width: parent.width
                    text: modelData.leagueName
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                  }
                }

                Button {
                  anchors.verticalCenter: parent.verticalCenter
                  text: Model.isFollowed(service.followedTeams, modelData.id) ? "FOLLOWING" : "FOLLOW"
                  selected: Model.isFollowed(service.followedTeams, modelData.id)
                  foreground: root.foreground
                  background: "transparent"
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.caption
                  horizontalPadding: Style.space(8)
                  verticalPadding: Style.space(1)
                  onClicked: root.followTeam(modelData)
                }
              }
            }

            Repeater {
              model: service.followedTeams
              delegate: Row {
                required property var modelData
                width: settingsColumn.width
                height: Style.space(28)
                spacing: Style.space(8)

                Image {
                  width: Style.space(16)
                  height: Style.space(16)
                  anchors.verticalCenter: parent.verticalCenter
                  source: Model.teamLogoUrl(modelData.id)
                  fillMode: Image.PreserveAspectFit
                  asynchronous: true
                }

                Text {
                  width: parent.width - Style.space(90)
                  text: modelData.name
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  elide: Text.ElideRight
                  anchors.verticalCenter: parent.verticalCenter
                }

                Button {
                  anchors.verticalCenter: parent.verticalCenter
                  text: "REMOVE"
                  foreground: root.foreground
                  background: "transparent"
                  accent: Color.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.caption
                  horizontalPadding: Style.space(8)
                  verticalPadding: Style.space(1)
                  onClicked: root.followTeam(modelData)
                }
              }
            }

            Text {
              width: parent.width
              text: "Left-click the bar for scores, right-click to refresh. ⚽ marks a live game, 🥅 sits with whoever is ahead. Keys: 1/2/3 tabs, h/l dates, j/k matches, s settings, n notifications, t today."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }
          }
        }
      }
    }
  }
}
