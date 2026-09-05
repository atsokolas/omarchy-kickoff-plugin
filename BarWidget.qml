import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "atsokolas.kickoff"

  property string emojiFamily: "Noto Color Emoji"

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function refresh() {
    if (panelLoader.item && panelLoader.item.refresh) panelLoader.item.refresh()
  }

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
  }

  readonly property var service: panelLoader.item ? panelLoader.item.service : null
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool live: panelLoader.item ? panelLoader.item.live === true : false
  readonly property string label: panelLoader.item ? panelLoader.item.label : Model.APP_NAME

  function open() {
    if (panelLoader.item && panelLoader.item.openFromHotkey) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  // ---- Goal celebration ------------------------------------------------
  // A goal drops the score label, rolls the ball across the pill in an arc,
  // buries it in the net, and punches the net back. Animated properties live
  // on the root so one timeline drives every piece.

  property var celebrationEvent: null
  property var celebrationQueue: []
  property int goalCount: 0
  readonly property bool celebrating: celebrationEvent !== null
  readonly property string celebrationText: Model.celebrationLine(goalCount)

  property real ballTravel: 0   // 0 at rest, 1 buried in the net
  property real ballSpin: 0
  property real ballFade: 1
  property real netFade: 0
  property real netPunch: 1
  property real burst: 0        // expanding ring at the moment of impact
  property real captionFade: 0
  property real labelFade: 1

  function celebrate(event) {
    if (!event) return
    // One at a time — a flurry of goals queues up rather than overlapping.
    if (celebrating) {
      celebrationQueue = celebrationQueue.concat([event])
      return
    }
    goalCount = goalCount + 1
    celebrationEvent = event
    goalAnimation.restart()
  }

  function finishCelebration() {
    celebrationEvent = null
    if (celebrationQueue.length === 0) return
    var next = celebrationQueue[0]
    celebrationQueue = celebrationQueue.slice(1)
    nextGoalTimer.pending = next
    nextGoalTimer.restart()
  }


  Timer {
    id: nextGoalTimer
    property var pending: null
    interval: 320
    repeat: false
    onTriggered: {
      var event = pending
      pending = null
      if (event) root.celebrate(event)
    }
  }

  SequentialAnimation {
    id: goalAnimation

    // Clear the stage: the score steps aside, the net swings in.
    ParallelAnimation {
      NumberAnimation { target: root; property: "labelFade"; to: 0; duration: 170; easing.type: Easing.OutCubic }
      NumberAnimation { target: root; property: "netFade"; to: 1; duration: 280; easing.type: Easing.OutBack }
    }

    // The strike.
    ParallelAnimation {
      NumberAnimation { target: root; property: "ballTravel"; from: 0; to: 1; duration: 620; easing.type: Easing.InOutQuad }
      NumberAnimation { target: root; property: "ballSpin"; from: 0; to: 900; duration: 620; easing.type: Easing.Linear }
    }

    // Impact: ball buried, net bulges and rings out.
    ParallelAnimation {
      NumberAnimation { target: root; property: "ballFade"; to: 0; duration: 150 }
      NumberAnimation { target: root; property: "burst"; from: 0; to: 1; duration: 460; easing.type: Easing.OutCubic }
      NumberAnimation { target: root; property: "captionFade"; to: 1; duration: 200 }
      SequentialAnimation {
        NumberAnimation { target: root; property: "netPunch"; to: 1.4; duration: 90; easing.type: Easing.OutQuad }
        NumberAnimation { target: root; property: "netPunch"; to: 1.0; duration: 420; easing.type: Easing.OutElastic }
      }
    }

    PauseAnimation { duration: 850 }

    // Back to business.
    ParallelAnimation {
      NumberAnimation { target: root; property: "captionFade"; to: 0; duration: 220 }
      NumberAnimation { target: root; property: "netFade"; to: 0; duration: 280; easing.type: Easing.InCubic }
    }

    ScriptAction {
      script: {
        // The ring is already transparent at burst = 1; snap it rather than
        // animating back down, which would swell it into view again.
        root.burst = 0
        root.ballTravel = 0
        root.ballSpin = 0
        root.ballFade = 1
        root.netPunch = 1
      }
    }

    NumberAnimation { target: root; property: "labelFade"; to: 1; duration: 240; easing.type: Easing.OutCubic }
    ScriptAction { script: root.finishCelebration() }
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  IpcHandler {
    target: "atsokolas.kickoff"
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function refresh(): string { root.refresh(); return "ok" }
    // The service is shared across monitors, so one call fans out to every bar.
    function celebrate(): string {
      if (!root.service || !root.service.demoGoal) return "no service"
      root.service.demoGoal()
      return "ok"
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  Connections {
    target: panelLoader.item
    ignoreUnknownSignals: true
    function onGoalScored(event) { root.celebrate(event) }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: ""
    labelVisible: false
    hasVisualContent: true
    // Sized from the painted content rather than the base label, because the
    // ball comes from the emoji font and measures differently there.
    fixedWidth: root.vertical ? -1 : Math.max(12, pill.contentWidth + button.scaledHorizontalMargin * 2)
    foreground: root.celebrating || root.live
      ? Color.accent
      : (root.bar ? root.bar.barForeground : Color.foreground)
    tooltipText: root.celebrating
      ? Model.goalCaption(root.celebrationEvent)
      : (root.live ? "Live football" : Model.APP_NAME)
    horizontalMargin: 8.75
    verticalPadding: 8.75

    onPressed: function(b) {
      if (b === Qt.RightButton || b === Qt.MiddleButton) root.refresh()
      else root.togglePanel()
    }

    Item {
      id: pill
      anchors.fill: parent

      readonly property real margin: button.scaledHorizontalMargin
      readonly property real ballSize: ball.implicitWidth
      readonly property real gap: Style.spaceReal(6)
      readonly property real contentWidth: root.vertical
        ? ballSize
        : ballSize + gap + labelText.implicitWidth
      readonly property real restX: root.vertical ? (width - ballSize) / 2 : margin
      readonly property real netX: width - margin - net.implicitWidth
      // No room to run a ball across a vertical bar, so it just spins there.
      readonly property real runDistance: root.vertical ? 0 : Math.max(0, netX - restX)
      readonly property real arcHeight: Math.min(height * 0.3, Style.spaceReal(11))

      Text {
        id: ball
        text: Model.BALL_GLYPH
        font.family: root.emojiFamily
        font.pixelSize: button.fontSize
        transformOrigin: Item.Center
        opacity: root.ballFade
        rotation: root.ballSpin + idleTilt
        x: pill.restX + root.ballTravel * pill.runDistance
        y: (pill.height - height) / 2
          - Math.sin(Math.PI * root.ballTravel) * pill.arcHeight
          - idleLift

        // While a match is live the ball never sits quite still.
        property real idleTilt: 0
        property real idleLift: 0
        readonly property bool fidgeting: root.live && !root.celebrating

        SequentialAnimation on idleTilt {
          running: ball.fidgeting
          loops: Animation.Infinite
          NumberAnimation { from: -7; to: 7; duration: 1400; easing.type: Easing.InOutSine }
          NumberAnimation { from: 7; to: -7; duration: 1400; easing.type: Easing.InOutSine }
        }

        SequentialAnimation on idleLift {
          running: ball.fidgeting
          loops: Animation.Infinite
          NumberAnimation { from: 0; to: 2; duration: 700; easing.type: Easing.OutQuad }
          NumberAnimation { from: 2; to: 0; duration: 700; easing.type: Easing.InQuad }
        }

        onFidgetingChanged: if (!fidgeting) { idleTilt = 0; idleLift = 0 }
      }

      Text {
        id: labelText
        visible: !root.vertical && opacity > 0.01
        x: pill.restX + pill.ballSize + pill.gap
        anchors.verticalCenter: parent.verticalCenter
        text: root.label
        opacity: root.labelFade
        color: button.foreground
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        renderType: Text.NativeRendering
      }

      Text {
        id: caption
        visible: !root.vertical && opacity > 0.01
        x: pill.restX + pill.ballSize + pill.gap
        width: Math.max(0, pill.netX - x - pill.gap)
        anchors.verticalCenter: parent.verticalCenter
        text: root.celebrationText
        opacity: root.captionFade
        color: Color.accent
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        font.bold: true
        elide: Text.ElideRight
        renderType: Text.NativeRendering
      }

      Rectangle {
        id: burstRing
        visible: root.burst > 0.001
        width: button.fontSize * 1.7
        height: width
        radius: width / 2
        color: "transparent"
        border.width: Math.max(1, Style.spaceReal(1.5))
        border.color: Color.accent
        transformOrigin: Item.Center
        x: net.x + net.width / 2 - width / 2
        y: net.y + net.height / 2 - height / 2
        scale: 0.35 + root.burst * 1.9
        opacity: (1 - root.burst) * 0.85
      }

      Text {
        id: net
        text: Model.NET_GLYPH
        font.family: root.emojiFamily
        font.pixelSize: button.fontSize
        visible: opacity > 0.01
        opacity: root.netFade
        scale: root.netPunch
        transformOrigin: Item.Center
        x: pill.netX
        y: (pill.height - height) / 2
      }
    }
  }
}
