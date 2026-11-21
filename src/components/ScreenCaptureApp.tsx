import React, { useEffect, useRef, useState } from 'react';
import {
  Monitor,
  Camera,
  Square,
  Sparkles,
  AlertCircle,
  Copy,
  Check,
  Volume2,
  ArrowRight,
  RefreshCw,
  ImagePlus,
  Cpu,
  Coins,
  Maximize2,
  Trash2,
  Clock,
  Layers,
  X,
  ScanText,
  Download,
  CheckCircle2,
  SwitchCamera,
  Timer,
  Pause,
  Brain,
} from 'lucide-react';
import { AiProvider, TokenUsage } from '../types';
import { extractTextClientSide } from '../utils/ocrClient';
import { sauvegarderDansMemoire } from '../utils/visionMemory';

interface ScreenCaptureAppProps {
  aiProvider: AiProvider;
  onSpeakText: (messageId: string, text: string) => void;
  currentPlayingId: string | null;
  autoRead: boolean;
  onOpenLightbox: (url: string, title: string, subtitle?: string) => void;
  onSendToMultimodal: (dataUrl: string, prompt: string, reply: string, usage?: TokenUsage) => void;
}

type StreamMode = 'camera' | null;
type CompressionPreset = 'fast' | 'hq';

interface CaptureHistoryEntry {
  id: string;
  timestampIso: string;
  displayTime: string;
  imageUrl: string;
  meta: string;
  prompt: string;
  response: string;
  usage?: TokenUsage;
}

const STORAGE_KEY_CAPTURE_HISTORY = 'aihub_capture_history_v1';

const QUICK_PROMPTS = [
  'Décris précisément ce qui est affiché et résume les informations clés.',
  'Débogue cette interface ou ce code : repère les erreurs visibles et propose une solution.',
  'Extrais tout le texte visible de cette capture sous forme structurée.',
  'Explique ce schéma, graphique ou tableau étape par étape.',
];

function formatCost(costUsd: number): string {
  if (costUsd <= 0) return '< 0,00001 $';
  if (costUsd < 0.00001) return '< 0,00001 $';
  if (costUsd < 0.01) return `~${costUsd.toFixed(5)} $`;
  return `~${costUsd.toFixed(4)} $`;
}

function loadCaptureHistory(): CaptureHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CAPTURE_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCaptureHistory(entries: CaptureHistoryEntry[]): void {
  try {
    // Limiter à 8 entrées pour éviter de saturer le quota localStorage
    localStorage.setItem(STORAGE_KEY_CAPTURE_HISTORY, JSON.stringify(entries.slice(0, 8)));
  } catch {
    // En cas de quota dépassé, conserver au moins les 3 plus récentes
    try {
      localStorage.setItem(STORAGE_KEY_CAPTURE_HISTORY, JSON.stringify(entries.slice(0, 3)));
    } catch {
      // Ignorer
    }
  }
}

