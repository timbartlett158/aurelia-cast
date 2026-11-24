import type { RokuExportSettings } from "../types";

export interface RokuFile {
  name: string;
  content: string;
}

const ACCENTS: Record<RokuExportSettings["accent"], string> = {
  Gold: "0xD4AF37FF",
  Obsidian: "0x2EA8E9FF",
  Slate: "0x8FA3B8FF",
  Crimson: "0xDC2626FF",
};

export function validateSettings(settings: RokuExportSettings): string[] {
  const errors: string[] = [];
  if (!settings.title || settings.title.trim().length === 0) errors.push("title is required");
  if (settings.title.length > 60) errors.push("title must be 60 characters or fewer");
  if (!Number.isInteger(settings.port) || settings.port < 8080 || settings.port > 8099) {
    errors.push("port must be an integer between 8080 and 8099");
  }
  if (!ACCENTS[settings.accent]) errors.push("accent preset is invalid");
  return errors;
}

export function manifest(settings: RokuExportSettings): string {
  return [
    "title=" + settings.title,
    "subtitle=Multi-Room Web Receiver",
    "major_version=1",
    "minor_version=0",
    "build_version=1",
    "ui_resolutions=fhd",
    "bg_color=#0B0C0F",
    "splash_color=#0B0C0F",
    "icon_resolution=fhd",
    "bs_const=RECEIVER_PORT=" + settings.port,
  ].join("\n");
}

export function mainBrs(settings: RokuExportSettings): string {
  return `sub RunUserInterface()
  screen = CreateObject("roSGScreen")
  m.port = CreateObject("roMessagePort")
  screen.setMessagePort(m.port)
  scene = screen.CreateScene("ReceiverScene")
  screen.show()

  httpTask = CreateObject("roSGNode", "HttpServerTask")
  httpTask.receiverPort = ${settings.port}
  httpTask.accentColor = "${ACCENTS[settings.accent]}"
  httpTask.observeField("playRequest", m.port)
  httpTask.observeField("stopRequest", m.port)
  httpTask.control = "RUN"

  while true
    msg = wait(0, m.port)
    msgType = type(msg)
    if msgType = "roSGNodeEvent"
      field = msg.getField()
      if field = "playRequest"
        request = msg.getData()
        scene.callFunc("playUrl", request.url)
      else if field = "stopRequest"
        scene.callFunc("stopPlayback")
      else if field = "exitApp"
        exit while
      end if
    end if
  end while

  httpTask.control = "STOP"
  if scene <> invalid
    scene.callFunc("stopPlayback")
  end if
end sub`;
}

