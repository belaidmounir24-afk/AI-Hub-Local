import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import {
  Send,
  Square,
  RefreshCw,
  Copy,
  Check,
  Volume2,
  Terminal,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  User,
  Bot,
  Trash2,
} from 'lucide-react';
import { OllamaConfig, OllamaMessage } from '../types';
import {
  OllamaTagsResult,
  generateOllamaResponse,
  normalizeEndpoint,
} from '../utils/ollamaClient';

interface OllamaChatAppProps {
  config: OllamaConfig;
  onUpdateConfig: (next: OllamaConfig) => void;
  ollamaStatus: OllamaTagsResult | null;
  isCheckingOllama: boolean;
  onProbeOllama: () => void;
  messages: OllamaMessage[];
  setMessages: React.Dispatch<React.SetStateAction<OllamaMessage[]>>;
  onSpeakText: (text: string, messageId: string) => void;
  currentPlayingId: string | null;
  autoRead: boolean;
}

const QUICK_PROMPTS = [
  'Explique comment configurer Ollama dans Termux',
  'Écris un script bash de sauvegarde Android',
  'Résume les bonnes pratiques de sécurité locale',
];

export const OllamaChatApp: React.FC<OllamaChatAppProps> = ({
  config,
  onUpdateConfig,
  ollamaStatus,
  isCheckingOllama,
  onProbeOllama,
  messages,
  setMessages,
  onSpeakText,
  currentPlayingId,
  autoRead,
}) => {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customModelInput, setCustomModelInput] = useState(config.model);

  const abortControllerRef = useRef<AbortController | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isReachable = ollamaStatus ? ollamaStatus.reachable : null;
  const installedModels = ollamaStatus?.models || [];
  const connectionNote = ollamaStatus?.reachable
    ? installedModels.length > 0
      ? `${installedModels.length} modèle${installedModels.length > 1 ? 's' : ''} détecté${installedModels.length > 1 ? 's' : ''}`
      : 'Serveur prêt'
    : ollamaStatus?.error || 'Radar actif (5s)';

  useEffect(() => {
    setCustomModelInput(config.model);
  }, [config.model]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, isGenerating]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignorer
    }
  };

  const handleClearMemory = () => {
    if (isGenerating) {
      handleStopGeneration();
    }
    setMessages([]);
  };

  const handleStopGeneration = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
  };

  const handleSend = async (overrideText?: string) => {
    const promptText = (overrideText ?? input).trim();
    if (!promptText || isGenerating) return;

    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMsg: OllamaMessage = {
      id: `ol_u_${Date.now()}`,
      role: 'user',
      text: promptText,
      timestamp,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!overrideText) setInput('');
    setIsGenerating(true);
    setStreamingText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await generateOllamaResponse({
        endpoint: config.endpoint,
        model: config.model || 'qwen:7b',
        prompt: promptText,
        systemPrompt: config.systemPrompt,
        history: messages,
        stream: config.stream,
        signal: controller.signal,
        onToken: (acc) => {
          setStreamingText(acc);
        },
      });

      const assistantMsg: OllamaMessage = {
        id: `ol_a_${Date.now()}`,
        role: 'assistant',
        text: result.response,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        model: result.model,
        durationMs: result.durationMs,
        evalCount: result.evalCount,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      onProbeOllama();

      if (autoRead) {
        onSpeakText(assistantMsg.text, assistantMsg.id);
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (isAbort) {
        if (streamingText.trim()) {
          setMessages((prev) => [
            ...prev,
            {
              id: `ol_a_${Date.now()}`,
              role: 'assistant',
              text: `${streamingText.trim()} (interrompu)`,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              model: config.model,
            },
          ]);
        }
      } else {
        const rawErr = err instanceof Error ? err.message : String(err);
        const errorText = `Erreur de connexion à ${normalizeEndpoint(config.endpoint)} (${rawErr}). Vérifie que 'OLLAMA_ORIGINS="*" ollama serve' tourne dans Termux sur le port 11434 et que le modèle '${config.model}' est installé.`;
        onProbeOllama();
        setMessages((prev) => [
          ...prev,
          {
            id: `ol_err_${Date.now()}`,
            role: 'assistant',
            text: errorText,
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            isError: true,
          },
        ]);
      }
    } finally {
      abortControllerRef.current = null;
      setStreamingText('');
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const availableModelOptions = Array.from(
    new Set([config.model, 'qwen:7b', 'llama3.2', 'mistral', ...installedModels].filter(Boolean))
  );

  return (
    <div className="flex-1 flex flex-col w-full max-w-5xl mx-auto px-3 sm:px-6 pb-36 pt-4">
      {/* Barre d'état et contrôle du moteur local */}
      <section className="mb-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 dark:text-white truncate">
                Assistant Local (Mémoire + Stream)
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  {isReachable === true ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  )}
                  <span
                    className={
                      isReachable === true
                        ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                        : 'text-slate-600 dark:text-slate-400'
                    }
                  >
                    {isCheckingOllama && isReachable === null
                      ? 'Vérif. Ollama...'
                      : isReachable === true
                      ? 'Ollama Prêt'
                      : 'Ollama Hors Ligne'}
                  </span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono truncate">{config.endpoint}</span>
                {connectionNote && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{connectionNote}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearMemory}
                className="min-h-[44px] px-3 rounded-xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Effacer mémoire</span>
              </button>
            )}

            <button
              type="button"
              onClick={onProbeOllama}
              disabled={isCheckingOllama}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingOllama ? 'animate-spin' : ''}`} />
              <span>Tester</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfigDrawer((prev) => !prev)}
              aria-expanded={showConfigDrawer}
              className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                showConfigDrawer
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Paramètres</span>
            </button>
          </div>
        </div>

        {/* Sélecteur rapide modèle & mode streaming */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <label
              htmlFor="ollama-model-select"
              className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
            >
              Modèle :
            </label>
            <select
              id="ollama-model-select"
              value={config.model}
              onChange={(e) => onUpdateConfig({ ...config, model: e.target.value })}
              className="flex-1 min-h-[40px] px-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {availableModelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onUpdateConfig({ ...config, stream: true })}
              className={`min-h-[36px] px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                config.stream
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Streaming
            </button>
            <button
              type="button"
              onClick={() => onUpdateConfig({ ...config, stream: false })}
              className={`min-h-[36px] px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                !config.stream
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Standard
            </button>
          </div>
        </div>

        {/* Panneau avancé endpoint & modèle personnalisé */}
        {showConfigDrawer && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="ollama-endpoint-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Adresse serveur Ollama
                </label>
                <input
                  id="ollama-endpoint-input"
                  type="url"
                  value={config.endpoint}
                  onChange={(e) => onUpdateConfig({ ...config, endpoint: e.target.value })}
                  placeholder="http://127.0.0.1:11434"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({ ...config, endpoint: 'http://127.0.0.1:11434' })
                    }
                    className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    127.0.0.1:11434 (Termux)
                  </button>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({ ...config, endpoint: 'http://10.0.2.2:11434' })
                    }
                    className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    10.0.2.2:11434 (Émulateur)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="ollama-custom-model"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Nom de modèle personnalisé
                </label>
                <div className="flex gap-2">
                  <input
                    id="ollama-custom-model"
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="ex: qwen:7b"
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        model: customModelInput.trim() || 'qwen:7b',
                      })
                    }
                    className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-500 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Alerte pédagogique si Ollama est hors-ligne */}
      {isReachable === false && messages.length === 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-950 dark:text-amber-200">
              <p className="font-semibold">
                Serveur Ollama local non détecté sur {config.endpoint}
              </p>
              <p className="opacity-90 leading-relaxed">
                Ouvre Termux sur ton Android et exécute la commande ci-dessous pour démarrer Ollama avec l'autorisation WebView :
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-900/50">
            <code className="text-xs font-mono text-slate-900 dark:text-emerald-400 truncate">
              OLLAMA_ORIGINS="*" ollama serve
            </code>
            <button
              type="button"
              onClick={() => handleCopy('OLLAMA_ORIGINS="*" ollama serve', 'termux-help')}
              className="min-h-[40px] px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0"
            >
              {copiedId === 'termux-help' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Fil de discussion ou état initial */}
      {messages.length === 0 && !isGenerating ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center space-y-5">
          <div className="space-y-1.5 max-w-md">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Mémoire vide · Pose ta première question
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vos messages sont sauvegardés localement et envoyés vers <span className="font-mono">{config.endpoint}</span> avec le modèle <span className="font-mono">{config.model}</span>.
            </p>
          </div>

          <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSend(q)}
                className="min-h-[44px] p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isPlayingThis = currentPlayingId === msg.id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}
              >
                <div className="flex items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${
                      isUser ? 'bg-slate-800 dark:bg-slate-700' : 'bg-emerald-600'
                    }`}
                  >
                    {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {isUser ? 'Moi' : `Ollama (${msg.model || config.model})`}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 shadow-xs ${
                    isUser
                      ? 'bg-slate-900 text-white rounded-tr-xs dark:bg-emerald-950 dark:border dark:border-emerald-800/60'
                      : msg.isError
                      ? 'bg-rose-50 text-rose-950 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900/60 rounded-tl-xs'
                      : 'bg-white text-slate-900 border border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800 rounded-tl-xs'
                  }`}
                >
                  <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                    {msg.text}
                  </div>

                  {!isUser && !msg.isError && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                        {typeof msg.durationMs === 'number' && (
                          <span>{(msg.durationMs / 1000).toFixed(2)}s</span>
                        )}
                        {typeof msg.evalCount === 'number' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{msg.evalCount} tokens</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSpeakText(msg.text, msg.id)}
                          className={`min-h-[44px] px-3 -my-2 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                            isPlayingThis
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {isPlayingThis ? (
                            <>
                              <Square className="w-3.5 h-3.5 fill-current" />
                              <span>Arrêter</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              <span>Écouter</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopy(msg.text, msg.id)}
                          className="min-h-[44px] min-w-[44px] -my-2 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          aria-label="Copier la réponse"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isGenerating && (
            <div className="flex flex-col items-start space-y-1.5">
              <div className="flex items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5" />
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Ollama ({config.model})
                </span>
                <span>Génération en cours...</span>
              </div>

              <div className="max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-tl-xs p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs text-sm leading-relaxed whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                {streamingText || 'Connexion au serveur local Termux...'}
              </div>
            </div>
          )}

          <div ref={endOfMessagesRef} />
        </div>
      )}

      {/* Barre de saisie fixée en bas */}
      <div className="fixed bottom-0 left-0 w-full z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-2.5 pb-safe pb-3">
          <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 focus-within:ring-2 focus-within:ring-emerald-500">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Écris ton message pour ${config.model}...`}
              className="flex-1 py-2.5 px-3 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm resize-none outline-none max-h-32 overflow-y-auto"
              aria-label="Message pour Ollama local"
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                title="Arrêter la génération"
                aria-label="Arrêter la génération"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  input.trim()
                    ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                }`}
                title="Envoyer à Ollama"
                aria-label="Envoyer à Ollama"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
