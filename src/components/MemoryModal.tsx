import React, { useEffect, useState } from 'react';
import {
  X,
  Brain,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  ArrowRight,
  Clock,
} from 'lucide-react';
import {
  VisionMemoryEntry,
  chercherDansMemoire,
  sauvegarderDansMemoire,
  supprimerDeMemoire,
  viderMemoire,
} from '../utils/visionMemory';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseMemoryPrompt?: (text: string) => void;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  onUseMemoryPrompt,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [entries, setEntries] = useState<VisionMemoryEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshEntries = (term = searchTerm) => {
    setEntries(chercherDansMemoire(term));
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshEntries(searchTerm);

    const onUpdated = () => refreshEntries(searchTerm);
    window.addEventListener('visionia-memory-updated', onUpdated);
    return () => {
      window.removeEventListener('visionia-memory-updated', onUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, searchTerm]);

  if (!isOpen) return null;

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() && !newContent.trim()) return;
    sauvegarderDansMemoire(
      newTitle.trim() || 'Note mémorisée',
      newContent.trim() || newTitle.trim(),
      'manuel'
    );
    setNewTitle('');
    setNewContent('');
    setShowAddForm(false);
    refreshEntries(searchTerm);
  };

  const handleCopyEntry = async (entry: VisionMemoryEntry) => {
    try {
      await navigator.clipboard.writeText(`${entry.titre}\n\n${entry.contenu}`);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignorer
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 id="memory-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                Mémoire Vision IA
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {entries.length} entrée{entries.length > 1 ? 's' : ''} stockée{entries.length > 1 ? 's' : ''} dans <code className="font-mono">visionia_memoire</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Fermer la mémoire"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre de recherche et bouton d'ajout */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher dans la mémoire (chercherDansMemoire)..."
                className="w-full min-h-[44px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Ajouter note</span>
            </button>
          </div>

          {showAddForm && (
            <form
              onSubmit={handleSaveManual}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
            >
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titre de la connaissance ou analyse..."
                className="w-full min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <textarea
                rows={3}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Contenu détaillé à mémoriser pour les prochaines questions..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Liste des souvenirs */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {entries.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Clock className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {searchTerm.trim()
                  ? `Aucun résultat pour « ${searchTerm} »`
                  : 'Mémoire locale vide pour le moment'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Cliquez sur « Mémoriser » sous n&apos;importe quelle réponse IA, ou lancez une analyse dans Studio Pro : l&apos;IA consultera automatiquement ces données lors de vos prochaines questions.
              </p>
            </div>
          ) : (
            entries.map((entry) => (
              <article
                key={entry.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {entry.titre}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {entry.date}
                      {entry.source ? ` · ${entry.source}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyEntry(entry)}
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                      title="Copier"
                      aria-label="Copier ce souvenir"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntries(supprimerDeMemoire(entry.id))}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      title="Supprimer"
                      aria-label="Supprimer ce souvenir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
                  {entry.contenu}
                </p>

                {onUseMemoryPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      onUseMemoryPrompt(
                        `En te basant sur l'élément mémorisé « ${entry.titre} » (${entry.date}), approfondis ou réponds à ma demande :`
                      );
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline pt-1"
                  >
                    <span>Utiliser dans Vision IA</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </article>
            ))
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                viderMemoire();
                refreshEntries('');
              }}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
            >
              Vider toute la mémoire
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs font-semibold transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
