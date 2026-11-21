import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Eye,
  FileSpreadsheet,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Smartphone,
  Server,
  Monitor,
  LayoutGrid,
} from 'lucide-react';
import { AiProvider, HubAppId, OllamaConfig } from '../types';
import { OllamaTagsResult } from '../utils/ollamaClient';

interface HubHomeProps {
  onSelectApp: (app: HubAppId) => void;
  ollamaConfig: OllamaConfig;
  ollamaStatus: OllamaTagsResult | null;
  isCheckingOllama: boolean;
  onProbeOllama: () => void;
  aiProvider: AiProvider;
  ollamaMessageCount: number;
  multimodalMessageCount: number;
  onOpenSettings: () => void;
}

export const HubHome: React.FC<HubHomeProps> = ({
  onSelectApp,
  ollamaConfig,
  ollamaStatus,
  isCheckingOllama,
  onProbeOllama,
  aiProvider,
  ollamaMessageCount,
  multimodalMessageCount,
  onOpenSettings,
}) => {
  const [healthStatus, setHealthStatus] = useState<{
    hasApiKey: boolean;
    hasAnthropicKey: boolean;
    hasDeepSeekKey: boolean;
  } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setHealthStatus({
            hasApiKey: Boolean(data.hasApiKey),
            hasAnthropicKey: Boolean(data.hasAnthropicKey),
            hasDeepSeekKey: Boolean(data.hasDeepSeekKey),
          });
        }
      })
      .catch(() => {
        // Ignorer si hors-ligne
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCopyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd(null), 2000);
    } catch {
      // Ignorer
    }
  };

  const termuxServeCmd = 'OLLAMA_ORIGINS="*" ollama serve';
  const termuxPullCmd = `ollama pull ${ollamaConfig.model || 'qwen:7b'}`;

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* En-tête de bienvenue Android / Desktop */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Environnement Android &amp; Bureau</span>
            <span aria-hidden="true">·</span>
            <span>Radar Ollama 5s + Cloud Multimodal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
            Choisis une application pour démarrer
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Exécute un modèle local sur ton appareil via Termux ou analyse des images et vidéos haute définition avec Gemini et Claude.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onSelectApp('studio')}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span>Ouvrir Studio Pro</span>
          </button>
          <button
            type="button"
            onClick={onProbeOllama}
            disabled={isCheckingOllama}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <RefreshCw className={`w-4 h-4 ${isCheckingOllama ? 'animate-spin' : ''}`} />
            <span>Tester Ollama</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <span>Configurer les moteurs</span>
          </button>
        </div>
      </section>

      {/* Grille des applications principales */}
      <section aria-label="Applications disponibles" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* Carte 1 : Chat Local Ollama (Termux) */}
        <article className="flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Terminal className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {ollamaStatus?.reachable ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-300">
                      Ollama Prêt{ollamaStatus.models.length > 0 ? ` · ${ollamaStatus.models.length} modèle${ollamaStatus.models.length > 1 ? 's' : ''}` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-slate-500 dark:text-slate-400">
                      {isCheckingOllama && !ollamaStatus ? 'Vérif. Ollama...' : 'Ollama Hors Ligne'}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Chat Mémoire + Stream (Ollama)
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Dialogue hors-ligne en streaming avec mémoire locale persistante sur ton serveur Ollama dans Termux.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              <span>{ollamaConfig.endpoint}</span>
              <span aria-hidden="true">·</span>
              <span>{ollamaConfig.model}</span>
              {ollamaMessageCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{ollamaMessageCount} msg</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectApp('ollama')}
            className="mt-6 w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <span>Ouvrir Chat Local</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </article>

        {/* Carte 2 : Vision & Médias (Cloud Gemini / Claude) */}
        <article className="flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0">
                <Eye className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Server className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {aiProvider === 'claude'
                    ? 'Claude 3.5 Sonnet'
                    : aiProvider === 'deepseek'
                    ? 'DeepSeek Chat'
                    : 'Gemini Multimodal'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Vision &amp; Médias IA
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Analyse d'images (1600 px) et extraction de trames vidéo toutes les 2 secondes avec commandes slash et lecture vocale.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              <span>
                Gemini {healthStatus ? (healthStatus.hasApiKey ? 'prêt' : 'non configuré') : '...'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Claude {healthStatus ? (healthStatus.hasAnthropicKey ? 'prêt' : 'inactif') : '...'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                DeepSeek {healthStatus ? (healthStatus.hasDeepSeekKey ? 'prêt' : 'inactif') : '...'}
              </span>
              {multimodalMessageCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{multimodalMessageCount} msg</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectApp('multimodal')}
            className="mt-6 w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <span>Ouvrir Vision IA</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </article>

        {/* Carte 3 : Capture IA (Caméra en direct & Photo) */}
        <article className="flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Caméra · Photo · /api/analyze
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Capture IA en direct
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Active la caméra ou importe une photo pour capturer un instantané JPEG et lancer une analyse IA immédiate.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>Caméra HD</span>
              <span aria-hidden="true">·</span>
              <span>Photo / Fichier</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectApp('capture')}
            className="mt-6 w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <span>Ouvrir Capture IA</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </article>

        {/* Carte 4 : Rapports PDF/Excel, Export Android & API RAG */}
        <article className="flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                PDF · Excel · Android WebView
              </span>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Rapports &amp; Export Android
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Exporte tes sessions en PDF/Excel, télécharge le fichier Android autonome ou teste /api/rag-query.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-slate-500 dark:text-slate-400">
              <span>index.html Android</span>
              <span aria-hidden="true">·</span>
              <span>update_project.py</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectApp('exports')}
            className="mt-6 w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <span>Ouvrir Rapports</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </article>
      </section>

      {/* Guide rapide Termux / Android pour Ollama */}
      <section className="p-5 sm:p-6 rounded-2xl bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Connexion Android Termux (Ollama sur le port 11434)
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Lance ces commandes dans Termux pour autoriser la WebView Android ou le navigateur à communiquer avec 127.0.0.1:11434.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                1. Démarrer le serveur avec CORS autorisé
              </p>
              <code className="block text-xs font-mono text-slate-900 dark:text-emerald-400 truncate">
                {termuxServeCmd}
              </code>
            </div>
            <button
              type="button"
              onClick={() => handleCopyCommand(termuxServeCmd)}
              className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Copier la commande ollama serve"
              title="Copier la commande"
            >
              {copiedCmd === termuxServeCmd ? (
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                2. Télécharger le modèle par défaut
              </p>
              <code className="block text-xs font-mono text-slate-900 dark:text-emerald-400 truncate">
                {termuxPullCmd}
              </code>
            </div>
            <button
              type="button"
              onClick={() => handleCopyCommand(termuxPullCmd)}
              className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Copier la commande ollama pull"
              title="Copier la commande"
            >
              {copiedCmd === termuxPullCmd ? (
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
