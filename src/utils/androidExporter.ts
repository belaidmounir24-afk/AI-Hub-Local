export function generateAndroidIndexHtml(
  endpoint = 'http://127.0.0.1:11434',
  model = 'qwen:7b'
): string {
  const cleanEndpoint = endpoint.trim().replace(/\/+$/, '') || 'http://127.0.0.1:11434';
  const cleanModel = model.trim() || 'qwen:7b';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>AI OS - Autonome</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #050505; color: #00ffcc; font-family: monospace; overflow: hidden; }
        .glass { background: rgba(15, 15, 15, 0.95); border: 1px solid #1a1a1a; }
        .neon-border { border: 1px solid #00ffcc; box-shadow: 0 0 10px rgba(0, 255, 204, 0.2); }
        .app-card:active { background: rgba(0, 255, 204, 0.2); }
    </style>
</head>
<body class="h-screen w-screen flex flex-col p-2">

    <!-- HEADER SYSTEME AVEC RADAR DE STATUT -->
    <header class="flex justify-between items-center mb-2 p-2 border-b border-gray-800 text-xs">
        <div>OS: <span class="text-green-500">ACTIF</span></div>
        <div id="server-status" class="text-yellow-500">Vérif. Ollama...</div>
    </header>

    <div class="flex flex-col flex-1 gap-2 overflow-hidden">
        <!-- BARRE D'APPLICATIONS -->
        <div class="flex gap-2 overflow-x-auto pb-2">
            <button type="button" onclick="openApp('chat')" class="app-card glass p-3 rounded border border-gray-800 shrink-0 cursor-pointer text-left">
                <div class="text-xs text-cyan-400 font-bold">CHAT MÉMOIRE + STREAM</div>
            </button>
        </div>

        <!-- ZONE D'AFFICHAGE PRINCIPALE -->
        <main id="screen" class="flex-1 glass neon-border relative flex flex-col p-4 rounded-lg overflow-hidden">
            <div id="welcome-msg" class="flex flex-col items-center justify-center h-full text-center">
                <p class="text-sm">CHOISIS UNE APPLICATION</p>
                <p class="text-[10px] mt-2 opacity-50">INTÉGRÉ DANS TON ANDROID (${cleanModel})</p>
            </div>

            <div id="app-container" class="hidden w-full h-full flex flex-col"></div>
        </main>
    </div>

    <script>
        const OLLAMA_ENDPOINT = ${JSON.stringify(cleanEndpoint)};
        const OLLAMA_MODEL = ${JSON.stringify(cleanModel)};
        const STORAGE_KEY = 'chat_history_v2';

        const apps = {
            'chat': {
                title: 'Chat IA Mobile',
                content: \`
                    <div class="flex flex-col h-full justify-between">
                        <div class="flex justify-between items-center text-xs font-bold mb-2 pb-1 border-b border-gray-800">
                            <span>Assistant Local (\${OLLAMA_MODEL})</span>
                            <button type="button" onclick="clearHistory()" class="text-[10px] text-red-400 border border-red-900 px-2 py-1 rounded">Effacer mémoire</button>
                        </div>
                        <div id="chat-history" class="flex-1 overflow-y-auto p-2 space-y-2 text-xs bg-black/50 rounded mb-2"></div>
                        <div class="flex gap-1">
                            <input type="text" id="user-input" placeholder="Écris ton message..." class="flex-1 bg-black border border-cyan-500/50 p-2 text-xs text-cyan-300 rounded focus:outline-none">
                            <button type="button" onclick="sendMessage()" class="bg-cyan-900/40 border border-cyan-500 px-3 py-2 text-xs rounded">Envoyer</button>
                        </div>
                    </div>
                \`
            }
        };

        let messages = [];

        async function checkServer() {
            const statusEl = document.getElementById('server-status');
            try {
                const res = await fetch(OLLAMA_ENDPOINT + '/', { method: 'GET' });
                if (res.ok) {
                    statusEl.textContent = "Ollama Prêt";
                    statusEl.className = "text-green-400";
                } else {
                    throw new Error();
                }
            } catch (e) {
                statusEl.textContent = "Ollama Hors Ligne";
                statusEl.className = "text-red-500";
            }
        }
        setInterval(checkServer, 5000);
        checkServer();

        function openApp(appKey) {
            document.getElementById('welcome-msg').classList.add('hidden');
            const container = document.getElementById('app-container');
            container.classList.remove('hidden');
            container.innerHTML = apps[appKey].content;
            const input = document.getElementById('user-input');
            if (input) {
                input.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') sendMessage();
                });
            }
            loadHistory();
        }

        function renderHistory() {
            const history = document.getElementById('chat-history');
            if (!history) return;
            history.innerHTML = '';
            if (messages.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'text-gray-500';
                empty.textContent = 'Mémoire vide. Pose ta première question !';
                history.appendChild(empty);
                return;
            }
            for (const msg of messages) {
                const row = document.createElement('div');
                row.className = msg.role === 'user' ? 'text-right text-cyan-200 whitespace-pre-wrap' : 'text-green-400 mt-1 whitespace-pre-wrap';
                row.textContent = (msg.role === 'user' ? 'Moi : ' : 'IA : ') + msg.text;
                history.appendChild(row);
            }
            history.scrollTop = history.scrollHeight;
        }

        function loadHistory() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                messages = saved ? JSON.parse(saved) : [];
            } catch {
                messages = [];
            }
            renderHistory();
        }

        function saveHistory() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
            } catch {}
        }

        function clearHistory() {
            messages = [];
            localStorage.removeItem(STORAGE_KEY);
            renderHistory();
        }

        async function sendMessage() {
            const input = document.getElementById('user-input');
            const history = document.getElementById('chat-history');
            const text = input.value.trim();
            if (!text) return;

            messages.push({ role: 'user', text });
            input.value = '';
            renderHistory();

            const aiRow = document.createElement('div');
            aiRow.className = 'text-green-400 mt-1 whitespace-pre-wrap';
            aiRow.textContent = 'IA : ...';
            history.appendChild(aiRow);
            history.scrollTop = history.scrollHeight;

            try {
                const response = await fetch(OLLAMA_ENDPOINT + '/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: OLLAMA_MODEL,
                        prompt: text,
                        stream: true
                    })
                });

                if (!response.ok) throw new Error("Erreur serveur");

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullReply = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.trim() !== '') {
                            const parsed = JSON.parse(line);
                            if (parsed.response) {
                                fullReply += parsed.response;
                                aiRow.textContent = 'IA : ' + fullReply;
                                history.scrollTop = history.scrollHeight;
                            }
                        }
                    }
                }

                messages.push({ role: 'assistant', text: fullReply });
                saveHistory();
            } catch (error) {
                aiRow.className = 'text-red-400 mt-1';
                aiRow.textContent = "Erreur : Lance 'OLLAMA_ORIGINS=\\"*\\" ollama serve' dans Termux.";
            }
        }
    </script>
</body>
</html>
`;
}

export function generateUpdateProjectPy(
  endpoint = 'http://127.0.0.1:11434',
  model = 'qwen:7b'
): string {
  const html = generateAndroidIndexHtml(endpoint, model).replace(/"""/g, '\\"\\"\\"');
  return `import os

html_content = """${html}"""

target_dir = "app/src/main/assets"
target_file = os.path.join(target_dir, "index.html")

try:
    os.makedirs(target_dir, exist_ok=True)
    with open(target_file, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"[SUCCÈS] Le fichier a été généré et mis à jour avec succès dans : {target_file}")
except Exception as e:
    print(f"[ERREUR] Impossible de créer le fichier : {e}")
`;
}

export function triggerTextDownload(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
