// Explicit maintenance task; ordinary application builds never regenerate speech.
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const normalize = (text) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const origin = new URL(process.env.PUBLISHED_MAP_URL || "https://turnright.vercel.app");
if (origin.protocol !== "https:") throw new Error("Use a published HTTPS campus origin");
async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
const manifest = JSON.parse(await fetchBytes(new URL("/packages/latest.json", origin)));
const campusBytes = await fetchBytes(new URL(manifest.dataUrl, origin));
const asset = manifest.assets.find((item) => item.url === manifest.dataUrl);
if (!asset || hash(campusBytes) !== asset.sha256 || campusBytes.length !== asset.bytes)
  throw new Error("Published campus failed its integrity check");
const campus = JSON.parse(campusBytes);
const destinationNames = [...new Set(campus.places.map((p) => p.name).filter(Boolean))].sort();
const roadNames = [...new Set(campus.graph.edges.map((e) => e.name).filter(Boolean))]
  .filter((name) => !/^(campus (road|path)|path|road|footpath|unnamed.*)$/i.test(name.trim()))
  .sort();
if (process.argv.includes("--report")) {
  const pack = JSON.parse(
    await fs.readFile(path.join(root, "web/public/voice/en-GB-v1/manifest.json"), "utf8"),
  );
  const missing = {
    sourceVersion: campus.version,
    destinations: destinationNames.filter((n) => !pack.destinations[normalize(n)]),
    roads: roadNames.filter((n) => !pack.roads[normalize(n)]),
  };
  console.log(JSON.stringify(missing, null, 2));
  process.exitCode = missing.destinations.length || missing.roads.length ? 1 : 0;
} else {
  const overrides = JSON.parse(
    await fs.readFile(path.join(root, "data/voice/pronunciation.json"), "utf8"),
  );
  const spoken = (text) =>
    Object.entries(overrides).reduce(
      (value, [from, to]) =>
        value.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), to),
      text,
    );
  const phrases = {};
  const add = (key, transcript) => {
    phrases[key] = { transcript, spoken: spoken(transcript) };
  };
  const core = {
    "depart-driving": "Start driving along the highlighted route.",
    "arrive-parking":
      "You have reached the mapped parking or drop-off point. Park, then select start walking to continue.",
    roundabout: "Enter the roundabout and follow the highlighted route to your exit.",
    depart: "Start walking along the highlighted route.",
    continue: "Continue along the highlighted route.",
    "destination-ahead": "Your destination is ahead. Keep following the highlighted route.",
    "arrive-entrance": "You have reached the mapped entrance. Your walking route is complete.",
    "arrive-approach":
      "You have reached the end of the mapped route. Your destination is nearby, but its entrance connection has not been verified.",
    weak: "Your location signal is weak. Directions are paused until it improves.",
    stale:
      "Your location has stopped updating. Directions will resume when your location is available.",
    recovered: "Your location is available again. Follow the highlighted route.",
    rerouting: "You are away from the route. Finding a new walking route.",
    rerouted: "Your walking route has been updated.",
    "route-unavailable": "A new walking route could not be found. Check the map before continuing.",
    "off-route": "You are away from the highlighted route. Checking your location.",
    ready: "Natural voice directions are on. In about thirty metres, turn left. Then turn right.",
  };
  for (const [key, text] of Object.entries(core)) add(key, text);
  const turns = {
    left: "turn left",
    right: "turn right",
    "slight-left": "bear left",
    "slight-right": "bear right",
    uturn: "turn around when it is safe",
    straight: "continue straight",
  };
  const distances = {
    10: "ten",
    20: "twenty",
    30: "thirty",
    40: "forty",
    50: "fifty",
    60: "sixty",
    100: "one hundred",
    200: "two hundred",
  };
  const roads = {},
    destinations = {};
  for (const name of roadNames) roads[normalize(name)] = hash(normalize(name)).slice(0, 12);
  for (const [kind, action] of Object.entries(turns)) {
    for (const phase of ["now", ...Object.keys(distances)]) {
      const lead = phase === "now" ? "Now, " : `In about ${distances[phase]} metres, `;
      add(`turn:${kind}:${phase}`, `${lead}${action}.`);
      for (const name of roadNames)
        add(`turn:${kind}:${phase}:${roads[normalize(name)]}`, `${lead}${action} onto ${name}.`);
    }
    if (kind === "straight") continue;
    for (const [second, nextAction] of Object.entries(turns)) {
      if (second === "straight") continue;
      add(`chain:${kind}:${second}:soon`, `Ahead, ${action}, then ${nextAction}.`);
      add(`chain:${kind}:${second}:now`, `Now, ${action}, then ${nextAction}.`);
    }
  }
  for (const name of destinationNames) {
    const key = `destination:${hash(normalize(name)).slice(0, 16)}`;
    destinations[normalize(name)] = key;
    add(key, `Your destination is ${name}.`);
  }
  const result = {
    schemaVersion: 1,
    sourceVersion: campus.version,
    sourceUrl: new URL(manifest.dataUrl, origin).href,
    sourceSha256: hash(campusBytes),
    voice: "bf_emma",
    language: "en-GB",
    model: "hexgrad/Kokoro-82M",
    revision: "f3ff3571791e39611d31c381e3a41a3af07b4987",
    files: {
      "kokoro-v1_0.pth": "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4",
      "voices/bf_emma.pt": "d0a423deabf4a52b4f49318c51742c54e21bb89bbbe9a12141e7758ddb5da701",
    },
    destinations,
    roads,
    phrases,
  };
  await fs.writeFile(
    path.join(root, "data/voice/catalogue.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    `${Object.keys(phrases).length} phrases; ${destinationNames.length} destination names; ${roadNames.length} useful road names; ${campus.version}`,
  );
}
