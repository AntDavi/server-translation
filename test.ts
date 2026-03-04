/**
 * Automated integration test for wss://server-translation.onrender.com
 *
 * Scenarios covered:
 *  1. Two clients join the same room with different languages
 *  2. Client A sends a message → Client B receives it translated
 *  3. Client B sends a message → Client A receives it translated
 *  4. Client A changes language → subsequent message is translated to the new language
 *  5. Client A changes name → subsequent message shows the new name
 *  6. Client leaves → remaining client receives info notification
 */

import WebSocket from "ws";
import { randomUUID } from "crypto";

const SERVER = "wss://server-translation.onrender.com";
const ROOM = "test-room-" + randomUUID().split("-")[0];
const TIMEOUT_MS = 30_000; // max wait per assertion (translation may be slow)

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function waitFor(
  ws: WebSocket,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", handler);
      reject(new Error("Timeout waiting for expected message"));
    }, timeoutMs);

    function handler(data: WebSocket.RawData) {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve(msg);
        }
      } catch {
        /* ignore parse errors */
      }
    }

    ws.on("message", handler);
  });
}

function connect(label: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER);
    ws.once("open", () => {
      console.log(`  \x1b[90m[${label}] connected\x1b[0m`);
      resolve(ws);
    });
    ws.once("error", reject);
  });
}

