// Gère automatiquement ws:// en local et wss:// en production

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const messagesDiv = document.getElementById('messages');
const form = document.getElementById('chat-form');
const msgInput = document.getElementById('msg-input');
const unInput = document.getElementById('un-input');
const fileInput = document.getElementById('file-input');
const sendBtn = document.getElementById('send-btn');

try {
    unInput.value = localStorage.getItem("username") || "";
} catch (e) {
    console.warn("Stockage local inaccessible :", e);
}

// Réception des messages et reconnexion automatique
let ws;
function connect() {
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    ws.onmessage = async (event) => {
        const rawData = event.data instanceof Blob ? await event.data.text() : event.data;
        try {
            const msg = JSON.parse(rawData);
            if (msg.type === 'history') {
                messagesDiv.innerHTML = '';
                const myName = unInput.value.trim();
                msg.messages.forEach((m) => addMessage(m.username, m.text, Boolean(myName && m.username === myName)));
                return;
            }
            addMessage(msg.username || 'Anonyme', msg.text, false);
        } catch (e) {
            console.error("Erreur : le message reçu n'est pas un JSON valide", e);
        }
    };
    // ponytail: 1s fixed retry, add exponential backoff if thundering herd matters
    ws.onclose = () => setTimeout(connect, 1000);
}
connect();

// Envoi des messages et upload de fichier via tmpfiles.org
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ws.readyState !== WebSocket.OPEN) return;

    let text = msgInput.value.trim();
    const username = unInput.value.trim() || 'Anonyme';
    const file = fileInput.files[0];

    if (!text && !file) return;

    if (file) {
        sendBtn.disabled = true;
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd });
            const { data } = await res.json();
            if (data && data.url) {
                text = text ? `${text} ${data.url}` : data.url;
            }
            fileInput.value = '';
        } catch (err) {
            console.error("Erreur lors de l'envoi du fichier :", err);
            sendBtn.disabled = false;
            return;
        }
        sendBtn.disabled = false;
    }

    if (text) {
        ws.send(JSON.stringify({ username, text }));
        addMessage(username, text, true);
        msgInput.value = '';
    }
});

unInput.addEventListener('change', (e) => {
    try {
        localStorage.setItem("username", unInput.value.trim());
    } catch (e) { }
})

// Affichage dans le DOM avec protection XSS et liens cliquables
function addMessage(username, text, isMe) {
    const div = document.createElement('div');
    div.className = isMe ? 'msg me' : 'msg';

    const userSpan = document.createElement('span');
    userSpan.className = 'username';
    userSpan.textContent = username;

    div.appendChild(userSpan);
    div.append(': ');

    // Affichage des liens
    for (const part of text.split(/(https?:\/\/\S+)/g)) {
        if (/^https?:\/\/\S+$/.test(part)) {
            const a = document.createElement('a');
            a.href = part;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = part;
            div.appendChild(a);
        } else {
            div.append(part);
        }
    }

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}