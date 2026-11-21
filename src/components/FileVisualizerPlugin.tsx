import React, { useRef, useState } from 'react';
import {
  FileCode2,
  ImagePlus,
  ScanText,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Search,
  AlertCircle,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import { extractTextClientSide } from '../utils/ocrClient';
import { formatFileSize, processAttachedFiles } from '../utils/fileProcessor';
import { sauvegarderDansMemoire } from '../utils/visionMemory';
import { McpBlueprint } from './McpGatewayPanel';

interface VisualizedFileState {
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'json' | 'text';
  rawText?: string;
  imageUrl?: string;
  dimensions?: string;
  blueprint?: McpBlueprint | null;
}

export const FileVisualizerPlugin: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileState, setFileState] = useState<VisualizedFileState | null>(null);
  const [lineFilter, setLineFilter] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Pipeline automatisé d'images (OCR + Vision IA)
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrResult, setOcrResult] = useState<{ text: string; confidence: number } | null>(null);
  const [visionPrompt, setVisionPrompt] = useState<string>(
    'Analyse automatiquement cette image : identifie les éléments visuels, le texte clé et les actions recommandées.'
  );
  const [visionReply, setVisionReply] = useState<string>('');
  const [applyingBlueprint, setApplyingBlueprint] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const detectBlueprint = (parsed: unknown): McpBlueprint | null => {
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Partial<McpBlueprint>;
    if (
      typeof obj.titre === 'string' &&
      (Array.isArray(obj.actions_mcp_recommandees) || Array.isArray(obj.entites))
    ) {
      return {
        titre: obj.titre,
        resume: typeof obj.resume === 'string' ? obj.resume : '',
        entites: Array.isArray(obj.entites) ? obj.entites : [],
        points_cles: Array.isArray(obj.points_cles) ? obj.points_cles : [],
        actions_mcp_recommandees: Array.isArray(obj.actions_mcp_recommandees)
          ? obj.actions_mcp_recommandees
          : [],
      };
    }
    return null;
  };

  const handleLoadActiveBlueprint = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/v1/blueprint');
      if (!res.ok) throw new Error('Impossible de charger le blueprint actif.');
      const bp = (await res.json()) as McpBlueprint;
      const pretty = JSON.stringify(bp, null, 2);
      setFileState({
        name: 'mcp_blueprint.json',
        mimeType: 'application/json',
        size: new Blob([pretty]).size,
        kind: 'json',
        rawText: pretty,
        blueprint: bp,
      });
      setOcrResult(null);
      setVisionReply('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de chargement.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setStatusMsg(null);
    setOcrResult(null);
    setVisionReply('');
    setLineFilter('');

    if (file.type.startsWith('image/')) {
      setIsProcessing(true);
      try {
        const processed = await processAttachedFiles([file]);
        const item = processed[0];
        const imageUrl = item?.dataUrl || item?.previewUrl;
        if (!imageUrl) {
          throw new Error("Impossible d'optimiser cette image.");
        }
        setFileState({
          name: file.name,
          mimeType: item.mimeType || file.type,
          size: file.size,
          kind: 'image',
          imageUrl,
          dimensions: 'Optimisé ≤ 1600 px (JPEG)',
        });
        setStatusMsg('Image optimisée (≤ 1600 px) et prête pour le pipeline vision/OCR.');
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Erreur de lecture de l'image.");
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    try {
      const text = await file.text();
      let kind: 'json' | 'text' = 'text';
      let blueprint: McpBlueprint | null = null;
      let formattedText = text;

      if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
        kind = 'json';
        try {
          const parsed = JSON.parse(text);
          formattedText = JSON.stringify(parsed, null, 2);
          blueprint = detectBlueprint(parsed);
        } catch {
          // Garder le texte brut si JSON malformé
        }
      }

      setFileState({
        name: file.name,
        mimeType: file.type || 'text/plain',
        size: file.size,
        kind,
        rawText: formattedText,
        blueprint,
      });
    } catch {
      setErrorMsg('Impossible de lire le contenu de ce fichier.');
    }
  };

  const handleRunAutomatedImagePipeline = async (mode: 'ocr' | 'vision' | 'both') => {
    if (!fileState?.imageUrl) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      let extractedOcrText = '';
      if (mode === 'ocr' || mode === 'both') {
        setOcrProgress(5);
        const resOcr = await extractTextClientSide(fileState.imageUrl, (pct) => {
          setOcrProgress(pct);
        });
        setOcrResult(resOcr);
        extractedOcrText = resOcr.text;
      }

      if (mode === 'vision' || mode === 'both') {
        const enrichedPrompt = extractedOcrText
          ? `${visionPrompt}\n\n[Texte OCR local extrait]\n${extractedOcrText}`
          : visionPrompt;
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: fileState.imageUrl,
            prompt: enrichedPrompt,
            provider: 'gemini',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Erreur lors de l'analyse visuelle.");
        }
        const reply = data.reply || data.response || '';
        setVisionReply(reply);
        if (reply) {
          sauvegarderDansMemoire(`Vision Auto · ${fileState.name}`, reply, 'vision-ia');
        }
      }

      setStatusMsg(
        mode === 'ocr'
          ? 'Extraction OCR terminée.'
          : 'Pipeline image automatisé terminé et mémorisé dans visionia_memoire.'
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur du pipeline image.');
    } finally {
      setIsProcessing(false);
      setOcrProgress(0);
    }
  };

  const handleApplyBlueprintToMcp = async () => {
    if (!fileState?.blueprint) return;
    setApplyingBlueprint(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/blueprint', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fileState.blueprint),
      });
      if (!res.ok) throw new Error('Échec de la mise à jour sur le serveur MCP.');
      setStatusMsg('Blueprint appliqué au serveur MCP et à la passerelle GraphQL.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur serveur MCP.');
    } finally {
      setApplyingBlueprint(false);
    }
  };

  const lines = fileState?.rawText ? fileState.rawText.split('\n') : [];
  const filteredLines = lineFilter.trim()
    ? lines
        .map((line, index) => ({ line, num: index + 1 }))
        .filter((item) => item.line.toLowerCase().includes(lineFilter.toLowerCase()))
    : lines.map((line, index) => ({ line, num: index + 1 }));

  return (
    <div className="space-y-5">
      {/* Barre de contrôle du plugin */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Plugin de Visualisation de Fichiers &amp; Vision Automatisée
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inspectez des fichiers JSON, code source, texte ou lancez le pipeline automatisé d&apos;images (1600 px · OCR · Vision).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.json,.md,.txt,.ts,.tsx,.js,.jsx,.py,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => void handleLoadActiveBlueprint()}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <FileCode2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Charger Blueprint MCP</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Ouvrir un fichier</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {statusMsg && (
          <div
            role="status"
            className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
      </section>

      {!fileState ? (
        <section className="py-16 px-6 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
          <ImagePlus className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Aucun fichier sélectionné dans le visualiseur
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Importez une image pour le traitement automatisé (OCR + Vision IA) ou ouvrez un fichier JSON / TypeScript / Python pour l&apos;inspecter.
            </p>
          </div>
        </section>
      ) : (
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          {/* Métadonnées du fichier (Zéro pilule, chiffres tabulaires) */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="space-y-1 min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                {fileState.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                <span>{fileState.mimeType}</span>
                <span aria-hidden="true">·</span>
                <span>{formatFileSize(fileState.size)}</span>
                {fileState.dimensions && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{fileState.dimensions}</span>
                  </>
                )}
                {fileState.kind !== 'image' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{lines.length} lignes</span>
                  </>
                )}
              </div>
            </div>

            {fileState.rawText && (
              <div className="flex items-center gap-2">
                {fileState.blueprint && (
                  <button
                    type="button"
                    onClick={() => void handleApplyBlueprintToMcp()}
                    disabled={applyingBlueprint}
                    className="min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                  >
                    {applyingBlueprint ? 'Synchronisation...' : 'Synchroniser vers MCP'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(fileState.rawText || '');
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    } catch {
                      // Ignorer
                    }
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copié' : 'Copier'}</span>
                </button>
              </div>
            )}
          </div>

          {fileState.kind === 'image' && fileState.imageUrl ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-6 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <img
                  src={fileState.imageUrl}
                  alt={fileState.name}
                  className="w-full max-h-[440px] object-contain"
                />
              </div>

              <div className="lg:col-span-6 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="auto-vision-prompt"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Instruction du pipeline Vision automatisé
                  </label>
                  <textarea
                    id="auto-vision-prompt"
                    rows={3}
                    value={visionPrompt}
                    onChange={(e) => setVisionPrompt(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleRunAutomatedImagePipeline('ocr')}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2"
                  >
                    {isProcessing && ocrProgress > 0 ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    ) : (
                      <ScanText className="w-4 h-4 text-emerald-600" />
                    )}
                    <span className="tabular-nums">
                      {ocrProgress > 0 ? `OCR ${ocrProgress}%` : 'OCR local uniquement'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleRunAutomatedImagePipeline('both')}
                    className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50 text-white dark:text-slate-950 text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>Pipeline Auto (OCR + Vision)</span>
                  </button>
                </div>

                {ocrResult && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span>Texte extrait (OCR local)</span>
                      <span className="font-mono tabular-nums">{ocrResult.confidence}% confiance</span>
                    </div>
                    <pre className="text-xs font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200 max-h-40 overflow-y-auto">
                      {ocrResult.text || '(Aucun texte détecté)'}
                    </pre>
                  </div>
                )}

                {visionReply && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Analyse Vision IA (enregistrée dans visionia_memoire)
                    </div>
                    <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                      {visionReply}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={lineFilter}
                  onChange={(e) => setLineFilter(e.target.value)}
                  placeholder="Filtrer les lignes du fichier..."
                  className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 max-h-[440px] overflow-auto font-mono text-xs">
                {filteredLines.map((item) => (
                  <div
                    key={item.num}
                    className="flex items-start gap-3 px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-900/70"
                  >
                    <span className="w-9 text-right text-slate-400 select-none tabular-nums shrink-0">
                      {item.num}
                    </span>
                    <span className="whitespace-pre-wrap break-all text-slate-800 dark:text-slate-200">
                      {item.line || ' '}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
