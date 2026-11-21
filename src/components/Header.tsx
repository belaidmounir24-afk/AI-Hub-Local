import React from 'react';
import {
  Sun,
  Moon,
  Trash2,
  HelpCircle,
  Volume2,
  VolumeX,
  Settings,
  Square,
  Cpu,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { HubAppId } from '../types';

interface HeaderProps {
  activeApp: HubAppId;
  onSelectApp: (app: HubAppId) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onClearHistory: () => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  isSpeechEnabled: boolean;
  onToggleSpeech: () => void;
  isSpeaking: boolean;
  onStopSpeech: () => void;
  showClearAction: boolean;
  ollamaReachable: boolean | null;
}

const NAV_ITEMS: Array<{ id: HubAppId; label: string }> = [
  { id: 'hub', label: 'Accueil' },
  { id: 'studio', label: 'Studio Pro' },
  { id: 'ollama', label: 'Chat Local' },
  { id: 'multimodal', label: 'Vision IA' },
  { id: 'capture', label: 'Capture IA' },
  { id: 'orchestrator', label: 'Low-RAM' },
  { id: 'exports', label: 'Rapports' },
];

export const Header: React.FC<HeaderProps> = ({
  activeApp,
  onSelectApp,
  isDark,
  onToggleTheme,
  onClearHistory,
  onOpenHelp,
  onOpenSettings,
  isSpeechEnabled,
  onToggleSpeech,
  isSpeaking,
  onStopSpeech,
  showClearAction,
  ollamaReachable,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 md:gap-8">
        {/* Zone 1 : Marque sur une seule ligne */}
        <button
          type="button"
          onClick={() => onSelectApp('hub')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg pr-1"
        >
          <span className="w-8 h-8 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4" />
          </span>
          <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            AI Hub Local
          </span>
        </button>

        {/* Zone 2 : Liens de navigation desktop */}
        <nav
          aria-label="Applications du Hub"
          className="hidden md:flex items-center gap-5"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeApp === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectApp(item.id)}
                className={`relative h-14 px-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isActive
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 dark:bg-emerald-400 rounded-t"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3 : Radar Ollama + Actions utilitaires */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onSelectApp('ollama')}
            className="hidden sm:flex min-h-[44px] px-2.5 rounded-lg items-center gap-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Statut du radar Ollama local (vérification automatique toutes les 5s)"
          >
            {ollamaReachable === true ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-emerald-700 dark:text-emerald-400">Ollama Prêt</span>
              </>
            ) : ollamaReachable === false ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Ollama Hors Ligne</span>
              </>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">Vérif. Ollama...</span>
            )}
          </button>

          {isSpeaking ? (
            <button
              type="button"
              onClick={onStopSpeech}
              className="h-11 px-3 rounded-lg flex items-center gap-1.5 bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/80 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              title="Arrêter la lecture vocale"
              aria-label="Arrêter la lecture vocale"
            >
              <Square className="w-4 h-4 fill-current shrink-0" />
              <span className="text-xs font-semibold hidden sm:inline">Arrêter</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleSpeech}
              className={`w-11 h-11 rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isSpeechEnabled
                  ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={
                isSpeechEnabled
                  ? 'Lecture vocale active (cliquer pour couper)'
                  : 'Lecture vocale coupée (cliquer pour activer)'
              }
              aria-label="Bascule de la lecture à haute voix"
            >
              {isSpeechEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-11 h-11 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Réglages (Ollama, Moteurs IA, Voix)"
            aria-label="Ouvrir les réglages"
          >
            <Settings className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onOpenHelp}
            className="hidden sm:flex w-11 h-11 rounded-lg items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Guide et commandes (/aide)"
            aria-label="Ouvrir le guide et les commandes"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="w-11 h-11 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            title={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
            aria-label="Basculer entre thème clair et sombre"
          >
            {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          {showClearAction && (
            <button
              type="button"
              onClick={onClearHistory}
              className="w-11 h-11 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              title="Effacer la conversation active"
              aria-label="Effacer la conversation active"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
