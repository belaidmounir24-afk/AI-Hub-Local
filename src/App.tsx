import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { MobileAppStrip } from './components/MobileAppStrip';
import { HubHome } from './components/HubHome';
import { OllamaChatApp } from './components/OllamaChatApp';
import { ScreenCaptureApp } from './components/ScreenCaptureApp';
import { ReportsHubApp, ReportsTabId } from './components/ReportsHubApp';
import { StudioProDashboard } from './components/StudioProDashboard';
import { OrchestratorApp } from './components/OrchestratorApp';
import { ChatFeed } from './components/ChatFeed';
import { CommandBox } from './components/CommandBox';
import { MediaLightbox } from './components/MediaLightbox';
import { CommandHelpModal } from './components/CommandHelpModal';
import { SettingsModal } from './components/SettingsModal';
import { MemoryModal } from './components/MemoryModal';
import {
  AiProvider,
  AttachedFile,
  AttachedFileSummary,
  ChatMessage,
  HubAppId,
  OllamaConfig,
  OllamaMessage,
  ProcessingProgress,
  TokenUsage,
} from './types';
import {
  processAttachedFiles,
  validateIncomingFiles,
} from './utils/fileProcessor';
import { parseCommand } from './utils/commands';
import {
  SpeechSettings,
  loadSpeechSettings,
  saveSpeechSettings,
  cleanTextForSpeech,
  isSpeechSynthesisSupported,
  getAvailableVoices,
} from './utils/speechManager';
import {
  loadOllamaConfig,
  saveOllamaConfig,
  loadOllamaMessages,
  saveOllamaMessages,
  checkOllamaConnection,
  OllamaTagsResult,
} from './utils/ollamaClient';
import { downloadReport } from './utils/reportExporter';
import {
  chercherDansMemoire,
  extraireContexteMemoirePertinent,
  sauvegarderDansMemoire,
} from './utils/visionMemory';
import {
  VisionOptimizationConfig,
  fetchServerOptimizationConfig,
  loadOptimizationConfigLocal,
  updateServerOptimizationConfig,
} from './utils/optimizationConfig';

const STORAGE_KEY_MESSAGES = 'marchedz_command_messages_v1';
const STORAGE_KEY_THEME = 'marchedz_command_theme';
const STORAGE_KEY_MOTION = 'marchedz_command_motion';
const STORAGE_KEY_PROVIDER = 'marchedz_ai_provider_v1';
const STORAGE_KEY_ACTIVE_APP = 'aihub_active_app_v1';
const SAMPLE_IMAGE_PATH = '/assets/aistudio/Screenshot_20261029_194653_1cf8afe2.jpg';