export const ScreenCaptureApp: React.FC<ScreenCaptureAppProps> = ({
  aiProvider,
  onSpeakText,
  currentPlayingId,
  autoRead,
  onOpenLightbox,
  onSendToMultimodal,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const autoCaptureIntervalRef = useRef<number | null>(null);
  const isAnalyzingRef = useRef<boolean>(false);
  const handleAnalyzeRef = useRef<() => Promise<void>>(async () => {});

  const [streamMode, setStreamMode] = useState<StreamMode>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [compression, setCompression] = useState<CompressionPreset>('hq');
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState<boolean>(false);
  const [autoCaptureSeconds, setAutoCaptureSeconds] = useState<number>(10);
  const [autoCaptureCountdown, setAutoCaptureCountdown] = useState<number>(10);
  const [showFloatingOverlay, setShowFloatingOverlay] = useState<boolean>(true);
  const [overlayDismissed, setOverlayDismissed] = useState<boolean>(false);

  const [prompt, setPrompt] = useState<string>(QUICK_PROMPTS[0]);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<string>('');
  const [analysisText, setAnalysisText] = useState<string>('');
  const [analysisUsage, setAnalysisUsage] = useState<TokenUsage | null>(null);
  const [analysisTimestamp, setAnalysisTimestamp] = useState<string>('');
  const [analysisId, setAnalysisId] = useState<string>('capture_analysis');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [memorized, setMemorized] = useState<boolean>(false);

  const [isExtractingOcr, setIsExtractingOcr] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: '',
  });
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrCopied, setOcrCopied] = useState<boolean>(false);

  const [history, setHistory] = useState<CaptureHistoryEntry[]>(() => loadCaptureHistory());

  useEffect(() => {
    saveCaptureHistory(history);
  }, [history]);

  const clearAutoCaptureTimer = () => {
    if (autoCaptureIntervalRef.current !== null) {
      window.clearInterval(autoCaptureIntervalRef.current);
      autoCaptureIntervalRef.current = null;
    }
  };

  const stopActiveStream = () => {
    clearAutoCaptureTimer();
    setAutoCaptureEnabled(false);

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
      clearAutoCaptureTimer();
      stopActiveStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachStream = (stream: MediaStream, mode: StreamMode) => {
    stopActiveStream();
    streamRef.current = stream;
    setStreamMode(mode);
    setErrorMsg(null);

    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {
        // AutoPlay déjà actif
      });
    }

    const [firstTrack] = stream.getVideoTracks();
    if (firstTrack) {
      firstTrack.onended = () => {
        stopActiveStream();
      };
    }
  };

  const handleStartCamera = async (facingOverride?: 'environment' | 'user') => {
    setErrorMsg(null);
    const targetFacing = facingOverride ?? cameraFacing;

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setErrorMsg(
        "L'accès caméra en direct n'est pas disponible dans cet environnement. Utilisez « Photo / Fichier »."
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // Repli universel si la contrainte exacte de résolution n'est pas supportée
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: targetFacing },
          audio: false,
        }).catch(() =>
          navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        );
      }
      setCameraFacing(targetFacing);
      attachStream(stream, 'camera');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes('denied') ||
        msg.toLowerCase().includes('permission') ||
        msg.toLowerCase().includes('notallowed')
      ) {
        setErrorMsg(
          "Impossible d'accéder à la caméra. Autorise l'accès dans les paramètres du navigateur."
        );
      } else {
        setErrorMsg(`Erreur d'accès à la caméra : ${msg}`);
      }
    }
  };

  const handleFlipCamera = async () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    await handleStartCamera(nextFacing);
  };

  const getCompressionSettings = () => {
    return compression === 'fast'
      ? { maxDim: 1280, quality: 0.5, label: 'JPEG 0.5 · Rapide' }
      : { maxDim: 1600, quality: 0.95, label: 'JPEG 0.95 · Haute qualité' };
  };

  const captureVideoFrameDataUrl = (): { dataUrl: string; width: number; height: number } | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const { maxDim, quality } = getCompressionSettings();
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
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { dataUrl, width: targetW, height: targetH };
  };

  const runAnalyzeRequest = async (imageDataUrl: string, metaLabel: string, customPrompt?: string) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    setOverlayDismissed(false);

    const effectivePrompt = (customPrompt ?? prompt).trim() || QUICK_PROMPTS[0];
    const timestampIso = new Date().toISOString();

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageDataUrl,
          prompt: effectivePrompt,
          provider: aiProvider,
          timestamp: timestampIso,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "L'analyse de la capture a échoué.");
      }

      const replyContent: string = data.response || data.reply || '';
      const serverTs: string = data.timestamp || timestampIso;
      const displayTime = new Date(serverTs).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const nextId = `capture_${Date.now()}`;
      setAnalysisId(nextId);
      setAnalysisText(replyContent);
      setAnalysisUsage(data.usage || null);
      setAnalysisTimestamp(displayTime);

      if (replyContent) {
        const entry: CaptureHistoryEntry = {
          id: nextId,
          timestampIso: serverTs,
          displayTime,
          imageUrl: imageDataUrl,
          meta: metaLabel,
          prompt: effectivePrompt,
          response: replyContent,
          usage: data.usage || undefined,
        };
        setHistory((prev) => [entry, ...prev].slice(0, 8));
      }

      if (autoRead && replyContent) {
        onSpeakText(nextId, replyContent);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Impossible de joindre /api/analyze pour analyser l'image."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeClick = async () => {
    setErrorMsg(null);

    if (streamMode && videoRef.current && videoRef.current.videoWidth > 0) {
      const frame = captureVideoFrameDataUrl();
      if (!frame) {
        setErrorMsg("La trame vidéo n'est pas encore prête. Patientez une seconde et réessayez.");
        return;
      }
      const { label } = getCompressionSettings();
      const meta = `Capture caméra · ${frame.width}×${frame.height} px · ${label}`;
      setSnapshotUrl(frame.dataUrl);
      setSnapshotMeta(meta);
      setOcrText(null);
      setOcrConfidence(null);
      setOcrCopied(false);
      await runAnalyzeRequest(frame.dataUrl, meta);
      return;
    }

    if (snapshotUrl) {
      await runAnalyzeRequest(snapshotUrl, snapshotMeta || 'Aperçu statique');
      return;
    }

    setErrorMsg(
      "Activez d'abord la caméra ou importez une photo à analyser."
    );
  };

  isAnalyzingRef.current = isAnalyzing;
  handleAnalyzeRef.current = handleAnalyzeClick;

  useEffect(() => {
    clearAutoCaptureTimer();

    if (!autoCaptureEnabled || !streamMode) {
      setAutoCaptureCountdown(autoCaptureSeconds);
      return;
    }

    setAutoCaptureCountdown(autoCaptureSeconds);
    let remaining = autoCaptureSeconds;

    autoCaptureIntervalRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = autoCaptureSeconds;
        setAutoCaptureCountdown(remaining);
        if (!isAnalyzingRef.current) {
          void handleAnalyzeRef.current();
        }
      } else {
        setAutoCaptureCountdown(remaining);
      }
    }, 1000);

    return () => {
      clearAutoCaptureTimer();
    };
  }, [autoCaptureEnabled, autoCaptureSeconds, streamMode]);

  const handleToggleAutoCapture = () => {
    if (!streamMode) {
      setErrorMsg("Activez d'abord la caméra pour démarrer l'auto-capture.");
      return;
    }
    setErrorMsg(null);
    setAutoCaptureEnabled((prev) => !prev);
  };

  const handleFallbackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) return;

      const img = new Image();
      img.onload = () => {
        const { maxDim, quality } = getCompressionSettings();
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
          setSnapshotUrl(optimized);
          setSnapshotMeta(`${file.name} · ${w}×${h} px`);
          setOcrText(null);
          setOcrConfidence(null);
          setOcrCopied(false);
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectHistoryEntry = (entry: CaptureHistoryEntry) => {
    setSnapshotUrl(entry.imageUrl);
    setSnapshotMeta(entry.meta);
    setPrompt(entry.prompt);
    setAnalysisId(entry.id);
    setAnalysisText(entry.response);
    setAnalysisUsage(entry.usage || null);
    setAnalysisTimestamp(entry.displayTime);
    setOverlayDismissed(false);
    setOcrText(null);
    setOcrConfidence(null);
    setOcrCopied(false);
  };

  const handleCopyResult = async () => {
    if (!analysisText) return;
    try {
      await navigator.clipboard.writeText(analysisText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignorer
    }
  };

  const handleExtractOcr = async () => {
    if (!snapshotUrl || isExtractingOcr) return;
    setErrorMsg(null);
    setOcrCopied(false);
    setIsExtractingOcr(true);
    setOcrProgress({ percent: 5, stage: 'Initialisation OCR...' });

    try {
      const { text, confidence } = await extractTextClientSide(snapshotUrl, (percent, stage) => {
        setOcrProgress({ percent, stage });
      });

      if (!text) {
        setOcrText('');
        setOcrConfidence(confidence);
        setErrorMsg("Aucun texte lisible n'a été détecté sur cette capture par le moteur OCR.");
        return;
      }

      setOcrText(text);
      setOcrConfidence(confidence);

      try {
        await navigator.clipboard.writeText(text);
        setOcrCopied(true);
        setTimeout(() => setOcrCopied(false), 3000);
      } catch {
        // Certains navigateurs bloquent le presse-papiers après une opération asynchrone :
        // le texte extrait reste visible avec un bouton Copier direct.
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? `Erreur OCR client-side : ${err.message}`
          : "Le moteur OCR client-side n'a pas pu analyser cette image."
      );
    } finally {
      setIsExtractingOcr(false);
      setOcrProgress({ percent: 0, stage: '' });
    }
  };

  const handleCopyOcrText = async () => {
    if (!ocrText) return;
    try {
      await navigator.clipboard.writeText(ocrText);
      setOcrCopied(true);
      setTimeout(() => setOcrCopied(false), 2500);
    } catch {
      // Ignorer
    }
  };

  const handleDownloadCapture = () => {
    setErrorMsg(null);
    setStatusMsg(null);

    const video = videoRef.current;
    if (video && video.srcObject && video.videoWidth > 0 && video.videoHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setErrorMsg("Impossible de préparer l'image pour le téléchargement.");
        return;
      }
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
      const link = document.createElement('a');
      link.download = 'capture-design.jpg';
      link.href = dataUrl;
      link.click();
      setStatusMsg('Image téléchargée avec succès');
      window.setTimeout(() => setStatusMsg(null), 4000);
      return;
    }

    if (snapshotUrl) {
      const link = document.createElement('a');
      link.download = 'capture-design.jpg';
      link.href = snapshotUrl;
      link.click();
      setStatusMsg('Image téléchargée avec succès');
      window.setTimeout(() => setStatusMsg(null), 4000);
      return;
    }

    setErrorMsg('Aucune capture active à télécharger.');
  };

  const isPlayingThis = currentPlayingId === analysisId;

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-6">
      {/* En-tête de module */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Monitor className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Capture IA en direct</span>
            <span aria-hidden="true">·</span>
            <span>
              Moteur :{' '}
              {aiProvider === 'claude'
                ? 'Claude 3.5 Sonnet'
                : aiProvider === 'deepseek'
                ? 'DeepSeek (deepseek-chat)'
                : 'Gemini Multimodal'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Analyseur caméra &amp; photo
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Active la caméra en direct ou importe une image pour capturer une trame nette (JPEG 0.95 par défaut ou 0.5 rapide) et obtenir une analyse horodatée via <code className="font-mono text-xs">/api/analyze</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">

          <button
            type="button"
            onClick={() => handleStartCamera()}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              streamMode === 'camera'
                ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-500'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
            }`}
            title="Activer la caméra (caméra arrière par défaut sur mobile)"
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>
              {streamMode === 'camera'
                ? cameraFacing === 'environment'
                  ? 'Caméra (Arrière)'
                  : 'Caméra (Avant)'
                : 'Caméra'}
            </span>
          </button>

          {streamMode === 'camera' && (
            <button
              type="button"
              onClick={handleFlipCamera}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              title="Basculer entre caméra arrière et frontale"
            >
              <SwitchCamera className="w-4 h-4 shrink-0" />
              <span>Basculer</span>
            </button>
          )}

          <input
            ref={fallbackInputRef}
            id="captureFileInput"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFallbackFileChange}
          />
          <button
            type="button"
            onClick={() => fallbackInputRef.current?.click()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Importer une image ou prendre une photo via l'appareil"
          >
            <ImagePlus className="w-4 h-4 shrink-0" />
            <span>Photo / Fichier</span>
          </button>

          {streamMode && (
            <button
              type="button"
              onClick={stopActiveStream}
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <Square className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Arrêter</span>
            </button>
          )}
        </div>
      </section>

      {/* Bannière d'erreur accessible (remplace window.alert) */}
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-sm flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-semibold text-rose-700 dark:text-rose-300 hover:underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Bannière de statut (téléchargement réussi) */}
      {statusMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 text-sm flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{statusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Espace principal : Flux vidéo / aperçu + Contrôles et Résultat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Colonne gauche : Aperçu flux vidéo + fenêtre flottante optionnelle + contrôle d'analyse */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-300">
              <span className="font-mono font-medium truncate">
                {streamMode === 'camera'
                  ? 'Flux actif : Caméra en direct'
                  : snapshotUrl
                  ? 'Aperçu statique prêt'
                  : 'Aucun flux actif'}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                {streamMode && analysisText && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowFloatingOverlay((prev) => !prev);
                      setOverlayDismissed(false);
                    }}
                    className="text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{showFloatingOverlay && !overlayDismissed ? 'Masquer flottant' : 'Fenêtre flottante'}</span>
                  </button>
                )}
                {streamMode && (
                  <span className="text-emerald-400 font-semibold">En direct</span>
                )}
              </div>
            </div>

            <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-contain ${
                  streamMode ? 'block' : 'hidden'
                }`}
              />

              {!streamMode && snapshotUrl && (
                <img
                  src={snapshotUrl}
                  alt="Capture importée"
                  onClick={() =>
                    onOpenLightbox(snapshotUrl, 'Capture prête pour analyse', snapshotMeta)
                  }
                  className="w-full h-full object-contain cursor-pointer"
                />
              )}

              {!streamMode && !snapshotUrl && (
                <div className="p-6 text-center space-y-3 max-w-md">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-emerald-400 flex items-center justify-center mx-auto">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">
                      Prêt à capturer via la caméra ou un fichier
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Clique sur « Caméra » ou « Photo / Fichier », puis lance « Analyser l&apos;image ».
                    </p>
                  </div>
                </div>
              )}

              {/* Fenêtre flottante de résultat en direct par-dessus le flux vidéo */}
              {streamMode && analysisText && showFloatingOverlay && !overlayDismissed && (
                <div
                  role="region"
                  aria-label="Résultat flottant Capture IA"
                  className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-md rounded-xl bg-slate-950/90 backdrop-blur-md border border-emerald-500/40 p-3 text-slate-100 shadow-lg space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-emerald-400">
                    <span className="font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>IA {analysisTimestamp ? `· ${analysisTimestamp}` : ''}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOverlayDismissed(true)}
                      className="text-slate-400 hover:text-white p-0.5 rounded"
                      aria-label="Fermer la fenêtre flottante"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-100 line-clamp-4 whitespace-pre-wrap">
                    {analysisText}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Instruction d'analyse & compression réseau */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="capture-prompt-input"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Instruction envoyée avec la capture
              </label>

              {/* Sélecteur de compression réseau (0.95 haute qualité par défaut vs 0.5 rapide) */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setCompression('hq')}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    compression === 'hq'
                      ? 'bg-white dark:bg-slate-950 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Capture JPEG 0.95 (1600px max) pour détails fins et OCR précis"
                >
                  HD (0.95)
                </button>
                <button
                  type="button"
                  onClick={() => setCompression('fast')}
                  className={`px-2 py-1 rounded-md transition-colors ${
                    compression === 'fast'
                      ? 'bg-white dark:bg-slate-950 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compression JPEG 0.5 (1280px max) pour réduire la latence réseau"
                >
                  Rapide (0.5)
                </button>
              </div>
            </div>

            <textarea
              id="capture-prompt-input"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex : Explique cette erreur, résume ce document, extrais les chiffres..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />

            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(q)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors text-left ${
                    prompt === q
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-500/50'
                  }`}
                >
                  {q.length > 48 ? `${q.slice(0, 48)}…` : q}
                </button>
              ))}
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAnalyzeClick}
                disabled={isAnalyzing || (!streamMode && !snapshotUrl)}
                className="flex-1 min-w-[180px] min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>Analyse en cours...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Analyser l&apos;image</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleToggleAutoCapture}
                disabled={!streamMode && !autoCaptureEnabled}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  autoCaptureEnabled
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                title="Capture et analyse automatique périodique tant que le flux est actif"
              >
                {autoCaptureEnabled ? (
                  <>
                    <Pause className="w-3.5 h-3.5 shrink-0" />
                    <span className="tabular-nums">Auto · {autoCaptureCountdown}s</span>
                  </>
                ) : (
                  <>
                    <Timer className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Auto-Capture</span>
                  </>
                )}
              </button>

              <select
                aria-label="Intervalle d'auto-capture"
                value={autoCaptureSeconds}
                onChange={(e) => setAutoCaptureSeconds(Number(e.target.value))}
                className="min-h-[44px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                title="Fréquence de capture automatique"
              >
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={15}>15s</option>
                <option value={30}>30s</option>
              </select>

              <button
                type="button"
                onClick={handleDownloadCapture}
                className="btn-download min-h-[44px] px-4 py-2.5 rounded-xl bg-[#ffc107] hover:bg-[#ffca2c] text-black font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                title="Télécharger l'image de la capture en qualité maximale (JPEG 1.0)"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Télécharger Capture</span>
              </button>

              {snapshotUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setSnapshotUrl(null);
                    setSnapshotMeta('');
                    setAnalysisText('');
                    setAnalysisUsage(null);
                    setAnalysisTimestamp('');
                    setOcrText(null);
                    setOcrConfidence(null);
                  }}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Effacer</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite : Dernière trame capturée + Analyse IA + Historique horodaté */}
        <div className="lg:col-span-5 space-y-4">
          {snapshotUrl && (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Dernier instantané envoyé
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadCapture}
                    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                    title="Télécharger capture-design.jpg"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Télécharger</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenLightbox(snapshotUrl, 'Instantané Capture IA', snapshotMeta)
                    }
                    className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Agrandir</span>
                  </button>
                </div>
              </div>
              <div
                onClick={() =>
                  onOpenLightbox(snapshotUrl, 'Instantané Capture IA', snapshotMeta)
                }
                className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <img
                  src={snapshotUrl}
                  alt="Dernier instantané capturé"
                  className="w-full h-full object-contain"
                />
              </div>
              {snapshotMeta && (
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {snapshotMeta}
                </p>
              )}
            </div>
          )}

          <div
            id="result-ui"
            className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Résultat de l&apos;analyse IA
              </h2>
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {analysisTimestamp && <span>{analysisTimestamp}</span>}
                {analysisUsage && (
                  <>
                    {analysisTimestamp && <span aria-hidden="true">·</span>}
                    <span>{analysisUsage.modelName}</span>
                  </>
                )}
              </div>
            </div>

            {isAnalyzing ? (
              <div className="py-10 flex flex-col items-center justify-center text-center gap-3 text-slate-500 dark:text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium">
                  Extraction visuelle et analyse en cours...
                </p>
              </div>
            ) : analysisText ? (
              <div className="space-y-4">
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                  {analysisText}
                </div>

                {analysisUsage && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-700/60 tabular-nums">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        ~{analysisUsage.totalTokens.toLocaleString('fr-FR')} tokens ({analysisUsage.promptTokens} in / {analysisUsage.candidatesTokens} out)
                      </span>
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                      <Coins className="w-3 h-3 shrink-0" />
                      <span>{formatCost(analysisUsage.estimatedCostUsd)}</span>
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSpeakText(analysisId, analysisText)}
                      className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        isPlayingThis
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {isPlayingThis ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                          <span>Arrêter</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Écouter</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyResult}
                      className="min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 shrink-0" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>

                    {snapshotUrl && (
                      <button
                        type="button"
                        onClick={handleExtractOcr}
                        disabled={isExtractingOcr}
                        className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                          ocrCopied
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                        }`}
                        title="Reconnaître et copier tout le texte visible sur l'image via OCR local (Tesseract.js)"
                      >
                        {isExtractingOcr ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span className="tabular-nums">
                              OCR {ocrProgress.percent > 0 ? `${ocrProgress.percent}%` : '...'}
                            </span>
                          </>
                        ) : ocrCopied ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Texte copié</span>
                          </>
                        ) : (
                          <>
                            <ScanText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Extraire texte</span>
                          </>
                        )}
                      </button>
                    )}
                      <button
                        type="button"
                        onClick={() => {
                          if (!analysisText) return;
                          sauvegarderDansMemoire(
                            prompt.trim() || 'Analyse Capture IA',
                            analysisText,
                            'capture-ia'
                          );
                          setMemorized(true);
                          setStatusMsg('Analyse enregistrée dans visionia_memoire.');
                          window.setTimeout(() => setMemorized(false), 2500);
                          window.setTimeout(() => setStatusMsg(null), 3500);
                        }}
                        className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                          memorized
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                        }`}
                        title="Enregistrer cette analyse dans visionia_memoire"
                      >
                        {memorized ? (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Brain className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        )}
                        <span>{memorized ? 'Mémorisé' : 'Mémoriser'}</span>
                      </button>
                  </div>

                  {snapshotUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        onSendToMultimodal(
                          snapshotUrl,
                          prompt.trim() || QUICK_PROMPTS[0],
                          analysisText,
                          analysisUsage || undefined
                        )
                      }
                      className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <span>Continuer dans Vision IA</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  )}
                </div>

                {/* Panneau de texte OCR client-side reconnu */}
                {(isExtractingOcr || (ocrText !== null && ocrText.length > 0)) && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <ScanText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          {isExtractingOcr
                            ? ocrProgress.stage || 'Extraction OCR en cours...'
                            : 'Texte reconnu (OCR client-side)'}
                        </span>
                        {!isExtractingOcr && ocrConfidence !== null && (
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            · {ocrConfidence}% confiance
                          </span>
                        )}
                      </div>

                      {!isExtractingOcr && ocrText && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleCopyOcrText}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors"
                          >
                            {ocrCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Copié</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copier OCR</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOcrText(null);
                              setOcrConfidence(null);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            aria-label="Fermer le texte OCR"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {isExtractingOcr ? (
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 dark:bg-emerald-400 transition-all duration-200"
                          style={{ width: `${Math.max(8, ocrProgress.percent)}%` }}
                        />
                      </div>
                    ) : (
                      <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200 max-h-52 overflow-y-auto select-all">
                        {ocrText}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed py-4">
                Aucune analyse effectuée pour le moment. Capturez une image depuis votre écran ou caméra puis cliquez sur « Analyser l&apos;image ».
              </p>
            )}
          </div>

          {/* Historique horodaté des captures */}
          {history.length > 0 && (
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Historique horodaté ({history.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setHistory([])}
                  className="text-[11px] font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors"
                >
                  Vider
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {history.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleSelectHistoryEntry(entry)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-colors flex items-start gap-2.5 ${
                      analysisId === entry.id
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700'
                        : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50'
                    }`}
                  >
                    <img
                      src={entry.imageUrl}
                      alt={`Capture ${entry.displayTime}`}
                      className="w-16 h-10 rounded-lg object-cover bg-slate-900 shrink-0 border border-slate-200 dark:border-slate-800"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {entry.displayTime}
                        </span>
                        <span className="truncate">{entry.usage?.modelName || 'IA'}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                        {entry.response}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
