import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Monitor,
  ImagePlus,
  Square,
  ScanText,
  Sparkles,
  Send,
  FileText,
  FileSpreadsheet,
  History,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Volume2,
  AlertCircle,
  CheckCircle2,
  Maximize2,
  Clock,
  Lock,
  Unlock,
  Bot,
  User,
  Cpu,
  Coins,
  Brain,
  Search,
} from 'lucide-react';
import { ChatMessage, OllamaConfig, TokenUsage } from '../types';
import { extractTextClientSide } from '../utils/ocrClient';
import { downloadReport } from '../utils/reportExporter';
import { generateOllamaResponse, OllamaTagsResult } from '../utils/ollamaClient';
import {
  VisionMemoryEntry,
  chercherDansMemoire,
  extraireContexteMemoirePertinent,
  sauvegarderDansMemoire,
  supprimerDeMemoire,
} from '../utils/visionMemory';

export type StudioEngine = 'gemini' | 'claude' | 'deepseek' | 'ollama';

interface StudioSavedReport {
  id: string;
  createdAtIso: string;
  displayTime: string;
  engine: StudioEngine;
  modelLabel: string;
  prompt: string;
  response: string;
  imageUrl?: string;
  imageMeta?: string;
  ocrText?: string;
  usage?: TokenUsage;
}

interface StudioMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  engine?: StudioEngine;
  modelLabel?: string;
  imageUrl?: string;
  usage?: TokenUsage;
  durationMs?: number;
}

interface StudioProDashboardProps {
  ollamaConfig: OllamaConfig;
  ollamaStatus: OllamaTagsResult | null;
  onSpeakText: (messageId: string, text: string) => void;
  currentPlayingId: string | null;
  autoRead: boolean;
  onOpenLightbox: (url: string, title: string, subtitle?: string) => void;
}

const STORAGE_KEY_STUDIO_HISTORY = 'aihub_studio_reports_v1';

function loadStudioHistory(): StudioSavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STUDIO_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStudioHistory(items: StudioSavedReport[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_STUDIO_HISTORY, JSON.stringify(items.slice(0, 12)));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY_STUDIO_HISTORY, JSON.stringify(items.slice(0, 4)));
    } catch {
      // Ignorer si le quota navigateur est plein
    }
  }
}

function formatCost(costUsd: number): string {
  if (costUsd <= 0) return '< 0,00001 $';
  if (costUsd < 0.00001) return '< 0,00001 $';
  if (costUsd < 0.01) return `~${costUsd.toFixed(5)} $`;
  return `~${costUsd.toFixed(4)} $`;
}