export function httpServerTaskBrs(settings: RokuExportSettings): string {
  return `sub init()
  m.port = createObject("roMessagePort")
  m.top.observeField("receiverPort", "startServer")
  m.top.functionName = "runServer"
  m.top.control = "RUNTABLESS"
end sub

sub startServer()
  m.top.control = "RUNTABLESS"
end sub

sub runServer()
  srv = createObject("roStreamSocket")
  srv.setMessagePort(m.port)
  addr = createObject("roSocketAddress")
  addr.setPort(m.top.receiverPort)
  srv.setAddress(addr)
  if not srv.listen(4)
    print "Aurelia Cast: failed to listen on port "; m.top.receiverPort
    return
  end if
  print "Aurelia Cast: HTTP receiver listening on port "; m.top.receiverPort
  srv.notifyReadable(true)

  while true
    event = wait(0, m.port)
    if type(event) <> "roSocketEvent" then exit while
    srv.notifyReadable(true)
    client = srv.accept()
    if client <> invalid
      handleClient(client)
    end if
  end while
end sub

sub handleClient(client as Object)
  requestHeader = ""
  while true
    data = client.receive(4096, 3000)
    if data = invalid then exit while
    requestHeader = requestHeader + data
    if requestHeader.inStr(0, Chr(13) + Chr(10) + Chr(13) + Chr(10)) >= 0 then exit while
  end while

  firstLine = requestHeader.lines()[0]
  parts = firstLine.split(" ")
  if parts.count() < 2
    client.send("HTTP/1.1 400 Bad Request" + Chr(13) + Chr(10) + "Connection: close" + Chr(13) + Chr(10) + Chr(13) + Chr(10))
    client.close()
    return
  end if

  route = parts[1]
  if route.left(6) = "/play?"
    url = extractParam(route, "url")
    title = extractParam(route, "title")
    if url <> ""
      request = createObject("roSGNode", "ContentNode")
      request.addFields({ url: url, title: title })
      m.top.playRequest = request
      client.send("HTTP/1.1 200 OK" + Chr(13) + Chr(10) + "Content-Type: application/json" + Chr(13) + Chr(10) + Chr(13) + Chr(10) + "{""ok"":true}")
    else
      client.send("HTTP/1.1 422 Unprocessable Entity" + Chr(13) + Chr(10) + Chr(13) + Chr(10))
    end if
  else if route = "/stop"
    m.top.stopRequest = true
    client.send("HTTP/1.1 200 OK" + Chr(13) + Chr(10) + Chr(13) + Chr(10))
  else
    client.send("HTTP/1.1 404 Not Found" + Chr(13) + Chr(10) + Chr(13) + Chr(10))
  end if
  client.close()
end sub

function extractParam(route as String, key as String) as String
  query = route.mid(route.inStr(0, "?") + 1)
  for each pair in query.split("&")
    kv = pair.split("=")
    if kv.count() = 2 and kv[0] = key
      return kv[1]
    end if
  end for
  return ""
end function`;
}

export function receiverSceneXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<component name="ReceiverScene" extends="Scene">
  <children>
    <Rectangle width="1920" height="1080" color="0x0B0C0FFF" />
    <Video id="player" width="1920" height="1080" translation="[0,0]" enableUI="false" />
    <Label id="osdTitle" width="1600" height="60" translation="[160,880]" font="font:MediumSystemFont" color="#D4AF37FF" visible="false" />
    <Label id="osdInfo" width="1600" height="40" translation="[160,950]" font="font:SmallestSystemFont" color="#8FA3B8FF" visible="false" />
    <Timer id="osdTimer" repeat="false" duration="3" />
  </children>
  <script type="text/brightscript" uri="ReceiverScene.brs" />
</component>`;
}

export function receiverSceneBrs(): string {
  return `sub init()
  m.player = m.top.findNode("player")
  m.osdTitle = m.top.findNode("osdTitle")
  m.osdInfo = m.top.findNode("osdInfo")
  m.osdTimer = m.top.findNode("osdTimer")
  m.osdTimer.observeField("fire", "hideOsd")
  m.player.observeField("state", "onPlayerState")
end sub

sub playUrl(url as String)
  m.player.content = createObject("roSGNode", "ContentNode")
  m.player.content.url = url
  m.player.content.streamFormat = "hls"
  if url.right(4) = ".mp4"
    m.player.content.streamFormat = "mp4"
  end if
  m.player.control = "play"
  showOsd(m.player.content.url)
end sub

sub stopPlayback()
  m.player.control = "stop"
  hideOsd()
end sub

sub showOsd(titleText as String)
  m.osdTitle.text = titleText
  m.osdInfo.text = "Aurelia CastReceiver"
  m.osdTitle.visible = true
  m.osdInfo.visible = true
  m.osdTimer.control = "start"
end sub

sub hideOsd()
  m.osdTitle.visible = false
  m.osdInfo.visible = false
end sub

sub onPlayerState()
  if m.player.state = "finished"
    m.osdInfo.text = "Playback finished"
    m.osdTitle.visible = true
    m.osdInfo.visible = true
  end if
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
  if not press then return false
  if key = "OK"
    if m.player.control = "play"
      m.player.control = "pause"
    else
      m.player.control = "resume"
    end if
    return true
  else if key = "back"
    m.top.exitApp = true
    return true
  else if key = "rewind"
    m.player.seek = m.player.position - 30
    return true
  else if key = "fastforward"
    m.player.seek = m.player.position + 30
    return true
  end if
  return false
