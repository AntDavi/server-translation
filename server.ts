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
  const clientId = Math.random().toString(36).slice(2, 8); // ID temporário para debug
  console.log(`[CONNECT] New client connected (tempId=${clientId}). Total clients: ${wss.clients.size}`);

  socket.on("message", async (data) => {
    let payload;

    try {
      payload = JSON.parse(data.toString());
    } catch (e) {
      console.error(`[PARSE] Failed to parse incoming message:`, data.toString(), e);
      return;
    }

    const { type, roomId, playerId, language, content } = payload;

    console.log(`[RECV] type="${type}" roomId="${roomId}" playerId="${playerId}"`);

    if (type === "join") {
      const cleanLanguage = language ? language.trim() : null;

      // Bug fix #3: responder com erro quando campos obrigatórios estão ausentes
      if (!roomId || !playerId || !cleanLanguage) {
        console.warn(
          `[JOIN] Rejecting join — missing fields. roomId=${roomId} playerId=${playerId} language=${language}`,
        );
        socket.send(
          JSON.stringify({
            type: "error",
            code: "INVALID_JOIN",
            message: "roomId, playerId and language are required.",
          }),
        );
        return;
      }

      if (!rooms[roomId]) {
        rooms[roomId] = {};
        console.log(`[JOIN] Room "${roomId}" created`);
      }

      const displayName = payload.name || playerId;
      const isRejoin = !!rooms[roomId][playerId];

      rooms[roomId][playerId] = {
        socket,
        language: cleanLanguage,
        name: displayName,
      };

      console.log(
        `[JOIN] Player "${playerId}" (name="${displayName}") ${isRejoin ? "RE-joined" : "joined"} room "${roomId}" [language=${cleanLanguage}]`,
      );

      // Bug fix #3: confirmar o join para o cliente
      socket.send(
        JSON.stringify({
          type: "join-success",
          playerId,
          roomId,
          language: cleanLanguage,
          name: displayName,
        }),
      );

      // Notificar os outros jogadores da sala
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

    if (type === "change-language") {
      const cleanLanguage = language ? language.trim() : null;

      // Bug fix #2: validar campos e responder com sucesso ou erro
      if (!roomId || !playerId || !cleanLanguage) {
        console.warn(
          `[CHANGE-LANG] Missing fields. roomId=${roomId} playerId=${playerId} language=${language}`,
        );
        socket.send(
          JSON.stringify({
            type: "error",
            code: "INVALID_CHANGE_LANGUAGE",
            message: "roomId, playerId and language are required.",
          }),
        );
        return;
      }

      if (!rooms[roomId] || !rooms[roomId][playerId]) {
        console.warn(
          `[CHANGE-LANG] Player "${playerId}" not found in room "${roomId}" — language not updated`,
        );
        socket.send(
          JSON.stringify({
            type: "error",
            code: "PLAYER_NOT_FOUND",
            message: `Player "${playerId}" is not registered in room "${roomId}". Send a "join" first.`,
          }),
        );
        return;
      }

      const oldLang = rooms[roomId][playerId].language;
      rooms[roomId][playerId].language = cleanLanguage;

      console.log(
        `[CHANGE-LANG] Player "${playerId}" changed language: ${oldLang} → ${cleanLanguage}`,
      );

      socket.send(
        JSON.stringify({
          type: "language-changed",
          playerId,
          roomId,
          language: cleanLanguage,
        }),
      );
    }

    if (type === "change-name") {
      const newName = payload.name ? payload.name.trim() : null;

      if (!roomId || !playerId || !newName) {
        console.warn(
          `[CHANGE-NAME] Missing fields. roomId=${roomId} playerId=${playerId} name=${payload.name}`,
        );
        socket.send(
          JSON.stringify({
            type: "error",
            code: "INVALID_CHANGE_NAME",
            message: "roomId, playerId and name are required.",
          }),
        );
        return;
      }

      if (!rooms[roomId] || !rooms[roomId][playerId]) {
        console.warn(
          `[CHANGE-NAME] Player "${playerId}" not found in room "${roomId}" — name not updated`,
        );
        socket.send(
          JSON.stringify({
            type: "error",
            code: "PLAYER_NOT_FOUND",
            message: `Player "${playerId}" is not registered in room "${roomId}". Send a "join" first.`,
          }),
        );
        return;
      }

      const oldName = rooms[roomId][playerId].name;
      rooms[roomId][playerId].name = newName;

      console.log(
        `[CHANGE-NAME] Player "${playerId}" changed name: "${oldName}" → "${newName}"`,
      );

      socket.send(
        JSON.stringify({
          type: "name-changed",
          playerId,
          roomId,
          name: newName,
        }),
      );
    }

    if (type === "message") {
      // Bug fix: logar quando o jogador não está registrado (era silencioso antes)
      if (!rooms[roomId]) {
        console.warn(
          `[MESSAGE] Room "${roomId}" not found — message from "${playerId}" dropped`,
        );
        socket.send(
          JSON.stringify({
            type: "error",
            code: "ROOM_NOT_FOUND",
            message: `Room "${roomId}" does not exist. Send a "join" first.`,
          }),
        );
        return;
      }

      if (!rooms[roomId][playerId]) {
        console.warn(
          `[MESSAGE] Player "${playerId}" not registered in room "${roomId}" — message dropped`,
        );
        socket.send(
          JSON.stringify({
            type: "error",
            code: "PLAYER_NOT_FOUND",
            message: `Player "${playerId}" is not registered in room "${roomId}". Send a "join" first.`,
          }),
        );
        return;
      }

      const sender = rooms[roomId][playerId];
      const senderLanguage = sender.language;
      const senderName = sender.name;

      console.log(
        `[MESSAGE] From "${senderName}" (${playerId}) [lang=${senderLanguage}] in room "${roomId}": "${content}"`,
      );

      // Echo: devolver a mensagem original ao próprio remetente (sem tradução)
      if (sender.socket.readyState === WebSocket.OPEN) {
        const echoResponse = JSON.stringify({
          type: "message",
          fromId: playerId,
          fromName: senderName,
          originalContent: content,
          translatedContent: content,
          originalLanguage: senderLanguage,
          isEcho: true,
        });

        sender.socket.send(echoResponse);
        console.log(
          `[ECHO] Sent original text back to "${playerId}" [lang=${senderLanguage}]`,
        );
      }

      // Broadcast: traduzir e enviar para cada outro jogador da sala
      const currentRoom = rooms[roomId];
      if (!currentRoom) return;

      const otherPlayers = Object.keys(currentRoom).filter(
        (pid) => pid !== playerId,
      );

      console.log(
        `[BROADCAST] Sending "${senderName}"'s message to ${otherPlayers.length} other player(s)`,
      );

      for (const targetPlayerId of otherPlayers) {
        const targetPlayer = currentRoom[targetPlayerId];

        if (targetPlayer && targetPlayer.socket.readyState === WebSocket.OPEN) {
          try {
            // Bug fix #4: passar senderLanguage como `from` para ativar o short-circuit
            // de mesmo idioma e evitar chamadas desnecessárias à API
            console.log(
              `[TRANSLATE] "${playerId}" (${senderLanguage}) → "${targetPlayerId}" (${targetPlayer.language})`,
            );

            const translatedText = await translate(
              content,
              senderLanguage,
              targetPlayer.language,
            );

            console.log(
              `[TRANSLATE] Result for "${targetPlayerId}": "${translatedText}"`,
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
            console.error(
              `[TRANSLATE] Error translating for "${targetPlayerId}":`,
              err,
            );
          }
        } else {
          console.warn(
            `[BROADCAST] Skipping "${targetPlayerId}" — socket not open (state=${targetPlayer?.socket.readyState})`,
          );
        }
      }
    }
  });

  socket.on("close", (code, reason) => {
    console.log(
      `[DISCONNECT] Client disconnected (tempId=${clientId}, code=${code}, reason="${reason.toString() || "none"}"). Remaining clients: ${wss.clients.size}`,
    );
    removePlayer(socket);
  });

  socket.on("error", (err) => {
    console.error(`[SOCKET ERROR] (tempId=${clientId}):`, err.message);
  });
});

console.log("🚀 Server started on port 8080");
