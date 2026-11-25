import React, { useEffect, useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Smartphone,
  Code2,
} from 'lucide-react';
import { ChatMessage, OllamaConfig, OllamaMessage } from '../types';
import { downloadReport, ReportFormat } from '../utils/reportExporter';
import {
  generateAndroidIndexHtml,
  generateUpdateProjectPy,
  triggerTextDownload,
} from '../utils/androidExporter';

import { McpGatewayPanel } from './McpGatewayPanel';
import { FileVisualizerPlugin } from './FileVisualizerPlugin';
import { AppBuilderStudio } from './AppBuilderStudio';

export type ReportsTabId = 'mcp' | 'builder' | 'visualizer' | 'exports';

interface ReportsHubAppProps {
  multimodalMessages: ChatMessage[];
  ollamaMessages: OllamaMessage[];
  ollamaConfig: OllamaConfig;
  initialTab?: ReportsTabId;
  onOpenSettings?: () => void;
}

export const ReportsHubApp: React.FC<ReportsHubAppProps> = ({
  multimodalMessages,
  ollamaMessages,
  ollamaConfig,
  initialTab = 'mcp',
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<ReportsTabId>(initialTab);
  const [source, setSource] = useState<'multimodal' | 'ollama'>('multimodal');

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);
  const [successFormat, setSuccessFormat] = useState<ReportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Testeur /api/rag-query
  const [ragQuery, setRagQuery] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragResponse, setRagResponse] = useState<string | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);

  const normalizedMessages: ChatMessage[] =
    source === 'multimodal'
      ? multimodalMessages
      : ollamaMessages.map((m) => ({
          id: m.id,
          role: m.role === 'assistant' ? 'model' : m.role,
          text: m.text,
          timestamp: m.timestamp,
          isError: m.isError,
        }));

  const handleExport = async (format: ReportFormat) => {
    setExportError(null);
    setSuccessFormat(null);
    setDownloading(format);
    try {
      await downloadReport(format, normalizedMessages);
      setSuccessFormat(format);
      setTimeout(() => setSuccessFormat(null), 3000);
    } catch (err: unknown) {
      setExportError(
        err instanceof Error ? err.message : 'Erreur lors de la génération du fichier.'
      );
    } finally {
      setDownloading(null);
    }
  };

  const handleExportMarkdown = () => {
    const valid = normalizedMessages.filter((m) => m.role !== 'system');
    if (valid.length === 0) {
      setExportError('Aucun message dans cette session à exporter en Markdown.');
      return;
    }

    const transcript = valid
      .map((m) => {
        const author = m.role === 'user' ? 'Utilisateur' : 'Assistant IA';
        return `### ${author} (${m.timestamp})\n\n${m.text}\n`;
      })
      .join('\n---\n\n');

    triggerTextDownload(
      `ai-hub-${source}-${new Date().toISOString().slice(0, 10)}.md`,
      transcript,
      'text/markdown;charset=utf-8'
    );
  };

  const handleDownloadAndroidHtml = () => {
    const html = generateAndroidIndexHtml(ollamaConfig.endpoint, ollamaConfig.model);
    triggerTextDownload('index.html', html, 'text/html;charset=utf-8');
  };

  const handleDownloadUpdatePy = () => {
    const py = generateUpdateProjectPy(ollamaConfig.endpoint, ollamaConfig.model);
    triggerTextDownload('update_project.py', py, 'text/x-python;charset=utf-8');
  };

  const handleTestRag = async () => {
    const q = ragQuery.trim();
    if (!q || ragLoading) return;
    setRagLoading(true);
    setRagError(null);
    setRagResponse(null);

    try {
      const res = await fetch('/api/rag-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Erreur API RAG');
      }
      setRagResponse(data.response || JSON.stringify(data));
    } catch (err: unknown) {
      setRagError(err instanceof Error ? err.message : 'Impossible de joindre /api/rag-query');
    } finally {
      setRagLoading(false);
    }
  };

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Passerelle MCP, Visualiseur &amp; Rapports
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Serveur MCP local, passerelle API REST/GraphQL, visualiseur de fichiers React et exports PDF/Excel/Android.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Modules Passerelle et Rapports"
          className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shrink-0"
        >
          {(
            [
              { id: 'mcp', label: 'Passerelle MCP & GraphQL' },
              { id: 'builder', label: 'App Builder & Pitch Deck' },
              { id: 'visualizer', label: 'Visualiseur & Vision' },
              { id: 'exports', label: 'Exports & Android' },
            ] as Array<{ id: ReportsTabId; label: string }>
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'mcp' && <McpGatewayPanel />}

      {activeTab === 'builder' && <AppBuilderStudio onOpenSettings={onOpenSettings} />}

      {activeTab === 'visualizer' && <FileVisualizerPlugin />}

      {activeTab === 'exports' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Exportateur PDF / Excel / Markdown */}
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Exportation des sessions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choisis la source de conversation à compiler dans ton rapport.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setSource('multimodal')}
              className={`flex-1 min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                source === 'multimodal'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Vision IA ({multimodalMessages.length})
            </button>
            <button
              type="button"
              onClick={() => setSource('ollama')}
              className={`flex-1 min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                source === 'ollama'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Chat Local Ollama ({ollamaMessages.length})
            </button>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={downloading !== null}
              className="w-full min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {downloading === 'pdf' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : successFormat === 'pdf' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>
                {downloading === 'pdf'
                  ? 'Génération PDF...'
                  : successFormat === 'pdf'
                  ? 'Rapport PDF téléchargé'
                  : 'Télécharger en PDF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('excel')}
              disabled={downloading !== null}
              className="w-full min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {downloading === 'excel' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : successFormat === 'excel' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>
                {downloading === 'excel'
                  ? 'Génération Excel...'
                  : successFormat === 'excel'
                  ? 'Fichier Excel téléchargé'
                  : 'Télécharger en Excel (.xlsx)'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportMarkdown}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exporter en Markdown (.md)</span>
            </button>
          </div>

          {exportError && (
            <div
              role="alert"
              className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 px-3 py-2.5 rounded-xl"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{exportError}</span>
            </div>
          )}
        </section>

        {/* Export Android WebView autonome (app/src/main/assets/index.html & update_project.py) */}
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Pack Android WebView Autonome
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Génère le fichier pour <span className="font-mono">app/src/main/assets/index.html</span> avec radar 5s, mémoire locale et streaming.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400 space-y-1">
            <p className="truncate">Endpoint : {ollamaConfig.endpoint}</p>
            <p className="truncate">Modèle : {ollamaConfig.model}</p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleDownloadAndroidHtml}
              className="w-full min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Télécharger index.html (Android Assets)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadUpdatePy}
              className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Code2 className="w-4 h-4" />
              <span>Télécharger update_project.py</span>
            </button>
          </div>
        </section>

        {/* Testeur API RAG pour Android */}
        <section className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Testeur API /api/rag-query
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vérifie la route JSON légère utilisée par tes requêtes Android externes.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTestRag();
              }}
              placeholder="Saisis une requête de test..."
              className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleTestRag}
              disabled={!ragQuery.trim() || ragLoading}
              className="min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              {ragLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Envoyer</span>
            </button>
          </div>

          {ragResponse && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
              {ragResponse}
            </div>
          )}

          {ragError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
              {ragError}
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
};
