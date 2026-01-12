# Server Translation - Chat em Tempo Real com Azure

Este projeto é um servidor WebSocket em Node.js projetado para intermediar salas de chat onde os participantes falam idiomas diferentes. O servidor utiliza a **Azure Translator API** para traduzir mensagens em tempo real para o idioma nativo de cada destinatário.

## 🚀 Funcionalidades

- **Salas Isoladas:** Suporte a múltiplas salas de chat (`roomId`).
- **Tradução em Tempo Real:** Cada jogador define seu idioma ao entrar. O servidor traduz o que ele recebe para o idioma dele.
- **Eficiência:** Se o remetente e o destinatário falam o mesmo idioma, a API de tradução não é consumida.
- **TypeScript:** Código fortemente tipado para maior segurança.

---

## 🛠️ Configuração e Instalação

### 1. Pré-requisitos
- Node.js (v18+)
- Conta na Azure com recurso **Translator** criado.

### 2. Instalação
Clone o projeto e instale as dependências:
```bash
pnpm install
# ou
npm install
```

### 3. Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto e preencha com suas credenciais da Azure (veja as referência abaixo):

```ini
AZURE_API_ENDPOINT=https://api.cognitive.microsofttranslator.com/
AZURE_API_KEY=sua_chave_aqui
AZURE_REGION=brazilsouth
```

### 4. Rodando o Servidor
```bash
# Modo de desenvolvimento (reinicia ao salvar)
pnpm dev

# Modo de produção
pnpm start
```

---

## 📡 Protocolo de Comunicação (WebSocket)

O servidor roda por padrão na porta **8080**.

### 1. Conectar e Entrar na Sala (`join`)
Assim que conectar o socket, envie este JSON para registrar o jogador e identificar seu nome.

**Envio (Cliente -> Servidor):**
```json
{
  "type": "join",
  "roomId": "sala-01",
  "playerId": "jogador-123",
  "name": "SuperPlayer",
  "language": "pt-BR"
}
```
*Idiomas suportados:* Códigos ISO (ex: `pt-BR`, `en-US`, `es-ES`, `ja-JP`, `fr-FR`).

### 2. Enviar Mensagem (`message`)
Para enviar um texto para a sala.

**Envio (Cliente -> Servidor):**
```json
{
  "type": "message",
  "roomId": "sala-01",
  "playerId": "jogador-123",
  "content": "Olá amigos, vamos jogar!"
}
```

### 3. Receber Mensagem Traduzida
O servidor processa a mensagem e envia para **todos os outros** jogadores da sala. O conteúdo chegará traduzido para o idioma que o destinatário definiu no `join`.

**Recebimento (Servidor -> Cliente):**
```json
{
  "type": "message",
  "fromId": "jogador-123",
  "fromName": "SuperPlayer",
  "originalContent": "Olá amigos, vamos jogar!",
  "translatedContent": "Hello friends, let's play!", 
  "originalLanguage": "pt-BR"
}
```
*Nota: Se o destinatário também for `pt-BR`, `translatedContent` será igual ao original.*

---

## 🧪 Como Testar

O projeto inclui um script `main.ts` interativo para testar a conexão via terminal.

1. Inicie o servidor em um terminal:
```bash
pnpm dev
```

2. Abra quantos terminais quiser para simular os clientes e rode:
```bash
npx tsx main.ts
```

3. O script irá solicitar:
   - **Nome:** Seu nome de exibição.
   - **Sala:** ID da sala (use o mesmo ID em terminais diferentes para conversar).
   - **Idioma:** Seu código de idioma (ex: `pt-BR`, `en-US`).

4. Converse no terminal! As mensagens serão traduzidas automaticamente dependendo do idioma escolhido por cada cliente.

---

## 🎮 Integração com Unity (Netcode for GameObjects)

Abaixo está um exemplo de arquitetura de como integrar este servidor em um projeto Unity. Recomenda-se usar a biblioteca [NativeWebSocket](https://github.com/endel/NativeWebSocket) para lidar com WS na Unity.

### Exemplo: `ChatManager.cs`

Este script pega o ID do jogador do **Netcode for GameObjects** (`NetworkManager.Singleton.LocalClientId`) para usar como `playerId` no chat, garantindo sincronia entre o jogo e o chat.

```csharp
using UnityEngine;
using NativeWebSocket;
using Unity.Netcode;
using System.Text;
using System.Threading.Tasks;

// Requer pacote Newtonsoft.Json (comum em projetos Unity modernos)
using Newtonsoft.Json; 

public class ChatManager : NetworkBehaviour
{
    WebSocket websocket;
    public string serverUrl = "ws://localhost:8080";
    
    // Configurações do Lobby
    public string currentRoomId = "lobby-geral";
    public string myLanguage = "pt-BR"; // Isso pode vir de um PlayerPrefs

    async void Start()
    {
        // Só conecta se o Netcode já estiver rodando ou conecta manualmente
        if (NetworkManager.Singleton.IsClient)
        {
            await ConnectToChat();
        }
    }

    void Update()
    {
        #if !UNITY_WEBGL || UNITY_EDITOR
            websocket?.DispatchMessageQueue();
        #endif
    }

    private async Task ConnectToChat()
    {
        websocket = new WebSocket(serverUrl);

        websocket.OnOpen += () =>
        {
            Debug.Log("Chat Conectado!");
            SendJoin();
        };

        websocket.OnError += (e) => Debug.Log("Erro Chat: " + e);
        websocket.OnClose += (e) => Debug.Log("Chat Fechado: " + e);

        websocket.OnMessage += (bytes) =>
        {
            var message = Encoding.UTF8.GetString(bytes);
            HandleMessage(message);
        };

        await websocket.Connect();
    }

    private void SendJoin()
    {
        // Usa o ID do Netcode para vincular o jogador do jogo ao chat
        ulong netcodeId = NetworkManager.Singleton.LocalClientId;

        var payload = new
        {
            type = "join",
            roomId = currentRoomId,
            playerId = "player-" + netcodeId, // Ex: player-0, player-1
            name = "Player " + netcodeId, // Nome que aparecerá para os outros
            language = myLanguage
        };

        SendJson(payload);
    }

    public void SendChatMessage(string text)
    {
        ulong netcodeId = NetworkManager.Singleton.LocalClientId;

        var payload = new
        {
            type = "message",
            roomId = currentRoomId,
            playerId = "player-" + netcodeId,
            content = text
        };

        SendJson(payload);
    }

    private void HandleMessage(string json)
    {
        // Exemplo simples de parsing usando JsonUtility ou Newtonsoft
        // Dica: Crie classes para mapear o JSON recebido
        Debug.Log("Mensagem Recebida: " + json);
        
        // Aqui você atualizaria a UI do chat na tela (TextMeshPro)
    }

    private async void SendJson(object data)
    {
        if (websocket.State == WebSocketState.Open)
        {
            string json = JsonConvert.SerializeObject(data);
            await websocket.SendText(json);
        }
    }

    private async void OnApplicationQuit()
    {
        if (websocket != null) await websocket.Close();
    }
}
```

### Fluxo na Unity:
1. O jogo inicia e conecta ao Netcode (Host/Client).
2. O `ChatManager` inicializa o WebSocket.
3. No `OnOpen`, ele envia o `join` usando o ID do Netcode.
4. Quando o jogador digita no InputField da UI e aperta Enter, chama `SendChatMessage`.
5. O servidor traduz e devolve.
6. O `OnMessage` recebe o JSON, desserializa e exibe o texto (`translatedContent`) na UI do jogo.
