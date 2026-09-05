import QtQuick
import qs.Commons
import "Model.js" as Model

Text {
  id: root

  property real iconSize: Style.font.icon
  property color iconColor: Color.foreground
  // The ball comes from the emoji font; the shell's Nerd Font has no glyph.
  property string emojiFamily: "Noto Color Emoji"
  // Set while something is live — the ball rocks gently instead of sitting still.
  property bool lively: false
  property real tilt: 0

  text: Model.BALL_GLYPH
  color: iconColor
  font.family: emojiFamily
  font.pixelSize: iconSize
  horizontalAlignment: Text.AlignHCenter
  verticalAlignment: Text.AlignVCenter
  width: iconSize
  height: iconSize
  transformOrigin: Item.Center
  rotation: tilt

  SequentialAnimation on tilt {
    running: root.lively
    loops: Animation.Infinite
    NumberAnimation { from: -9; to: 9; duration: 1500; easing.type: Easing.InOutSine }
    NumberAnimation { from: 9; to: -9; duration: 1500; easing.type: Easing.InOutSine }
  }

  onLivelyChanged: if (!lively) tilt = 0
}
