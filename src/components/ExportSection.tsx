import React, { useState, useEffect } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Brain,
} from 'lucide-react';
import { ChatMessage } from '../types';
import { downloadReport, ReportFormat } from '../utils/reportExporter';
import { chargerMemoire } from '../utils/visionMemory';

interface ExportSectionProps {
  messages: ChatMessage[];
  onOpenMemory?: () => void;
}

export const ExportSection: React.FC<ExportSectionProps> = ({ messages, onOpenMemory }) => {
  const [downloadingFormat, setDownloadingFormat] = useState<ReportFormat | null>(null);
  const [successFormat, setSuccessFormat] = useState<ReportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [memoryCount, setMemoryCount] = useState<number>(() => chargerMemoire().length);

  useEffect(() => {
    const sync = () => setMemoryCount(chargerMemoire().length);
    window.addEventListener('visionia-memory-updated', sync);
    return () => window.removeEventListener('visionia-memory-updated', sync);
  }, []);

  const handleDownload = async (format: ReportFormat) => {
    setExportError(null);
    setSuccessFormat(null);
    setDownloadingFormat(format);

    try {
      await downloadReport(format, messages);
      setSuccessFormat(format);
      setTimeout(() => setSuccessFormat(null), 3000);
    } catch (err: unknown) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la génération du fichier.'
      );
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <section
      aria-label="Exporter les résultats"
      className="w-full p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-3 text-left"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Exporter les résultats
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {messages.length > 0
                ? 'Téléchargez le rapport complet et les métriques de la session.'
                : 'Téléchargez un rapport d’analyse modèle au format PDF ou Excel.'}
            </p>
          </div>
        </div>

        {onOpenMemory && (
          <button
            type="button"
            onClick={onOpenMemory}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:border-emerald-500 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors tabular-nums"
          >
            <Brain className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Mémoire IA ({memoryCount})</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <button
          type="button"
          onClick={() => handleDownload('pdf')}
          disabled={downloadingFormat !== null}
          className="flex-1 h-11 px-4 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          {downloadingFormat === 'pdf' ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          ) : successFormat === 'pdf' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <FileText className="w-4 h-4 shrink-0" />
          )}
          <span>
            {downloadingFormat === 'pdf'
              ? 'Génération PDF...'
              : successFormat === 'pdf'
              ? 'PDF téléchargé'
              : 'Télécharger en PDF'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleDownload('excel')}
          disabled={downloadingFormat !== null}
          className="flex-1 h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-slate-950 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          {downloadingFormat === 'excel' ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          ) : successFormat === 'excel' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
          )}
          <span>
            {downloadingFormat === 'excel'
              ? 'Génération Excel...'
              : successFormat === 'excel'
              ? 'Excel téléchargé'
              : 'Télécharger en Excel'}
          </span>
        </button>
      </div>

      {exportError && (
        <div
          role="alert"
          className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 px-3 py-2 rounded-xl"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{exportError}</span>
        </div>
      )}
    </section>
  );
};
