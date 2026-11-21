import React from 'react';
import { Home, Terminal, Eye, Monitor, FileSpreadsheet, LayoutGrid, Layers } from 'lucide-react';
import { HubAppId } from '../types';

interface MobileAppStripProps {
  activeApp: HubAppId;
  onSelectApp: (app: HubAppId) => void;
}

const APPS: Array<{
  id: HubAppId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'hub', label: 'Accueil', icon: Home },
  { id: 'studio', label: 'Studio Pro', icon: LayoutGrid },
  { id: 'ollama', label: 'Chat Local', icon: Terminal },
  { id: 'multimodal', label: 'Vision IA', icon: Eye },
  { id: 'capture', label: 'Capture IA', icon: Monitor },
  { id: 'orchestrator', label: 'Low-RAM', icon: Layers },
  { id: 'exports', label: 'Rapports', icon: FileSpreadsheet },
];

export const MobileAppStrip: React.FC<MobileAppStripProps> = ({
  activeApp,
  onSelectApp,
}) => {
  return (
    <div
      role="navigation"
      aria-label="Barre d'applications mobile"
      className="md:hidden w-full border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 px-3 py-2 overflow-x-auto no-scrollbar"
    >
      <div className="flex items-center gap-1.5 min-w-max">
        {APPS.map((app) => {
          const Icon = app.icon;
          const isActive = activeApp === app.id;
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => onSelectApp(app.id)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isActive
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-xs'
                  : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80 hover:border-emerald-500/50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{app.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