export const StudioProDashboard: React.FC<StudioProDashboardProps> = ({
  ollamaConfig,
  ollamaStatus,
  onSpeakText,
  currentPlayingId,
  autoRead,
  onOpenLightbox,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Colonne 1 : Capture & OCR
  const [streamMode, setStreamMode] = useState<'camera' | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [capturedImageMeta, setCapturedImageMeta] = useState<string>('');
  const [compression, setCompression] = useState<'hq' | 'fast'>('hq');

  const [isExtractingOcr, setIsExtractingOcr] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrText, setOcrText] = useState<string>('');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrCopied, setOcrCopied] = useState<boolean>(false);

  // Colonne 2 : Cœur (Moteur, Chat & Image Viewer)
  const [engine, setEngine] = useState<StudioEngine>('gemini');
  const [promptInput, setPromptInput] = useState<string>(
    'Analyse cette capture et résume les points essentiels de façon structurée.'
  );
  const [studioMessages, setStudioMessages] = useState<StudioMessage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [streamingReply, setStreamingReply] = useState<string>('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Colonne 3 : Logique d'activation UX Pro (grisés par défaut jusqu'à onAnalysisComplete)
  const [isExportUnlocked, setIsExportUnlocked] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<StudioSavedReport[]>(() => loadStudioHistory());
  const [rightTab, setRightTab] = useState<'reports' | 'memory'>('reports');
  const [memorySearch, setMemorySearch] = useState<string>('');
  const [memoryEntries, setMemoryEntries] = useState<VisionMemoryEntry[]>(() =>
    chercherDansMemoire('')
  );
  const [memorizedMsgId, setMemorizedMsgId] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    saveStudioHistory(historyItems);
  }, [historyItems]);

  useEffect(() => {
    const refreshMemory = () => {
      setMemoryEntries(chercherDansMemoire(memorySearch));
    };
    refreshMemory();
    window.addEventListener('visionia-memory-updated', refreshMemory);
    return () => {
      window.removeEventListener('visionia-memory-updated', refreshMemory);
    };
  }, [memorySearch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [studioMessages, streamingReply, isAnalyzing]);

  const stopActiveStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignorer
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamMode(null);
  };

  useEffect(() => {
    return () => {
      stopActiveStream();
    };
  }, []);

  const showToastStatus = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => {
      setStatusMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const attachMediaStream = (stream: MediaStream, mode: 'camera') => {
    stopActiveStream();
    streamRef.current = stream;
    setStreamMode(mode);
    setErrorMsg(null);

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        // Ignorer
      });
    }

    const [firstTrack] = stream.getVideoTracks();
    if (firstTrack) {
      firstTrack.onended = () => {
        stopActiveStream();
      };
    }
  };

  const startCamera = async () => {
    setErrorMsg(null);
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setErrorMsg("Caméra non accessible dans ce navigateur. Utilisez l'importation de fichier.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
      attachMediaStream(stream, 'camera');
      showToastStatus('Caméra active. Cliquez sur Capture IA pour prendre un cliché.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Accès caméra refusé ou indisponible : ${msg}`);
    }
  };

  const captureFrameFromVideo = (): boolean => {
    const video = videoRef.current;
    if (!video || !video.srcObject || video.videoWidth === 0 || video.videoHeight === 0) {
      return false;
    }

    const maxDim = compression === 'hq' ? 1600 : 1280;
    const quality = compression === 'hq' ? 0.95 : 0.5;
    let targetW = video.videoWidth;
    let targetH = video.videoHeight;

    if (targetW > maxDim || targetH > maxDim) {
      if (targetW >= targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, targetW, targetH);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    setCapturedImageUrl(dataUrl);
    setCapturedImageMeta(
      `Caméra · ${targetW}×${targetH} px · JPEG ${quality}`
    );
    setOcrText('');
    setOcrConfidence(null);
    setOcrCopied(false);
    showToastStatus('Capture figée dans le visualiseur central.');
    return true;
  };

  // Handler principal demandé : runCapture()
  const runCapture = async () => {
    setErrorMsg(null);
    if (streamMode && captureFrameFromVideo()) {
      return;
    }
    await startCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) return;
      const img = new Image();
      img.onload = () => {
        const maxDim = compression === 'hq' ? 1600 : 1280;
        const quality = compression === 'hq' ? 0.95 : 0.5;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const optimized = canvas.toDataURL('image/jpeg', quality);
          setCapturedImageUrl(optimized);
          setCapturedImageMeta(`${file.name} · ${w}×${h} px · JPEG ${quality}`);
          setOcrText('');
          setOcrConfidence(null);
          setOcrCopied(false);
          showToastStatus(`Image « ${file.name} » chargée dans le visualiseur.`);
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handler demandé : extractText()
  const extractText = async () => {
    setErrorMsg(null);
    let sourceUrl = capturedImageUrl;

    if (!sourceUrl && streamMode) {
      const ok = captureFrameFromVideo();
      if (ok) {
        // Attendre le prochain cycle ou capturer directement pour l'OCR immédiat
        const video = videoRef.current;
        if (video && video.videoWidth > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d')?.drawImage(video, 0, 0);
          sourceUrl = canvas.toDataURL('image/jpeg', 0.95);
        }
      }
    }

    if (!sourceUrl) {
      setErrorMsg("Aucune capture disponible pour l'extraction OCR. Capturez ou importez d'abord une image.");
      return;
    }

    setIsExtractingOcr(true);
    setOcrProgress(5);
    setOcrCopied(false);

    try {
      const { text, confidence } = await extractTextClientSide(sourceUrl, (pct) => {
        setOcrProgress(pct);
      });

      if (!text) {
        setOcrText('');
        setOcrConfidence(confidence);
        setErrorMsg("Aucun texte lisible n'a été détecté sur cette image.");
        return;
      }

      setOcrText(text);
      setOcrConfidence(confidence);

      try {
        await navigator.clipboard.writeText(text);
        setOcrCopied(true);
        window.setTimeout(() => setOcrCopied(false), 3000);
      } catch {
        // Le texte reste affiché avec un bouton Copier manuel
      }
      showToastStatus(`Texte OCR extrait (${confidence}% confiance).`);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? `Erreur OCR : ${err.message}` : "L'extraction OCR client-side a échoué."
      );
    } finally {
      setIsExtractingOcr(false);
      setOcrProgress(0);
    }
  };

  // Fonction UX Pro demandée : déclenchée après la réponse IA pour débloquer l'export
  const onAnalysisComplete = (
    userMsg: StudioMessage,
    assistantMsg: StudioMessage,
    activeImg?: string,
    activeMeta?: string
  ) => {
    setIsExportUnlocked(true);
    const saved: StudioSavedReport = {
      id: assistantMsg.id,
      createdAtIso: new Date().toISOString(),
      displayTime: assistantMsg.timestamp,
      engine: assistantMsg.engine || engine,
      modelLabel: assistantMsg.modelLabel || engine.toUpperCase(),
      prompt: userMsg.text,
      response: assistantMsg.text,
      imageUrl: activeImg,
      imageMeta: activeMeta,
      ocrText: ocrText || undefined,
      usage: assistantMsg.usage,
    };
    setHistoryItems((prev) => [saved, ...prev].slice(0, 12));
    sauvegarderDansMemoire(userMsg.text, assistantMsg.text, 'studio-pro');
  };

  const handleRunAnalysis = async (customPrompt?: string) => {
    setErrorMsg(null);
    const trimmedPrompt = (customPrompt ?? promptInput).trim();

    let imageToAnalyze = capturedImageUrl;
    let metaToUse = capturedImageMeta;

    if (!imageToAnalyze && streamMode && videoRef.current && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      const maxDim = compression === 'hq' ? 1600 : 1280;
      const quality = compression === 'hq' ? 0.95 : 0.5;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
      imageToAnalyze = canvas.toDataURL('image/jpeg', quality);
      metaToUse = `Caméra · ${w}×${h} px · JPEG ${quality}`;
      setCapturedImageUrl(imageToAnalyze);
      setCapturedImageMeta(metaToUse);
    }

    if (!trimmedPrompt && !imageToAnalyze) {
      setErrorMsg('Saisissez une instruction ou capturez une image à analyser.');
      return;
    }

    const effectivePrompt =
      trimmedPrompt || 'Analyse cette image et résume les informations clés.';
    const nowTime = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMessage: StudioMessage = {
      id: `st_u_${Date.now()}`,
      role: 'user',
      text: effectivePrompt,
      timestamp: nowTime,
      imageUrl: imageToAnalyze || undefined,
    };

    setStudioMessages((prev) => [...prev, userMessage]);
    setIsAnalyzing(true);
    setStreamingReply('');

    try {
      const relevantMemories = extraireContexteMemoirePertinent(effectivePrompt, 4);

      if (engine === 'ollama') {
        const memoryBlock =
          relevantMemories.length > 0
            ? `[Souvenirs pertinents (visionia_memoire) :\n${relevantMemories
                .map((m) => `- (${m.date}) ${m.titre} : ${m.contenu.slice(0, 450)}`)
                .join('\n')}]\n\n`
            : '';

        const basePrompt =
          imageToAnalyze && ocrText
            ? `${effectivePrompt}\n\n[Texte extrait par OCR de la capture jointe :\n${ocrText}]`
            : imageToAnalyze
            ? `${effectivePrompt}\n\n[Note : une image (${metaToUse || 'capture'}) est affichée dans l'espace de travail.]`
            : effectivePrompt;

        const promptWithOcrContext = `${memoryBlock}${basePrompt}`;

        const result = await generateOllamaResponse({
          endpoint: ollamaConfig.endpoint,
          model: ollamaConfig.model,
          prompt: promptWithOcrContext,
          systemPrompt: ollamaConfig.systemPrompt,
          stream: ollamaConfig.stream,
          onToken: (acc) => setStreamingReply(acc),
        });

        const assistantMsg: StudioMessage = {
          id: `st_a_${Date.now()}`,
          role: 'assistant',
          text: result.response,
          timestamp: new Date().toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          engine: 'ollama',
          modelLabel: `Ollama · ${result.model}`,
          durationMs: result.durationMs,
        };

        setStudioMessages((prev) => [...prev, assistantMsg]);
        setStreamingReply('');
        onAnalysisComplete(userMessage, assistantMsg, imageToAnalyze || undefined, metaToUse || undefined);

        if (autoRead) {
          onSpeakText(assistantMsg.id, assistantMsg.text);
        }
        return;
      }

      // Gemini ou Claude via backend Express
      let replyText = '';
      let usage: TokenUsage | undefined;

      if (imageToAnalyze && studioMessages.length === 0 && relevantMemories.length === 0) {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: imageToAnalyze,
            prompt: effectivePrompt,
            provider: engine,
            timestamp: new Date().toISOString(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Erreur lors de l'analyse visuelle.");
        }
        replyText = data.response || data.reply || '';
        usage = data.usage;
      } else {
        const historyPayload = studioMessages.slice(-8).map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('model' as const),
          text: m.text,
          files: m.imageUrl
            ? [{ type: 'image' as const, name: 'capture_studio.jpg', mimeType: 'image/jpeg', dataUrl: m.imageUrl }]
            : undefined,
        }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: engine,
            history: historyPayload,
            memoryContext: relevantMemories.map((m) => ({
              date: m.date,
              titre: m.titre,
              contenu: m.contenu,
            })),
            message: {
              role: 'user',
              text: effectivePrompt,
              files: imageToAnalyze
                ? [{ type: 'image', name: 'capture_studio.jpg', mimeType: 'image/jpeg', dataUrl: imageToAnalyze }]
                : [],
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors du traitement de la requête.');
        }
        replyText = data.reply || '';
        usage = data.usage;
      }

      const assistantMsg: StudioMessage = {
        id: `st_a_${Date.now()}`,
        role: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        engine,
        modelLabel:
          usage?.modelName ||
          (engine === 'claude'
            ? 'Claude 3.5 Sonnet'
            : engine === 'deepseek'
            ? 'DeepSeek (deepseek-chat)'
            : 'Gemini Multimodal'),
        usage,
      };

      setStudioMessages((prev) => [...prev, assistantMsg]);
      onAnalysisComplete(userMessage, assistantMsg, imageToAnalyze || undefined, metaToUse || undefined);

      if (autoRead && replyText) {
        onSpeakText(assistantMsg.id, replyText);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Impossible de finaliser la requête IA. Vérifiez la connexion.'
      );
    } finally {
      setIsAnalyzing(false);
      setStreamingReply('');
    }
  };

  const buildExportMessages = (): ChatMessage[] => {
    return studioMessages.map((m) => ({
      id: m.id,
      role: m.role === 'user' ? 'user' : 'model',
      text: m.text,
      timestamp: m.timestamp,
      usage: m.usage,
      files: m.imageUrl
        ? [
            {
              type: 'image',
              name: 'capture_studio.jpg',
              size: 0,
              mimeType: 'image/jpeg',
              previewUrl: m.imageUrl,
            },
          ]
        : undefined,
    }));
  };

  // Handlers demandés : exportPDF() & exportExcel()
  const exportPDF = async () => {
    if (!isExportUnlocked || isExportingPdf) return;
    setErrorMsg(null);
    setIsExportingPdf(true);
    try {
      await downloadReport('pdf', buildExportMessages());
      showToastStatus('Rapport PDF téléchargé (rapport_visionia.pdf).');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur export PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const exportExcel = async () => {
    if (!isExportUnlocked || isExportingExcel) return;
    setErrorMsg(null);
    setIsExportingExcel(true);
    try {
      await downloadReport('excel', buildExportMessages());
      showToastStatus('Classeur Excel téléchargé (donnees_visionia.xlsx).');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur export Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleRestoreReport = (report: StudioSavedReport) => {
    setErrorMsg(null);
    setEngine(report.engine);
    if (report.imageUrl) {
      setCapturedImageUrl(report.imageUrl);
      setCapturedImageMeta(report.imageMeta || `Archive · ${report.displayTime}`);
    }
    if (report.ocrText) {
      setOcrText(report.ocrText);
    }
    setStudioMessages([
      {
        id: `rest_u_${report.id}`,
        role: 'user',
        text: report.prompt,
        timestamp: report.displayTime,
        imageUrl: report.imageUrl,
      },
      {
        id: report.id,
        role: 'assistant',
        text: report.response,
        timestamp: report.displayTime,
        engine: report.engine,
        modelLabel: report.modelLabel,
        usage: report.usage,
      },
    ]);
    setIsExportUnlocked(true);
    showToastStatus('Rapport restauré — export PDF et Excel actif.');
  };

  const handleResetSession = () => {
    setStudioMessages([]);
    setIsExportUnlocked(false);
    setErrorMsg(null);
    showToastStatus("Session réinitialisée. Les boutons d'export sont verrouillés jusqu'à la prochaine analyse.");
  };

  return (
    <div className="flex-1 w-full bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Bannières d'état globales sans window.alert */}
      {(errorMsg || statusMsg) && (
        <div className="max-w-[1600px] w-full mx-auto px-4 pt-3 space-y-2">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-xs sm:text-sm flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-xs font-semibold hover:underline shrink-0"
              >
                Fermer
              </button>
            </div>
          )}
          {statusMsg && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{statusMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusMsg(null)}
                className="text-xs font-semibold hover:underline shrink-0"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      )}

      {/* Architecture 3 colonnes SaaS Pro : 250px (Entrée) · 1fr (Cœur) · 300px (Sortie) */}
      <div className="app-dashboard flex-1 w-full max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px] lg:min-h-[calc(100vh-3.5rem)] bg-slate-50 dark:bg-slate-950">
        {/* COLONNE 1 : Entrée (Capture & OCR) */}
        <nav
          aria-label="Entrée et capture"
          className="sidebar-left bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              1 · Entrée (Capture)
            </h2>
            {streamMode && (
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                Flux actif
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={runCapture}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>{streamMode ? 'Capturer instantané' : 'Capture IA'}</span>
          </button>

          {/* Sélecteur rapide de source */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={startCamera}
              className={`min-h-[40px] px-2 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                streamMode === 'camera'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Activer la caméra"
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>Caméra</span>
            </button>

            <input
              ref={fileInputRef}
              id="fileInput"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center justify-center gap-1 transition-colors"
              title="Importer une image locale"
            >
              <ImagePlus className="w-3.5 h-3.5 shrink-0" />
              <span>Fichier</span>
            </button>
          </div>

          {streamMode && (
            <button
              type="button"
              onClick={stopActiveStream}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Arrêter le flux</span>
            </button>
          )}

          {/* Zone d'aperçu (#capture-preview) */}
          <div
            id="capture-preview"
            className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 aspect-video flex items-center justify-center relative"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain ${streamMode ? 'block' : 'hidden'}`}
            />
            {!streamMode && capturedImageUrl && (
              <img
                src={capturedImageUrl}
                alt="Aperçu capture"
                className="w-full h-full object-contain"
              />
            )}
            {!streamMode && !capturedImageUrl && (
              <div className="p-4 text-center space-y-1">
                <Monitor className="w-6 h-6 text-slate-500 mx-auto" />
                <p className="text-[11px] text-slate-400">
                  Aperçu vidéo ou image capturée
                </p>
              </div>
            )}
          </div>

          {/* Bouton Extraire Texte (OCR client-side) */}
          <button
            type="button"
            onClick={extractText}
            disabled={isExtractingOcr || (!capturedImageUrl && !streamMode)}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 dark:text-slate-100 text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            {isExtractingOcr ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="tabular-nums">OCR {ocrProgress}%</span>
              </>
            ) : (
              <>
                <ScanText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Extraire Texte</span>
              </>
            )}
          </button>

          {ocrText && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="font-semibold tabular-nums">
                  Texte OCR {ocrConfidence !== null ? `· ${ocrConfidence}%` : ''}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(ocrText);
                        setOcrCopied(true);
                        window.setTimeout(() => setOcrCopied(false), 2000);
                      } catch {
                        // Ignorer
                      }
                    }}
                    className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    {ocrCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{ocrCopied ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>
              </div>
              <pre className="text-[11px] font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200 max-h-36 overflow-y-auto select-all">
                {ocrText}
              </pre>
              <button
                type="button"
                onClick={() =>
                  setPromptInput(
                    `Voici le texte extrait par OCR. Analyse-le et structure les points importants :\n\n${ocrText}`
                  )
                }
                className="w-full py-1.5 px-2.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-semibold transition-colors"
              >
                Envoyer ce texte au prompt
              </button>
            </div>
          )}
        </nav>

        {/* COLONNE 2 : Cœur (Visualiseur + Chat Gemini / Claude / Ollama) */}
        <main className="main-workspace bg-white dark:bg-slate-950 p-4 sm:p-6 flex flex-col gap-5 overflow-y-auto">
          {/* Barre d'outils centrale : Moteur IA + Qualité */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Studio Pro · Espace d&apos;Analyse
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspecte ta capture puis interroge Gemini, Claude, DeepSeek ou Ollama local
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Choix du moteur IA"
                className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                {(['gemini', 'claude', 'deepseek', 'ollama'] as StudioEngine[]).map((item) => {
                  const active = engine === item;
                  const label =
                    item === 'gemini'
                      ? 'Gemini'
                      : item === 'claude'
                      ? 'Claude'
                      : item === 'deepseek'
                      ? 'DeepSeek'
                      : ollamaStatus?.reachable
                      ? 'Ollama (Prêt)'
                      : 'Ollama';
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setEngine(item)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setCompression('hq')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                    compression === 'hq'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  HD 0.95
                </button>
                <button
                  type="button"
                  onClick={() => setCompression('fast')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                    compression === 'fast'
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Rapide 0.5
                </button>
              </div>
            </div>
          </div>

          {/* Zone d'affichage de l'image (#image-viewer) */}
          <section
            id="image-viewer"
            className="view-area rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 sm:p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Visualiseur média actif
              </span>
              <div className="flex items-center gap-3">
                {capturedImageMeta && (
                  <span className="font-mono text-[11px] tabular-nums">{capturedImageMeta}</span>
                )}
                {capturedImageUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenLightbox(capturedImageUrl, 'Capture Studio Pro', capturedImageMeta)
                    }
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Agrandir</span>
                  </button>
                )}
              </div>
            </div>

            {capturedImageUrl ? (
              <div
                onClick={() =>
                  onOpenLightbox(capturedImageUrl, 'Capture Studio Pro', capturedImageMeta)
                }
                className="relative max-h-[300px] w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center cursor-pointer"
              >
                <img
                  src={capturedImageUrl}
                  alt="Capture active dans le visualiseur"
                  className="max-h-[300px] w-auto object-contain"
                />
              </div>
            ) : (
              <div className="py-8 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-1.5">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Aucune image figée pour le moment
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Utilisez la colonne de gauche (« Capture IA » ou « Fichier ») ou posez directement une question texte ci-dessous.
                </p>
              </div>
            )}
          </section>

          {/* Zone de discussion (#chat-box) */}
          <section
            id="chat-box"
            aria-label="Conversation et analyses IA"
            className="chat-area flex-1 min-h-[260px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                2 · Cœur (Réponses Gemini / Claude / Ollama)
              </span>
              {studioMessages.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetSession}
                  className="text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
                >
                  Réinitialiser session
                </button>
              )}
            </div>

            {studioMessages.length === 0 && !isAnalyzing ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8 px-4 space-y-2">
                <Sparkles className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Prêt pour votre première analyse
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                  Dès qu&apos;une réponse IA est générée ici, les boutons <strong>Télécharger PDF</strong> et <strong>Télécharger Excel</strong> de la colonne de droite s&apos;activent automatiquement.
                </p>
              </div>
            ) : (
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {studioMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const isPlaying = currentPlayingId === msg.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {isUser ? (
                          <>
                            <span>Vous</span>
                            <span aria-hidden="true">·</span>
                            <span>{msg.timestamp}</span>
                            <User className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {msg.modelLabel || 'Assistant IA'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{msg.timestamp}</span>
                          </>
                        )}
                      </div>

                      <div
                        className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-slate-900 dark:bg-slate-800 text-white rounded-tr-xs'
                            : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-xs'
                        }`}
                      >
                        {msg.text}
                      </div>

                      {!isUser && (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums px-1">
                          {msg.usage && (
                            <>
                              <span className="flex items-center gap-1">
                                <Cpu className="w-3 h-3" />
                                {msg.usage.totalTokens.toLocaleString('fr-FR')} tok
                              </span>
                              <span className="flex items-center gap-1">
                                <Coins className="w-3 h-3" />
                                {formatCost(msg.usage.estimatedCostUsd)}
                              </span>
                            </>
                          )}
                          {msg.durationMs !== undefined && (
                            <span>{(msg.durationMs / 1000).toFixed(1)} s</span>
                          )}
                          <button
                            type="button"
                            onClick={() => onSpeakText(msg.id, msg.text)}
                            className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>{isPlaying ? 'Arrêter' : 'Écouter'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(msg.text);
                                setCopiedMsgId(msg.id);
                                window.setTimeout(() => setCopiedMsgId(null), 2000);
                              } catch {
                                // Ignorer
                              }
                            }}
                            className="font-medium text-slate-600 dark:text-slate-300 hover:underline flex items-center gap-1"
                          >
                            {copiedMsgId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedMsgId === msg.id ? 'Copié' : 'Copier'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const idx = studioMessages.findIndex((m) => m.id === msg.id);
                              const prevUser =
                                idx > 0 && studioMessages[idx - 1]?.role === 'user'
                                  ? studioMessages[idx - 1].text
                                  : `Analyse Studio Pro (${msg.timestamp})`;
                              sauvegarderDansMemoire(prevUser, msg.text, 'studio-pro');
                              setMemorizedMsgId(msg.id);
                              showToastStatus('Analyse enregistrée dans la mémoire persistante (visionia_memoire).');
                              window.setTimeout(() => setMemorizedMsgId(null), 2200);
                            }}
                            className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          >
                            {memorizedMsgId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Brain className="w-3.5 h-3.5" />
                            )}
                            <span>{memorizedMsgId === msg.id ? 'Mémorisé' : 'Mémoriser'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {isAnalyzing && (
                  <div className="flex flex-col items-start gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                      <span>
                        {engine === 'ollama'
                          ? `Génération locale (${ollamaConfig.model})...`
                          : engine === 'claude'
                          ? 'Analyse avec Claude 3.5 Sonnet...'
                          : engine === 'deepseek'
                          ? 'Analyse avec DeepSeek (deepseek-chat)...'
                          : 'Analyse avec Gemini Multimodal...'}
                      </span>
                    </div>
                    {streamingReply && (
                      <div className="max-w-[92%] rounded-2xl rounded-tl-xs px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">
                        {streamingReply}
                      </div>
                    )}
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}

            {/* Compositeur d'instruction */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5">
              <textarea
                rows={2}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleRunAnalysis();
                  }
                }}
                placeholder="Posez une question ou donnez une instruction d'analyse..."
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
              />
              <button
                type="button"
                onClick={() => void handleRunAnalysis()}
                disabled={isAnalyzing}
                className="min-h-[44px] sm:self-end px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>En cours...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 shrink-0" />
                    <span>Analyser</span>
                  </>
                )}
              </button>
            </div>
          </section>
        </main>

        {/* COLONNE 3 : Sortie (Gestion des données, Export verrouillé par défaut & Historique) */}
        <aside
          aria-label="Gestion des données et exportations"
          className="sidebar-right bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Gestion des données
            </h3>
            <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {isExportUnlocked ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">Prêt</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Verrouillé</span>
                </>
              )}
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {isExportUnlocked
              ? 'Analyse IA terminée : vous pouvez télécharger le rapport formaté en PDF ou en classeur Excel.'
              : "Les exports sont désactivés par défaut jusqu'à ce qu'une analyse IA ait répondu (onAnalysisComplete)."}
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={exportPDF}
              disabled={!isExportUnlocked || isExportingPdf}
              className="btn-export w-full min-h-[44px] px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {isExportingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <FileText className="w-4 h-4 shrink-0" />
              )}
              <span>{isExportingPdf ? 'Génération PDF...' : 'Télécharger PDF'}</span>
            </button>

            <button
              type="button"
              onClick={exportExcel}
              disabled={!isExportUnlocked || isExportingExcel}
              className="btn-export w-full min-h-[44px] px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {isExportingExcel ? (
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
              )}
              <span>{isExportingExcel ? 'Génération Excel...' : 'Télécharger Excel'}</span>
            </button>
          </div>

          {/* Panneau d'historique local & Mémoire IA persistante (#history-panel) */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex-1 flex flex-col gap-3 min-h-0">
            <div
              role="tablist"
              aria-label="Archives et mémoire"
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
            >
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === 'reports'}
                onClick={() => setRightTab('reports')}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors tabular-nums ${
                  rightTab === 'reports'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5 shrink-0" />
                <span>Rapports ({historyItems.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === 'memory'}
                onClick={() => setRightTab('memory')}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors tabular-nums ${
                  rightTab === 'memory'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Brain className="w-3.5 h-3.5 shrink-0" />
                <span>Mémoire ({memoryEntries.length})</span>
              </button>
            </div>

            {rightTab === 'reports' ? (
              <>
                {historyItems.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setHistoryItems([])}
                      className="text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Vider les rapports
                    </button>
                  </div>
                )}

                <div id="history-panel" className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                  {historyItems.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-1">
                      <Clock className="w-5 h-5 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Aucun rapport mémorisé localement pour le moment.
                      </p>
                    </div>
                  ) : (
                    historyItems.map((item) => (
                      <div
                        key={item.id}
                        className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 space-y-1.5 hover:border-blue-500/60 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 truncate">
                            {item.displayTime} · {item.modelLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setHistoryItems((prev) => prev.filter((x) => x.id !== item.id))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                            aria-label="Supprimer ce rapport"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRestoreReport(item)}
                          className="w-full text-left flex items-start gap-2.5"
                        >
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt="Miniature rapport"
                              className="w-12 h-9 rounded object-cover bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                              {item.prompt}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                              {item.response}
                            </p>
                          </div>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div id="history-panel" className="flex-1 flex flex-col gap-2.5 min-h-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={memorySearch}
                    onChange={(e) => setMemorySearch(e.target.value)}
                    placeholder="Rechercher dans visionia_memoire..."
                    className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                  {memoryEntries.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-1">
                      <Brain className="w-5 h-5 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {memorySearch.trim()
                          ? `Aucun souvenir trouvé pour « ${memorySearch} ».`
                          : 'Aucun souvenir enregistré dans visionia_memoire.'}
                      </p>
                    </div>
                  ) : (
                    memoryEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 space-y-1 hover:border-blue-500/60 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                          <span className="font-mono truncate">{entry.date}</span>
                          <button
                            type="button"
                            onClick={() => supprimerDeMemoire(entry.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 shrink-0"
                            aria-label="Supprimer ce souvenir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPromptInput(
                              `En t'appuyant sur ce souvenir (« ${entry.titre} ») :\n${entry.contenu.slice(0, 600)}\n\nQuestion : `
                            );
                            showToastStatus('Souvenir chargé dans le prompt.');
                          }}
                          className="w-full text-left space-y-0.5"
                          title="Cliquer pour injecter ce souvenir dans le prompt"
                        >
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                            {entry.titre}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-3">
                            {entry.contenu}
                          </p>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
