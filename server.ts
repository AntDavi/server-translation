import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { translate } from "./translator.js";

const wss = new WebSocketServer({ port: 8080 });

interface Player {
  socket: WebSocket;
  language: string;
  name: string;
}

interface Room {
  [playerId: string]: Player;
}

const rooms: Record<string, Room> = {};

function removePlayer(socket: WebSocket) {
  for (const roomId in rooms) {
    if (!rooms.hasOwnProperty(roomId)) continue;
    const room = rooms[roomId];

    for (const playerId in room) {
      if (!Object.prototype.hasOwnProperty.call(room, playerId)) continue;

      const player = room[playerId];
      if (player && player.socket === socket) {
        delete room[playerId];
        console.log(`❌ Player ${playerId} removed from room ${roomId}`);

        if (Object.keys(room).length === 0) {
          delete rooms[roomId];
          console.log(`🗑️ Room ${roomId} deleted (empty)`);
        }
        return;
      }
    }
  }
}

wss.on("connection", (socket) => {
  console.log("🔌 Client connected");

  socket.on("message", async (data) => {
    let payload;

    try {
      payload = JSON.parse(data.toString());
    } catch (e) {
      console.error("Failed to parse message", e);
      return;
    }

    const { type, roomId, playerId, language, name, content } = payload;

    if (type === "join") {
      if (!roomId || !playerId || !language) {
        return;
      }

      if (!rooms[roomId]) {
        rooms[roomId] = {};
      }

      const displayName = name || playerId;

      rooms[roomId][playerId] = {
        socket,
        language,
        name: displayName,
      };

      console.log(
        `👋 Player ${displayName} (${playerId}) joined room ${roomId} [${language}]`
      );

      // Notify others in room (optional, but good for feedback)
      const joinMessage = JSON.stringify({
        type: "info",
        content: `${displayName} joined the room.`,
      });

      const currentRoom = rooms[roomId];
      if (currentRoom) {
        Object.keys(currentRoom).forEach((pid) => {
          const player = currentRoom[pid];
          if (
            pid !== playerId &&
            player &&
            player.socket.readyState === WebSocket.OPEN
          ) {
            player.socket.send(joinMessage);
          }
        });
      }
    }

    if (type === "message") {
      if (!rooms[roomId] || !rooms[roomId][playerId]) {
        return;
      }

      const sender = rooms[roomId][playerId];
      const senderLanguage = sender.language;
      const senderName = sender.name;

      console.log(
        `💬 Message from ${senderName} (${playerId}) in ${roomId}: ${content}`
      );

      // Broadcast to other players in the room
      const currentRoom = rooms[roomId];
      if (!currentRoom) return;

      for (const targetPlayerId in currentRoom) {
        // if (targetPlayerId === playerId) continue; // Uncomment if you don't want echo

        const targetPlayer = currentRoom[targetPlayerId];

        if (targetPlayer && targetPlayer.socket.readyState === WebSocket.OPEN) {
          try {
            // Translate message to target player's language
            const translatedText = await translate(
              content,
              senderLanguage,
              targetPlayer.language
            );

            const response = JSON.stringify({
              type: "message",
              fromId: playerId,
              fromName: senderName,
              originalContent: content,
              translatedContent: translatedText,
              originalLanguage: senderLanguage,
            });

            targetPlayer.socket.send(response);
          } catch (err) {
            console.error("Translation error:", err);
          }
        }
      }
    }
  });

  socket.on("close", () => {
    console.log("🔌 Client disconnected");
    removePlayer(socket);
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });
});

console.log("🚀 Server started on port 8080");
