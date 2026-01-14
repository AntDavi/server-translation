import WebSocket from "ws";
import * as readline from "readline";
import { randomUUID } from "crypto";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

async function main() {
  console.log("============================================");
  console.log("🌐  TRANSLATION CHAT CLIENT");
  console.log("============================================");

  // 1. Configurar Cliente
  const name = await ask("👤 Seu Nome: ");
  if (!name.trim()) {
    console.log("❌ Nome é obrigatório!");
    process.exit(1);
  }

  const roomId = (await ask("🏠 Sala (padrão: room-1): ")).trim() || "room-1";
  const language =
    (await ask("🏳️  Idioma (padrão: pt-BR): ")).trim() || "pt-BR";
  const serverIp =
    (await ask("🖥️  IP do Servidor (padrão: localhost): ")).trim() ||
    "localhost";

  const playerId = `player-${randomUUID().split("-")[0]}`; // ID único curto

  console.log("\n⏳ Conectando ao servidor...");

  // 2. Conectar WebSocket
  const ws = new WebSocket(`ws://${serverIp}:8080`);

  ws.on("open", () => {
    console.log(`✅ Conectado! ID: ${playerId}`);
    console.log(`💬 Pode começar a digitar suas mensagens abaixo:\n`);

    // Enviar JOIN
    ws.send(
      JSON.stringify({
        type: "join",
        roomId,
        playerId,
        name: name,
        language,
      })
    );
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === "message") {
      // Exibir mensagem recebida
      // fromName vem do servidor se tiver sido atualizado, senão fallback
      const sender = msg.fromName || "Desconhecido";
      const text = msg.translatedContent;

      // Limpa a linha atual (onde o usuário pode estar digitando) para mostrar a mensagem
      readline.cursorTo(process.stdout, 0);
      console.log(`\x1b[36m[${sender}]\x1b[0m: ${text}`);
      rl.prompt(true); // Redesenha o prompt
    } else if (msg.type === "info") {
      console.log(`\x1b[90mℹ️  ${msg.content}\x1b[0m`);
    }
  });

  ws.on("error", (err) => {
    console.error("❌ Erro de conexão:", err.message);
    process.exit(1);
  });

  ws.on("close", () => {
    console.log("🔌 Desconectado do servidor.");
    process.exit(0);
  });

  // 3. Loop de Input de Mensagem
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed && ws.readyState === WebSocket.OPEN) {
      if (trimmed.startsWith("/lang ")) {
        const newLang = trimmed.split(" ")[1];
        if (newLang) {
          ws.send(
            JSON.stringify({
              type: "change-language",
              roomId,
              playerId,
              language: newLang,
            })
          );
          console.log(
            `\x1b[90mℹ️  Solicitando troca de idioma para: ${newLang}\x1b[0m`
          );
        } else {
          console.log(`\x1b[91m❌ Use: /lang <código>\x1b[0m`);
        }
        rl.prompt(true);
        return;
      }

      // Pula uma linha no console do próprio remetente para não sobrescrever
      readline.moveCursor(process.stdout, 0, -1);
      readline.clearLine(process.stdout, 0);
      console.log(`\x1b[32m[Você]\x1b[0m: ${line}`);

      ws.send(
        JSON.stringify({
          type: "message",
          roomId,
          playerId, // O servidor usa isso para saber quem mandou
          content: line,
        })
      );
    }
    rl.prompt(true);
  });
}

main();
