const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 1024 * 10 });

const messageTimestamps = new WeakMap();
const history = [];

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    messageTimestamps.set(ws, 0);

    ws.send(JSON.stringify({ type: 'history', messages: history }));

    ws.on('message', (rawData) => {
        const now = Date.now();
        const lastMsgTime = messageTimestamps.get(ws) || 0;
        if (now - lastMsgTime < 500) {
            return;
        }
        messageTimestamps.set(ws, now);

        let parsed;
        try {
            parsed = JSON.parse(rawData.toString());
        } catch (err) {
            return;
        }

        const username = typeof parsed.username === 'string' ? parsed.username.trim() : 'Anonyme';
        const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';

        if (!text || text.length > 2000 || username.length > 50) {
            return;
        }

        const msg = {
            username: username || 'Anonyme',
            text: text
        };
        history.push(msg);
        if (history.length > 50) history.shift();

        const broadcastPayload = JSON.stringify(msg);

        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(broadcastPayload);
            }
        });
    });
});

// Heartbeat pour contrer le timeout de 100s de Cloudflare
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(3000, () => {
    console.log('Serveur chat démarré sur le port 3000');
});
