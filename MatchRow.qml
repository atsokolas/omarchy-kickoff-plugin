import QtQuick
import qs.Commons
import "Model.js" as Model

Item {
  id: root

  property var match: null
  property bool selected: false
  property color foreground: Color.foreground
  property color dim: Qt.darker(foreground, 1.55)
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property string emojiFamily: "Noto Color Emoji"
  // matchId -> timestamp map from the service; a row in it scored recently.
  property var goalFlashIds: ({})
  // Set for rows in the pinned group, which sit under no league header.
  property bool showCompetition: false

  signal clicked()
  signal hovered(bool isHovered)

  readonly property bool live: match && match.state === "live"
  readonly property bool upcoming: match && match.state === "upcoming"
  readonly property string clock: Model.matchClock(match)
  readonly property color clockColor: live ? accent : dim
  readonly property string winner: Model.winnerSide(match)
  readonly property bool justScored: !!(match && goalFlashIds && goalFlashIds[String(match.id)] !== undefined)

  // Pulses when this match scores, then settles into a steady accent tint
  // for as long as the service keeps the goal marked as recent.
  property real goalFlash: 0

  onJustScoredChanged: {
    if (justScored) goalFlashAnimation.restart()
    else { goalFlashAnimation.stop(); goalFlash = 0 }
  }

  SequentialAnimation {
    id: goalFlashAnimation
    loops: 3
    NumberAnimation { target: root; property: "goalFlash"; to: 1; duration: 240; easing.type: Easing.OutQuad }
    NumberAnimation { target: root; property: "goalFlash"; to: 0; duration: 460; easing.type: Easing.InQuad }
  }

  width: parent ? parent.width : implicitWidth
  implicitWidth: Style.space(400)
  implicitHeight: Style.space(52)

  // Cards lift very slightly under the cursor. Scale does not disturb the
  // column layout, so neighbouring rows stay put.
  transformOrigin: Item.Center
  scale: mouse.containsMouse ? 1.012 : 1
  Behavior on scale { NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }

  // Card. Every match sits on its own bordered surface so the eye gets a
  // clean break between games; live ones wear the accent.
  Rectangle {
    id: card
    anchors.fill: parent
    radius: Math.min(8, Style.cornerRadius)
    color: root.live || root.justScored
      ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.07 + root.goalFlash * 0.16)
      : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.03)
    border.width: 1
    border.color: root.live || root.justScored
      ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.55 + root.goalFlash * 0.45)
      : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)

    Behavior on color { ColorAnimation { duration: 180 } }
    Behavior on border.color { ColorAnimation { duration: 180 } }
  }

  Rectangle {
    anchors.fill: parent
    radius: card.radius
    color: root.selected || mouse.containsMouse ? Style.hoverFillFor(root.foreground, root.accent) : "transparent"
  }

  Row {
    anchors.fill: parent
    anchors.leftMargin: Style.space(8)
    anchors.rightMargin: Style.space(10)
    spacing: Style.space(8)

    // Status gutter — fixed width so rows stay aligned whether or not a
    // match is live. The ball breathes while the game is on.
    Item {
      width: Style.space(16)
      height: parent.height

      Text {
        id: liveBall
        anchors.centerIn: parent
        visible: root.live
        text: Model.BALL_GLYPH
        font.family: root.emojiFamily
        font.pixelSize: Style.font.body

        SequentialAnimation on opacity {
          running: root.live
          loops: Animation.Infinite
          NumberAnimation { from: 1.0; to: 0.35; duration: 900; easing.type: Easing.InOutQuad }
          NumberAnimation { from: 0.35; to: 1.0; duration: 900; easing.type: Easing.InOutQuad }
        }
      }

      // A pinned row has no league header above it, so the crest stands in
      // for one. The live ball outranks it when there is a game on.
      Image {
        anchors.centerIn: parent
        width: Style.space(13)
        height: Style.space(13)
        source: root.showCompetition && root.match ? Model.leagueLogoUrl(root.match.leagueId) : ""
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        visible: !root.live && status === Image.Ready
      }
    }

    Column {
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(6)

      Image {
        width: Style.space(16)
        height: Style.space(16)
        source: match && match.home ? Model.teamLogoUrl(match.home.id) : ""
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        visible: status === Image.Ready
      }

      Image {
        width: Style.space(16)
        height: Style.space(16)
        source: match && match.away ? Model.teamLogoUrl(match.away.id) : ""
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        visible: status === Image.Ready
      }
    }

    Column {
      width: parent.width - Style.space(142)
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(4)

      Row {
        width: parent.width
        spacing: Style.space(6)

        Text {
          width: parent.width - (homeNet.visible ? homeNet.width + Style.space(6) : 0)
          text: match && match.home ? match.home.name : ""
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          font.bold: root.live || root.winner === "home"
          elide: Text.ElideRight
          anchors.verticalCenter: parent.verticalCenter
        }

        // The net goes to whoever is ahead — mid-game or at full time.
        Text {
          id: homeNet
          visible: root.winner === "home"
          text: Model.NET_GLYPH
          font.family: root.emojiFamily
          font.pixelSize: Style.font.caption
          anchors.verticalCenter: parent.verticalCenter
        }
      }

      Row {
        width: parent.width
        spacing: Style.space(6)

        Text {
          width: parent.width - (awayNet.visible ? awayNet.width + Style.space(6) : 0)
          text: match && match.away ? match.away.name : ""
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          font.bold: root.live || root.winner === "away"
          elide: Text.ElideRight
          anchors.verticalCenter: parent.verticalCenter
        }

        Text {
          id: awayNet
          visible: root.winner === "away"
          text: Model.NET_GLYPH
          font.family: root.emojiFamily
          font.pixelSize: Style.font.caption
          anchors.verticalCenter: parent.verticalCenter
        }
      }
    }

    Column {
      width: Style.space(86)
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(4)
      transformOrigin: Item.Right
      scale: 1 + root.goalFlash * 0.14

      Text {
        width: parent.width
        text: root.upcoming ? "" : (match && match.home && match.home.score !== null ? String(match.home.score) : "")
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
        horizontalAlignment: Text.AlignRight
      }

      Row {
        width: parent.width
        spacing: Style.space(8)
        layoutDirection: Qt.RightToLeft

        Text {
          text: root.clock
          color: root.clockColor
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: root.live
        }

        Text {
          visible: !root.upcoming
          text: match && match.away && match.away.score !== null ? String(match.away.score) : ""
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          font.bold: true
        }
      }
    }
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
    onContainsMouseChanged: root.hovered(containsMouse)
  }
}
