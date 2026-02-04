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
# Para clonar o projeto
git clone https://github.com/AntDavi/server-translation.git

# Instale as dependecias com
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
# Para iniciar o servidor
npm run dev
```
---

## 📡 Protocolo de Comunicação (WebSocket)

O servidor roda por padrão na porta **8080**.
Mas é possivel fazer essa alteração em server.ts

```
const wss = new WebSocketServer({ port: 8080 });
```

### 1. Conectar e Entrar na Sala (`join`)
Assim que conectar o socket, envie este JSON para registrar o jogador. Você pode enviar um campo `name` para definir seu nome de exibição. Se não for enviado, o `playerId` será usado como nome.

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

### 4. Mudar de Idioma (`change-language`)
Permite alterar o idioma de recebimento sem precisar desconectar e reconectar.

**Envio (Cliente -> Servidor):**
```json
{
  "type": "change-language",
  "roomId": "sala-01",
  "playerId": "jogador-123",
  "language": "es-ES"
}
```

### 5. Mudar de Nome (`change-name`)
Permite alterar o nome de exibição sem precisar desconectar e reconectar.

**Envio (Cliente -> Servidor):**
```json
{
  "type": "change-name",
  "roomId": "sala-01",
  "playerId": "jogador-123",
  "name": "NovoNome"
}
```

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

> **Dica:** Durante o chat, use o comando `/lang <codigo>` para mudar seu idioma em tempo real.
> Exemplo: `/lang ja-JP` mudará suas traduções recebidas para Japonês.

---