end function`;
}

export function historyRegistryBrs(): string {
  return `sub init()
end sub

function saveHistoryItem(url as String, title as String, positionSec as Integer) as Boolean
  sec = createObject("roRegistrySection", "History")
  key = sha256Hex(url)
  doc = { url: url, title: title, position: positionSec, savedAt: createObject("roDateTime").asSeconds() }
  sec.write(key, formatJson(doc))
  sec.flush()
  return true
end function

function loadHistoryItems() as Object
  sec = createObject("roRegistrySection", "History")
  keys = sec.getKeys()
  items = []
  for each key in keys
    raw = sec.read(key)
    if raw <> ""
      items.push(parseJson(raw))
    end if
  end for
  return items
end function

function clearHistory() as Void
  sec = createObject("roRegistrySection", "History")
  sec.clear()
  sec.flush()
end function

function sha256Hex(input as String) as String
  return simpleHash(input)
end function

function simpleHash(input as String) as String
  hash = 5381
  for i = 1 to len(input)
    hash = ((hash * 33) + input.mid(i - 1, 1).asc()) mod 16777216
  end for
  return hash.toStr()
end function`;
}

export function sideloadMd(status: RokuExportSettings): string {
  return `# Aurelia Cast — Roku Sideload Guide

Package for channel: **${status.title}** (HTTP receiver port: ${status.port})

## 1. Enable Developer Mode on the Roku
1. Press Home 3x, Up 2x, Right, Left, Right, Left, Right on the remote.
2. Accept the Developer Tool License Agreement and set a web password.
3. Note the Roku IP address shown on the confirmation screen.

## 2. Install the package
\`\`\`bash
unzip aurelia-cast.zip            # if you downloaded one archive
curl -F "mysubmit=Install" -F "archive=@aurelia-cast.zip" \\
     -F "passwd=<your-dev-password>" \\
     http://<roku-ip>/plugin_install
\`\`\`

## 3. Cast to it
Once installed, the channel listens on port ${status.port}:

\`\`\`bash
curl "http://<roku-ip>:${status.port}/play?url=https%3A%2F%2Fexample.com%2Fstream.m3u8&title=My%20Stream"
curl "http://<roku-ip>:${status.port}/stop"
\`\`\`

> Browser Note: modern HTTPS pages cannot call http:// LAN endpoints directly
> (mixed-content policy). The receiver on the Roku listens on port ${status.port};
> use \`curl\` or a small local script rather than a hosted web page.

## 4. D-pad behavior
- OK — play / pause
- Rewind / Fast-Forward — seek ±30s
- Back — stop and exit

## 5. Verification
- Channel appears under "My Channels" after install.
- Tail the telnet console (\`telnet <roku-ip> 8085\`) to see "listening on port ${status.port}".
`;
}

export function buildRokuPackage(settings: RokuExportSettings): RokuFile[] {
  return [
    { name: "manifest", content: manifest(settings) },
    { name: "source/main.brs", content: mainBrs(settings) },
    { name: "source/components/HttpServerTask.brs", content: httpServerTaskBrs(settings) },
    { name: "source/components/HttpServerTask.xml", content: httpServerTaskXml() },
    { name: "source/components/ReceiverScene.xml", content: receiverSceneXml() },
    { name: "source/components/ReceiverScene.brs", content: receiverSceneBrs() },
    { name: "source/components/HistoryRegistry.brs", content: historyRegistryBrs() },
    { name: "SIDELoad.md", content: sideloadMd(settings) },
  ];
}

function httpServerTaskXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<component name="HttpServerTask" extends="Task">
  <interface>
    <field id="receiverPort" type="integer" value="8080" />
    <field id="accentColor" type="string" value="0xD4AF37FF" />
    <field id="playRequest" type="node" />
    <field id="stopRequest" type="boolean" alwaysNotify="true" />
  </interface>
  <script type="text/brightscript" uri="HttpServerTask.brs" />
</component>`;
}
