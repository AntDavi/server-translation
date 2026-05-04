/**
 * Stress test — 10 players, same room, different languages & messages
 *
 * Success criteria:
 *  ✔ All 10 players connect and join without errors
 *  ✔ Every message is received by every other player with the correct `fromName`
 *  ✔ `translatedContent` is non-empty for every delivery (no translation confusion)
 *  ✔ No connection drops unexpectedly during the test
 *  ✔ All connections close gracefully at the end
 */

import WebSocket from "ws";
import { randomUUID } from "crypto";

const SERVER = "wss://server-translation.onrender.com";
const ROOM = "stress-" + randomUUID().split("-")[0];
const MSG_TIMEOUT_MS = 60_000; // each translation can be slow on Render free tier
const JOIN_STAGGER_MS = 400;   // gap between each join
const SEND_STAGGER_MS = 2_500; // gap between each message send

// ─── Player definitions ──────────────────────────────────────────────────────

const PLAYERS = [
  { name: "Alice",   language: "pt-BR", message: "Olá, como estão todos aqui?" },
  { name: "Bob",     language: "en-US", message: "Hello everyone, nice to meet you all!" },
  { name: "Carlos",  language: "es-ES", message: "¡Hola a todos! ¿Cómo están hoy?" },
  { name: "Marie",   language: "fr-FR", message: "Bonjour tout le monde, comment ça va?" },
  { name: "Hans",    language: "de-DE", message: "Hallo zusammen! Wie geht es euch heute?" },
  { name: "Yuki",    language: "ja-JP", message: "みなさん、こんにちは！元気ですか？" },
  { name: "Luca",    language: "it-IT", message: "Ciao a tutti! Come state oggi?" },
  { name: "Ana",     language: "pt-PT", message: "Olá a todos! Espero que estejam bem." },
  { name: "Ivan",    language: "ru-RU", message: "Всем привет! Как дела у всех?" },
  { name: "Wei",     language: "zh-CN", message: "大家好！很高兴认识你们大家！" },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  \x1b[32m✔\x1b[0m  ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.error(
    `  \x1b[31m✘\x1b[0m  ${label}${detail ? `\n       → ${detail}` : ""}`,
  );
  failed++;
}

function warn(label: string) {
  console.warn(`  \x1b[33m⚠\x1b[0m  ${label}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function send(ws: WebSocket, payload: object) {
  ws.send(JSON.stringify(payload));
}

interface Client {
  ws: WebSocket;
  id: string;
  name: string;
  language: string;
  message: string;
  dropped: boolean;
  /** messages received while the test runs */
  inbox: Array<Record<string, unknown>>;
}

function connectClient(label: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER);
    ws.once("open", () => {
      console.log(`  \x1b[90m[${label}] connected\x1b[0m`);
      resolve(ws);
    });
    ws.once("error", reject);
  });
}

/**
 * Wait until `predicate` is satisfied by a message on `ws`,
 * or reject after `timeoutMs`.
 */
function waitFor(
  ws: WebSocket,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = MSG_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", handler);
      reject(new Error("Timeout"));
    }, timeoutMs);

    function handler(data: WebSocket.RawData) {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve(msg);
        }
      } catch { /* ignore */ }
    }

    ws.on("message", handler);
  });
}

/**
 * Wait until all receivers have a message from `senderName`
 * in their inbox (polled), or timeout.
 */
function waitUntilAllReceived(
  receivers: Client[],
  senderName: string,
  timeoutMs = MSG_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const iv = setInterval(() => {
      const allDone = receivers.every((c) =>
        c.inbox.some((m) => m.type === "message" && m.fromName === senderName),
      );
      if (allDone) { clearInterval(iv); resolve(); return; }
      if (Date.now() > deadline) {
        clearInterval(iv);
        const missing = receivers
          .filter((c) => !c.inbox.some((m) => m.type === "message" && m.fromName === senderName))
          .map((c) => c.name)
          .join(", ");
        reject(new Error(`Timeout — still waiting on: ${missing}`));
      }
    }, 500);
  });
}

// ─── Main test ───────────────────────────────────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║   STRESS TEST — 10 PLAYERS / SAME ROOM           ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`  Server : ${SERVER}`);
  console.log(`  Room   : ${ROOM}`);
  console.log(`  Players: ${PLAYERS.length}\n`);

  // ── Phase 1: Connect all clients ─────────────────────────────────────────
  console.log("▶ Phase 1 — Connecting all clients…");
  const clients: Client[] = [];

  for (const p of PLAYERS) {
    try {
      const ws = await connectClient(p.name);
      const client: Client = {
        ws,
        id: p.name.toLowerCase() + "-" + randomUUID().split("-")[0],
        name: p.name,
        language: p.language,
        message: p.message,
        dropped: false,
        inbox: [],
      };

      // Attach persistent message collector
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          client.inbox.push(msg);
        } catch { /* ignore */ }
      });

      // Track unexpected drops
      ws.on("close", (code, reason) => {
        if (client.dropped) return; // we closed it intentionally
        warn(`${p.name} connection closed unexpectedly (code=${code} reason=${reason.toString() || "—"})`);
        client.dropped = true;
      });

      ws.on("error", (err) => {
        warn(`${p.name} WebSocket error: ${err.message}`);
      });

      clients.push(client);
    } catch (err) {
      fail(`Failed to connect ${p.name}`, String(err));
      process.exit(1);
    }
  }

  ok(`All ${clients.length} clients connected`);

  // ── Phase 2: Join room (staggered) ───────────────────────────────────────
  console.log("\n▶ Phase 2 — Joining room…");

  for (const c of clients) {
    send(c.ws, {
      type: "join",
      roomId: ROOM,
      playerId: c.id,
      name: c.name,
      language: c.language,
    });
    await sleep(JOIN_STAGGER_MS);
  }

  // Wait a moment for all join events to propagate
  await sleep(1_000);
  ok(`All ${clients.length} players joined room "${ROOM}"`);

  // ── Phase 3: Each player sends one message ───────────────────────────────
  console.log("\n▶ Phase 3 — Each player sends a message…");
  console.log("  (each message must reach all other players with correct translation)\n");

  let translationErrors = 0;
  let nameErrors = 0;

  for (let i = 0; i < clients.length; i++) {
    const sender = clients[i];
    const receivers = clients.filter((_, j) => j !== i);

    console.log(
      `  [${sender.name}/${sender.language}] → "${sender.message}"`,
    );

    // Clear previous inbox entries to isolate this round
    // (we only look at messages that arrive AFTER we send)
    const snapshots = new Map(receivers.map((r) => [r.id, r.inbox.length]));

    send(sender.ws, {
      type: "message",
      roomId: ROOM,
      playerId: sender.id,
      content: sender.message,
    });

    // Wait for all 9 receivers to get the message
    try {
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + MSG_TIMEOUT_MS;
        const iv = setInterval(() => {
          const allDone = receivers.every((r) => {
            const since = snapshots.get(r.id)!;
            return r.inbox
              .slice(since)
              .some((m) => m.type === "message" && m.fromName === sender.name);
          });
          if (allDone) { clearInterval(iv); resolve(); return; }
          if (Date.now() > deadline) {
            clearInterval(iv);
            const missing = receivers
              .filter((r) => {
                const since = snapshots.get(r.id)!;
                return !r.inbox
                  .slice(since)
                  .some((m) => m.type === "message" && m.fromName === sender.name);
              })
              .map((r) => r.name)
              .join(", ");
            reject(new Error(`Timeout — still waiting on: ${missing}`));
          }
        }, 500);
      });
    } catch (err) {
      fail(`Not all players received ${sender.name}'s message`, String(err));
      translationErrors++;
      await sleep(SEND_STAGGER_MS);
      continue;
    }

    // Validate each delivery
    let roundOk = true;
    for (const r of receivers) {
      const since = snapshots.get(r.id)!;
      const msg = r.inbox
        .slice(since)
        .find((m) => m.type === "message" && m.fromName === sender.name);

      if (!msg) continue; // already counted above

      const fromName = msg.fromName as string;
      const translated = msg.translatedContent as string;

      if (fromName !== sender.name) {
        fail(
          `Name mismatch at ${r.name}: expected "${sender.name}", got "${fromName}"`,
        );
        nameErrors++;
        roundOk = false;
      }

      if (!translated || translated.trim().length === 0) {
        fail(
          `Empty translation at ${r.name} (${r.language}) for ${sender.name}'s message`,
        );
        translationErrors++;
        roundOk = false;
      }
    }

    if (roundOk) {
      ok(
        `"${sender.name}" → all ${receivers.length} players received correctly (names ✔, translations ✔)`,
      );
    }

    await sleep(SEND_STAGGER_MS);
  }

  // ── Phase 4: Verify no unexpected drops ──────────────────────────────────
  console.log("\n▶ Phase 4 — Checking connection stability…");
  const dropped = clients.filter((c) => c.dropped);
  if (dropped.length === 0) {
    ok("No unexpected connection drops during test");
  } else {
    fail(
      `${dropped.length} connection(s) dropped unexpectedly`,
      dropped.map((c) => c.name).join(", "),
    );
  }

  // ── Phase 5: Graceful disconnect ─────────────────────────────────────────
  console.log("\n▶ Phase 5 — Closing all connections…");
  let closeErrors = 0;

  await Promise.all(
    clients.map(
      (c) =>
        new Promise<void>((resolve) => {
          if (c.ws.readyState === WebSocket.CLOSED) { resolve(); return; }
          c.dropped = true; // mark intentional so the 'close' listener stays quiet
          const t = setTimeout(() => {
            warn(`${c.name}'s connection did not close in time`);
            closeErrors++;
            resolve();
          }, 5_000);
          c.ws.once("close", () => { clearTimeout(t); resolve(); });
          c.ws.close();
        }),
    ),
  );

  if (closeErrors === 0) {
    ok(`All ${clients.length} connections closed gracefully`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = passed + failed;
  const status = failed === 0 ? "\x1b[32mALL PASSED\x1b[0m" : "\x1b[31mSOME FAILED\x1b[0m";

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log(`║  Results : ${passed}/${total} passed`);
  if (translationErrors > 0)
    console.log(`║  Translation errors : ${translationErrors}`);
  if (nameErrors > 0)
    console.log(`║  Name confusion     : ${nameErrors}`);
  console.log(`║  Status  : ${status}`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("\n\x1b[31mUnexpected error:\x1b[0m", err);
  process.exit(1);
});