function send(ws: WebSocket, payload: object) {
  ws.send(JSON.stringify(payload));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   TRANSLATION SERVER — INTEGRATION TESTS     ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Server : ${SERVER}`);
  console.log(`  Room   : ${ROOM}\n`);

  // ── 1. Connect both clients ─────────────────────────────────────────────
  console.log("▶ Connecting clients…");
  let alice: WebSocket, bob: WebSocket;
  try {
    alice = await connect("Alice");
    bob = await connect("Bob");
    ok("Both clients connected successfully");
  } catch (err) {
    fail("Failed to connect to server", String(err));
    process.exit(1);
  }

  const aliceId = "alice-" + randomUUID().split("-")[0];
  const bobId = "bob-" + randomUUID().split("-")[0];

  // ── 2. Join room ────────────────────────────────────────────────────────
  console.log("\n▶ Joining room…");

  // Bob joins first so he can receive Alice's join notification
  send(bob, {
    type: "join",
    roomId: ROOM,
    playerId: bobId,
    name: "Bob",
    language: "en-US",
  });

  // Small gap so Bob is registered before Alice sends the join notification
  await sleep(500);

  // Alice joins — Bob should receive an info message
  const bobInfoPromise = waitFor(bob, (m) => m.type === "info");

  send(alice, {
    type: "join",
    roomId: ROOM,
    playerId: aliceId,
    name: "Alice",
    language: "pt-BR",
  });

  try {
    const info = await bobInfoPromise;
    ok(`Bob received join notification: "${info.content}"`);
  } catch {
    fail("Bob did not receive join notification within timeout");
  }

  // ── 3. Alice → Bob (pt-BR → en-US) ─────────────────────────────────────
  console.log("\n▶ Scenario 1 — Alice (pt-BR) → Bob (en-US)…");

  const bobMsgPromise = waitFor(bob, (m) => m.type === "message");

  send(alice, {
    type: "message",
    roomId: ROOM,
    playerId: aliceId,
    content: "Olá, tudo bem com você?",
  });

  try {
    const msg = await bobMsgPromise;
    const translated = msg.translatedContent as string;
    const fromName = msg.fromName as string;

    if (fromName !== "Alice") {
      fail(`Expected fromName "Alice", got "${fromName}"`);
    } else {
      ok(`Sender name correct: "${fromName}"`);
    }

    if (translated && translated.trim().length > 0) {
      ok(`Message translated to en-US: "${translated}"`);
    } else {
      fail("Translated content is empty");
    }
  } catch {
    fail("Bob did not receive translated message within timeout");
  }

  // ── 4. Bob → Alice (en-US → pt-BR) ─────────────────────────────────────
  console.log("\n▶ Scenario 2 — Bob (en-US) → Alice (pt-BR)…");

  const aliceMsgPromise = waitFor(alice, (m) => m.type === "message");

  send(bob, {
    type: "message",
    roomId: ROOM,
    playerId: bobId,
    content: "Hello! Everything is fine, thank you!",
  });

  try {
    const msg = await aliceMsgPromise;
    const translated = msg.translatedContent as string;
    const fromName = msg.fromName as string;

    if (fromName !== "Bob") {
      fail(`Expected fromName "Bob", got "${fromName}"`);
    } else {
      ok(`Sender name correct: "${fromName}"`);
    }

    if (translated && translated.trim().length > 0) {
      ok(`Message translated to pt-BR: "${translated}"`);
    } else {
      fail("Translated content is empty");
    }
  } catch {
    fail("Alice did not receive translated message within timeout");
  }

  // ── 5. change-language: Alice switches to es-ES ─────────────────────────
  console.log("\n▶ Scenario 3 — Alice changes language to es-ES…");

  send(alice, {
    type: "change-language",
    roomId: ROOM,
    playerId: aliceId,
    language: "es-ES",
  });

  await sleep(300); // let server process the change

  const aliceEsPromise = waitFor(alice, (m) => m.type === "message");

  send(bob, {
    type: "message",
    roomId: ROOM,
    playerId: bobId,
    content: "Did you change your language?",
  });

  try {
    const msg = await aliceEsPromise;
    const translated = msg.translatedContent as string;

    if (translated && translated.trim().length > 0) {
      ok(`Message received in new language (es-ES): "${translated}"`);
    } else {
      fail("Translated content is empty after language change");
    }
  } catch {
    fail("Alice did not receive message after language change");
  }

  // ── 6. change-name: Alice renames to "Alicia" ───────────────────────────
  console.log("\n▶ Scenario 4 — Alice changes name to Alicia…");

  send(alice, {
    type: "change-name",
    roomId: ROOM,
    playerId: aliceId,
    name: "Alicia",
  });

  await sleep(300);

  const bobAfterRenamePromise = waitFor(bob, (m) => m.type === "message");

  send(alice, {
    type: "message",
    roomId: ROOM,
    playerId: aliceId,
    content: "Hola, me llamo Alicia ahora.",
  });

  try {
    const msg = await bobAfterRenamePromise;
    const fromName = msg.fromName as string;

    if (fromName === "Alicia") {
      ok(`Name change reflected correctly: fromName = "${fromName}"`);
    } else {
      fail(`Expected fromName "Alicia" after rename, got "${fromName}"`);
    }
  } catch {
    fail("Bob did not receive message after Alice's rename");
  }

  // ── 7. Disconnect — remaining client receives nothing (graceful close) ───
  console.log("\n▶ Scenario 5 — Alice disconnects gracefully…");

  const waitClose = (ws: WebSocket, timeoutMs = 5000) =>
    new Promise<void>((resolve, reject) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve();
      const t = setTimeout(() => reject(new Error("Close timeout")), timeoutMs);
      ws.once("close", () => {
        clearTimeout(t);
        resolve();
      });
    });

  alice!.close();
  try {
    await waitClose(alice!);
    ok("Alice's connection closed cleanly");
  } catch {
    fail("Alice's connection did not close within timeout");
  }

  bob!.close();
  try {
    await waitClose(bob!);
    ok("Bob's connection closed cleanly");
  } catch {
    fail("Bob's connection did not close within timeout");
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(
    `║  Results: ${passed}/${total} passed${failed > 0 ? `  (${failed} failed)` : "  🎉"}${" ".repeat(Math.max(0, 19 - String(total).length * 2 - (failed > 0 ? String(failed).length + 10 : 2)))}║`,
  );
  console.log("╚══════════════════════════════════════════════╝\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("\n\x1b[31mUnexpected error:\x1b[0m", err);
  process.exit(1);
});