export default function App() {
  const [activeApp, setActiveApp] = useState<HubAppId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_APP);
      if (
        saved === 'hub' ||
        saved === 'studio' ||
        saved === 'ollama' ||
        saved === 'multimodal' ||
        saved === 'capture' ||
        saved === 'orchestrator' ||
        saved === 'exports'
      ) {
        return saved;
      }
    } catch {
      // Ignorer
    }
    return 'hub';
  });

  const [reportsTab, setReportsTab] = useState<ReportsTabId>('mcp');

  const handleSelectApp = (app: HubAppId) => {
    setActiveApp(app);
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_APP, app);
    } catch {
      // Ignorer
    }
  };

  // Messages & état Multimodal (Gemini / Claude)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Ignorer
    }
    return [];
  });

  // Configuration & messages Ollama (Termux) + Radar automatique 5s
  const [ollamaConfig, setOllamaConfig] = useState<OllamaConfig>(() => loadOllamaConfig());
  const [ollamaMessages, setOllamaMessages] = useState<OllamaMessage[]>(() => loadOllamaMessages());
  const [ollamaStatus, setOllamaStatus] = useState<OllamaTagsResult | null>(null);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);

  const probeOllama = async (targetEndpoint = ollamaConfig.endpoint) => {
    setIsCheckingOllama(true);
    const res = await checkOllamaConnection(targetEndpoint, 2200);
    setOllamaStatus(res);
    setIsCheckingOllama(false);
  };

  useEffect(() => {
    let active = true;
    const runProbe = async () => {
      if (!active) return;
      await probeOllama(ollamaConfig.endpoint);
    };

    runProbe();
    const intervalId = window.setInterval(runProbe, 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaConfig.endpoint]);

  const handleUpdateOllamaConfig = (next: OllamaConfig) => {
    setOllamaConfig(next);
    saveOllamaConfig(next);
  };

  useEffect(() => {
    saveOllamaMessages(ollamaMessages);
  }, [ollamaMessages]);

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<ProcessingProgress>({
    stage: '',
    percent: 0,
  });
  const [lastInstruction, setLastInstruction] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Thème et accessibilité
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    if (saved !== null) return saved === 'dark';
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MOTION);
    if (saved !== null) return saved === 'true';
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  });

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [optimizationConfig, setOptimizationConfig] = useState<VisionOptimizationConfig>(() =>
    loadOptimizationConfigLocal()
  );

  useEffect(() => {
    let active = true;
    fetchServerOptimizationConfig().then((cfg) => {
      if (active && cfg) {
        setOptimizationConfig(cfg);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleUpdateOptimizationConfig = async (next: VisionOptimizationConfig) => {
    setOptimizationConfig(next);
    try {
      const saved = await updateServerOptimizationConfig(next);
      setOptimizationConfig(saved);
    } catch {
      // Déjà enregistré en localStorage par updateServerOptimizationConfig
    }
  };
  const [aiProvider, setAiProvider] = useState<AiProvider>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROVIDER);
      if (saved === 'claude' || saved === 'gemini' || saved === 'deepseek') return saved;
    } catch {
      // Ignorer
    }
    return 'gemini';
  });

  const handleUpdateAiProvider = (provider: AiProvider) => {
    setAiProvider(provider);
    try {
      localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
    } catch {
      // Ignorer
    }
  };

  // Synthèse vocale Web Speech API
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>(() => loadSpeechSettings());
  const speechSettingsRef = useRef<SpeechSettings>(speechSettings);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  useEffect(() => {
    speechSettingsRef.current = speechSettings;
  }, [speechSettings]);

  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    url: string;
    title: string;
    subtitle?: string;
  }>({
    isOpen: false,
    url: '',
    title: '',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setSpeakingMessageId(null);
  };

  const speakText = (text: string, messageId?: string) => {
    if (!isSpeechSynthesisSupported()) return;

    const currentSettings = speechSettingsRef.current;
    stopSpeech();

    if (currentSettings.volume <= 0) return;

    const cleaned = cleanTextForSpeech(text);
    if (!cleaned) return;

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = currentSettings.rate;
    utterance.pitch = currentSettings.pitch;
    utterance.volume = Math.min(1, Math.max(0, currentSettings.volume));

    const voices = getAvailableVoices();
    if (currentSettings.voiceUri) {
      const found = voices.find(
        (v) => v.voiceURI === currentSettings.voiceUri || v.name === currentSettings.voiceUri
      );
      if (found) {
        utterance.voice = found;
      }
    } else {
      const frVoice = voices.find((v) => v.lang.toLowerCase().startsWith('fr'));
      if (frVoice) {
        utterance.voice = frVoice;
      }
    }
    utterance.lang = utterance.voice?.lang || 'fr-FR';

    utterance.onstart = () => {
      setIsSpeaking(true);
      if (messageId) setSpeakingMessageId(messageId);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    };

    setIsSpeaking(true);
    if (messageId) setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleSpeechGlobal = () => {
    const nextVal = !speechSettings.autoRead;
    const updated: SpeechSettings = { ...speechSettings, autoRead: nextVal };
    speechSettingsRef.current = updated;
    setSpeechSettings(updated);
    saveSpeechSettings(updated);
    if (!nextVal && isSpeaking) {
      stopSpeech();
    }
  };

  const handleToggleMessageSpeech = (messageId: string, text: string) => {
    if (isSpeaking && speakingMessageId === messageId) {
      stopSpeech();
    } else {
      speakText(text, messageId);
    }
  };

  const handleUpdateSpeechSettings = (newSettings: SpeechSettings) => {
    speechSettingsRef.current = newSettings;
    setSpeechSettings(newSettings);
    saveSpeechSettings(newSettings);
    if (newSettings.volume === 0 && isSpeaking) {
      stopSpeech();
    }
  };

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem(STORAGE_KEY_THEME, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(STORAGE_KEY_THEME, 'light');
    }
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) {
      root.classList.add('reduced-motion');
      localStorage.setItem(STORAGE_KEY_MOTION, 'true');
    } else {
      root.classList.remove('reduced-motion');
      localStorage.setItem(STORAGE_KEY_MOTION, 'false');
    }
  }, [reducedMotion]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch {
      // Dépassement possible du quota localStorage
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    if (activeApp === 'multimodal') {
      scrollToBottom();
    }
  }, [messages, isSending, activeApp]);

  const handleAddFiles = async (newRawFiles: File[]) => {
    setErrorMessage(null);

    const { validFiles, errors } = validateIncomingFiles(
      newRawFiles,
      attachedFiles.length
    );

    if (errors.length > 0) {
      setErrorMessage(errors[0]);
    }

    if (validFiles.length === 0) return;

    try {
      setIsSending(true);
      setSendProgress({
        stage: 'Optimisation des fichiers (images à 1600px, découpe vidéo 2s)...',
        percent: 20,
      });

      const processed = await processAttachedFiles(
        validFiles,
        (current, total, fileName) => {
          setSendProgress({
            stage: `Traitement de ${fileName} (${current}/${total})...`,
            percent: Math.round((current / total) * 70),
          });
        }
      );

      setAttachedFiles((prev) => [...prev, ...processed]);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Une erreur est survenue lors du traitement des fichiers.'
      );
    } finally {
      setIsSending(false);
      setSendProgress({ stage: '', percent: 0 });
    }
  };

  const handleRemoveFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSendMessage = async (text: string, files: AttachedFile[]) => {
    const userMessageId = `msg_${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (text.trim()) {
      setLastInstruction(text.trim());
    }

    const filesSummary: AttachedFileSummary[] = files.map((f) => ({
      type: f.type,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      previewUrl: f.previewUrl,
      dataUrl: f.dataUrl,
      duration: f.duration,
      frames: f.frames,
    }));

    const newUserMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      text: text.trim(),
      files: filesSummary,
      timestamp: timestampStr,
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setAttachedFiles([]);
    setIsSending(true);

    try {
      setSendProgress({
        stage: 'Préparation du message pour le modèle...',
        percent: 25,
      });

      const conversationHistory = messages
        .filter((m) => m.role !== 'system' && !m.isError)
        .slice(-8)
        .map((m, idx, arr) => {
          const isMostRecentTurn = idx >= arr.length - 2;
          return {
            role: m.role,
            text:
              !isMostRecentTurn && m.files && m.files.length > 0
                ? `${m.text ? m.text + '\n' : ''}[Fichiers précédents : ${m.files.map((f) => f.name).join(', ')}]`
                : m.text,
            files: isMostRecentTurn
              ? m.files?.slice(0, 2).map((f) => ({
                  type: f.type,
                  name: f.name,
                  dataUrl: f.previewUrl || f.dataUrl,
                  duration: f.duration,
                  frames: f.frames && f.frames.length > 0 ? [f.frames[0]] : undefined,
                }))
              : undefined,
          };
        });

      setSendProgress({
        stage:
          aiProvider === 'claude'
            ? 'Transmission sécurisée à Claude 3.5 Sonnet (Anthropic)...'
            : aiProvider === 'deepseek'
            ? 'Transmission sécurisée à DeepSeek (deepseek-chat)...'
            : "Transmission sécurisée à l'IA multimodale (Gemini)...",
        percent: 50,
      });

      const useLongTermMemory =
        optimizationConfig.system_config.performance_optimizations.long_term_memory === 'enabled';
      const useVectorRanking =
        optimizationConfig.system_config.performance_optimizations.vector_db_access ===
        'Pinecone_Ready';

      const relevantMemories = useLongTermMemory
        ? extraireContexteMemoirePertinent(text.trim(), 4, useVectorRanking)
        : [];

      const payloadJson = JSON.stringify({
        provider: aiProvider,
        optimizationConfig,
        memoryContext: relevantMemories.map((m) => ({
          date: m.date,
          titre: m.titre,
          contenu: m.contenu,
        })),
        message: {
          role: 'user',
          text: text.trim(),
          files: filesSummary.map((f) => ({
            type: f.type,
            name: f.name,
            mimeType: f.mimeType,
            dataUrl: f.dataUrl || f.previewUrl,
            duration: f.duration,
            frames: f.frames,
          })),
        },
        history: conversationHistory,
      });

      let response: Response;
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payloadJson,
        });
      } catch (firstFetchErr) {
        // Nouvelle tentative automatique en cas de micro-coupure / redémarrage serveur
        await new Promise((resolve) => setTimeout(resolve, 600));
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payloadJson,
        }).catch(() => {
          throw firstFetchErr;
        });
      }

      setSendProgress({
        stage: 'Réception et décodage de la réponse...',
        percent: 85,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Impossible d'obtenir une réponse de l'IA.");
      }

      setSendProgress({ stage: 'Terminé', percent: 100 });

      const assistantMessage: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'model',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        usage: data.usage,
        evalMeta: data.evalMeta,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (
        useLongTermMemory &&
        filesSummary.length > 0 &&
        typeof data.reply === 'string' &&
        data.reply.trim()
      ) {
        sauvegarderDansMemoire(
          text.trim() || filesSummary.map((f) => f.name).join(', '),
          data.reply,
          'vision-ia'
        );
      }

      if (speechSettingsRef.current.autoRead && speechSettingsRef.current.volume > 0) {
        speakText(assistantMessage.text, assistantMessage.id);
      }
    } catch (err: unknown) {
      const isNetworkError =
        err instanceof TypeError && err.message.toLowerCase().includes('fetch');

      const errorText = isNetworkError
        ? 'Le serveur est momentanément injoignable. Vérifiez votre connexion ou cliquez sur Réessayer.'
        : err instanceof Error
        ? err.message
        : "Une erreur inconnue est survenue lors de l'appel au modèle.";

      const errorMessageObj: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'model',
        text: errorText,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        isError: true,
        canRetry: true,
        rawError: err instanceof Error ? err.message : String(err),
      };

      setMessages((prev) => [...prev, errorMessageObj]);
    } finally {
      setIsSending(false);
      setSendProgress({ stage: '', percent: 0 });
    }
  };

  const handleRetry = (errorId: string) => {
    const errorIndex = messages.findIndex((m) => m.id === errorId);
    if (errorIndex > 0) {
      const prevUserMessage = messages[errorIndex - 1];
      if (prevUserMessage && prevUserMessage.role === 'user') {
        setMessages((prev) => prev.filter((m) => m.id !== errorId));
        const filesToResend: AttachedFile[] = (prevUserMessage.files || []).map(
          (f, idx) => ({
            id: `retry_${idx}`,
            file: new File([], f.name),
            name: f.name,
            size: f.size,
            type: f.type,
            mimeType: f.mimeType,
            previewUrl: f.previewUrl,
            dataUrl: f.dataUrl,
            duration: f.duration,
            frames: f.frames,
          })
        );
        handleSendMessage(prevUserMessage.text, filesToResend);
      }
    }
  };

  const handleExecuteCommand = async (commandStr: string) => {
    const { commandName, args } = parseCommand(commandStr);

    switch (commandName) {
      case '/aide':
      case '/help':
      case '/?':
        setIsHelpOpen(true);
        break;

      case '/memoire':
      case '/memory':
      case '/souvenir': {
        if (args.length > 0) {
          const term = args.join(' ').trim();
          const found = chercherDansMemoire(term);
          const resultText =
            found.length === 0
              ? `Aucun souvenir trouvé pour « ${term} » dans visionia_memoire.`
              : `Mémoire IA (« ${term} » — ${found.length} résultat${found.length > 1 ? 's' : ''}) :\n\n` +
                found
                  .slice(0, 5)
                  .map(
                    (item, idx) =>
                      `${idx + 1}. [${item.date}] ${item.titre}\n${item.contenu.slice(0, 240)}${
                        item.contenu.length > 240 ? '…' : ''
                      }`
                  )
                  .join('\n\n');
          handleSelectApp('multimodal');
          setMessages((prev) => [
            ...prev,
            {
              id: `sys_${Date.now()}`,
              role: 'system',
              text: resultText,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ]);
        } else {
          setIsMemoryOpen(true);
        }
        break;
      }

      case '/ollama':
      case '/local':
      case '/termux':
        handleSelectApp('ollama');
        break;

      case '/accueil':
      case '/hub':
      case '/apps':
        handleSelectApp('hub');
        break;

      case '/studio':
      case '/dashboard':
      case '/workspace':
        handleSelectApp('studio');
        break;

      case '/capture':
      case '/ecran':
      case '/screen':
      case '/camera':
        handleSelectApp('capture');
        break;

      case '/lowram':
      case '/pipeline':
      case '/orchestrateur':
      case '/etapes':
        handleSelectApp('orchestrator');
        break;

      case '/mcp':
      case '/graphql':
      case '/blueprint':
      case '/passerelle':
        setReportsTab('mcp');
        handleSelectApp('exports');
        break;

      case '/effacer':
      case '/clear':
      case '/reset':
        stopSpeech();
        if (activeApp === 'ollama') {
          setOllamaMessages([]);
        } else {
          setMessages([]);
          setAttachedFiles([]);
          setErrorMessage(null);
          localStorage.removeItem(STORAGE_KEY_MESSAGES);
          setMessages([
            {
              id: `sys_${Date.now()}`,
              role: 'system',
              text: 'Historique de la conversation effacé avec succès.',
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ]);
        }
        break;

      case '/exporter':
      case '/export':
      case '/sauvegarder': {
        if (messages.length === 0) {
          setErrorMessage('Aucun message à exporter pour le moment.');
          return;
        }

        const transcript = messages
          .map((m) => {
            const author = m.role === 'user' ? 'Utilisateur' : 'Assistant Multimodal';
            const filesInfo =
              m.files && m.files.length > 0
                ? `\n[Fichiers joints : ${m.files.map((f) => f.name).join(', ')}]`
                : '';
            return `### ${author} (${m.timestamp})${filesInfo}\n\n${m.text}\n`;
          })
          .join('\n---\n\n');

        const blob = new Blob([transcript], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `discussion-ia-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);

        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: 'Discussion exportée au format Markdown.',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ]);
        break;
      }

      case '/pdf':
      case '/rapport-pdf': {
        try {
          await downloadReport('pdf', messages);
          setMessages((prev) => [
            ...prev,
            {
              id: `sys_${Date.now()}`,
              role: 'system',
              text: "Rapport d'analyse PDF généré et téléchargé (rapport_visionia.pdf).",
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ]);
        } catch (err: unknown) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Erreur lors de la génération du rapport PDF.'
          );
        }
        break;
      }

      case '/excel':
      case '/xlsx':
      case '/rapport-excel': {
        try {
          await downloadReport('excel', messages);
          setMessages((prev) => [
            ...prev,
            {
              id: `sys_${Date.now()}`,
              role: 'system',
              text: 'Tableau Excel généré et téléchargé (donnees_visionia.xlsx).',
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ]);
        } catch (err: unknown) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Erreur lors de la génération du fichier Excel.'
          );
        }
        break;
      }

      case '/exemple':
      case '/demo':
      case '/sample':
        handleSelectApp('multimodal');
        await handleLoadSampleImage();
        break;

      case '/statut': {
        try {
          const res = await fetch('/api/health');
          const data = await res.json();
          setMessages((prev) => [
            ...prev,
            {
              id: `sys_${Date.now()}`,
              role: 'system',
              text: `Statut serveur : Opérationnel (${res.status}). Moteur actif : ${
                aiProvider === 'claude'
                  ? 'Claude 3.5 Sonnet (Anthropic)'
                  : aiProvider === 'deepseek'
                  ? 'DeepSeek (deepseek-chat)'
                  : 'Gemini Multimodal'
              }. Clé Gemini : ${
                data.hasApiKey ? 'Configurée' : 'Non détectée'
              } · Clé Anthropic (Claude) : ${
                data.hasAnthropicKey ? 'Configurée' : 'Non détectée'
              } · Clé DeepSeek : ${
                data.hasDeepSeekKey ? 'Configurée' : 'Non détectée'
              }.`,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
          ]);
        } catch {
          setErrorMessage('Impossible de joindre le serveur backend.');
        }
        break;
      }

      case '/claude':
      case '/anthropic':
      case '/sonnet':
        handleUpdateAiProvider('claude');
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: 'Moteur basculé sur Anthropic Claude 3.5 Sonnet (@anthropic-ai/sdk).',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ]);
        break;

      case '/deepseek':
      case '/ds':
      case '/deepseek-chat':
        handleUpdateAiProvider('deepseek');
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: 'Moteur basculé sur DeepSeek (deepseek-chat via deepseek_config.json).',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ]);
        break;

      case '/gemini':
      case '/google':
        handleUpdateAiProvider('gemini');
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            text: 'Moteur basculé sur Gemini Multimodal.',
            timestamp: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ]);
        break;

      case '/reglages':
      case '/settings':
      case '/voix':
      case '/audio':
        setIsSettingsOpen(true);
        break;

      default:
        setErrorMessage(
          `Commande inconnue « ${commandName} ». Tapez /aide pour afficher la liste des commandes.`
        );
        break;
    }
  };

  const handleLoadSampleImage = async () => {
    try {
      setIsSending(true);
      setSendProgress({
        stage: "Chargement de l'infographie modèle (MCP vs RAG vs AI Agents)...",
        percent: 40,
      });

      const response = await fetch(SAMPLE_IMAGE_PATH);
      if (!response.ok) {
        throw new Error("Impossible de charger l'image exemple.");
      }

      const blob = await response.blob();
      const sampleFile = new File([blob], 'mcp_vs_rag_vs_agents.jpg', {
        type: 'image/jpeg',
      });

      await handleAddFiles([sampleFile]);
      setLastInstruction(
        'Analyse cette infographie en comparant MCP, RAG et Agents IA : explique le rôle de chaque bloc technique.'
      );
    } catch {
      setErrorMessage("Impossible de charger l'infographie modèle.");
    } finally {
      setIsSending(false);
      setSendProgress({ stage: '', percent: 0 });
    }
  };

  const handleSendCaptureToMultimodal = (
    dataUrl: string,
    prompt: string,
    reply: string,
    usage?: TokenUsage
  ) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const base64Size = Math.round((dataUrl.length * 3) / 4);
    const captureUserMsg: ChatMessage = {
      id: `cap_user_${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp,
      files: [
        {
          type: 'image',
          name: 'capture_ecran.jpg',
          size: base64Size,
          mimeType: 'image/jpeg',
          previewUrl: dataUrl,
          dataUrl,
        },
      ],
    };
    const captureAiMsg: ChatMessage = {
      id: `cap_ai_${Date.now() + 1}`,
      role: 'model',
      text: reply,
      timestamp,
      usage,
    };
    setMessages((prev) => [...prev, captureUserMsg, captureAiMsg]);
    handleSelectApp('multimodal');
  };

  const showClearAction =
    (activeApp === 'ollama' && ollamaMessages.length > 0) ||
    (activeApp === 'multimodal' && messages.length > 0);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors selection:bg-emerald-500 selection:text-white">
      <Header
        activeApp={activeApp}
        onSelectApp={handleSelectApp}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onClearHistory={() => handleExecuteCommand('/effacer')}
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isSpeechEnabled={speechSettings.autoRead}
        onToggleSpeech={handleToggleSpeechGlobal}
        isSpeaking={isSpeaking}
        onStopSpeech={stopSpeech}
        showClearAction={showClearAction}
        ollamaReachable={ollamaStatus ? ollamaStatus.reachable : null}
      />

      <MobileAppStrip activeApp={activeApp} onSelectApp={handleSelectApp} />

      <main className="flex-1 flex flex-col w-full">
        {activeApp === 'hub' && (
          <HubHome
            onSelectApp={handleSelectApp}
            ollamaConfig={ollamaConfig}
            ollamaStatus={ollamaStatus}
            isCheckingOllama={isCheckingOllama}
            onProbeOllama={() => probeOllama(ollamaConfig.endpoint)}
            aiProvider={aiProvider}
            ollamaMessageCount={ollamaMessages.length}
            multimodalMessageCount={messages.length}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {activeApp === 'studio' && (
          <StudioProDashboard
            ollamaConfig={ollamaConfig}
            ollamaStatus={ollamaStatus}
            onSpeakText={handleToggleMessageSpeech}
            currentPlayingId={speakingMessageId}
            autoRead={speechSettings.autoRead}
            onOpenLightbox={(url, title, subtitle) =>
              setLightbox({ isOpen: true, url, title, subtitle })
            }
          />
        )}

        {activeApp === 'ollama' && (
          <OllamaChatApp
            config={ollamaConfig}
            onUpdateConfig={handleUpdateOllamaConfig}
            ollamaStatus={ollamaStatus}
            isCheckingOllama={isCheckingOllama}
            onProbeOllama={() => probeOllama(ollamaConfig.endpoint)}
            messages={ollamaMessages}
            setMessages={setOllamaMessages}
            onSpeakText={handleToggleMessageSpeech}
            currentPlayingId={speakingMessageId}
            autoRead={speechSettings.autoRead}
          />
        )}

        {activeApp === 'multimodal' && (
          <div className="flex-1 flex flex-col w-full pb-36 pt-2">
            <ChatFeed
              messages={messages}
              isLoading={isSending}
              loadingStage={sendProgress.stage}
              onRetry={handleRetry}
              onOpenLightbox={(url, title, subtitle) =>
                setLightbox({ isOpen: true, url, title, subtitle })
              }
              onSelectPrompt={(text) => {
                if (text.startsWith('/')) {
                  handleExecuteCommand(text);
                } else {
                  setLastInstruction(text);
                  handleSendMessage(text, attachedFiles);
                }
              }}
              onLoadSample={handleLoadSampleImage}
              messagesEndRef={messagesEndRef}
              currentPlayingId={speakingMessageId}
              onToggleSpeech={handleToggleMessageSpeech}
              onOpenMemory={() => setIsMemoryOpen(true)}
              onOpenMcpGateway={() => {
                setReportsTab('mcp');
                handleSelectApp('exports');
              }}
              aiProvider={aiProvider}
            />

            <CommandBox
              onSendMessage={handleSendMessage}
              onExecuteCommand={handleExecuteCommand}
              attachedFiles={attachedFiles}
              onAddFiles={handleAddFiles}
              onRemoveFile={handleRemoveFile}
              isSending={isSending}
              sendProgress={sendProgress}
              lastInstruction={lastInstruction}
              errorMessage={errorMessage}
              onClearError={() => setErrorMessage(null)}
            />
          </div>
        )}

        {activeApp === 'capture' && (
          <ScreenCaptureApp
            aiProvider={aiProvider}
            onSpeakText={handleToggleMessageSpeech}
            currentPlayingId={speakingMessageId}
            autoRead={speechSettings.autoRead}
            onOpenLightbox={(url, title, subtitle) =>
              setLightbox({ isOpen: true, url, title, subtitle })
            }
            onSendToMultimodal={handleSendCaptureToMultimodal}
          />
        )}

        {activeApp === 'orchestrator' && (
          <OrchestratorApp
            aiProvider={aiProvider}
            ollamaConfig={ollamaConfig}
            ollamaStatus={ollamaStatus}
          />
        )}

        {activeApp === 'exports' && (
          <ReportsHubApp
            multimodalMessages={messages}
            ollamaMessages={ollamaMessages}
            ollamaConfig={ollamaConfig}
            initialTab={reportsTab}
          />
        )}
      </main>

      <CommandHelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onSelectCommand={(cmd) => handleExecuteCommand(cmd)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={speechSettings}
        onUpdateSettings={handleUpdateSpeechSettings}
        aiProvider={aiProvider}
        onUpdateAiProvider={handleUpdateAiProvider}
        ollamaConfig={ollamaConfig}
        onUpdateOllamaConfig={handleUpdateOllamaConfig}
        optimizationConfig={optimizationConfig}
        onUpdateOptimizationConfig={handleUpdateOptimizationConfig}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={() => setReducedMotion((prev) => !prev)}
      />

      <MediaLightbox
        isOpen={lightbox.isOpen}
        onClose={() => setLightbox((prev) => ({ ...prev, isOpen: false }))}
        imageUrl={lightbox.url}
        title={lightbox.title}
        subtitle={lightbox.subtitle}
      />

      <MemoryModal
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        onUseMemoryPrompt={(promptText) => {
          handleSelectApp('multimodal');
          setLastInstruction(promptText);
        }}
      />
    </div>
  );
}
