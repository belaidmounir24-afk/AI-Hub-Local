import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Volume1,
  Volume2,
  VolumeX,
  Settings,
  Play,
  Square,
  Gauge,
  Cpu,
  Check,
  Terminal,
  Zap,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import { AiProvider, OllamaConfig } from '../types';
import {
  SpeechSettings,
  getAvailableVoices,
  isSpeechSynthesisSupported,
  cleanTextForSpeech,
} from '../utils/speechManager';
import {
  DEFAULT_OPTIMIZATION_CONFIG,
  VisionOptimizationConfig,
} from '../utils/optimizationConfig';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SpeechSettings;
  onUpdateSettings: (newSettings: SpeechSettings) => void;
  aiProvider: AiProvider;
  onUpdateAiProvider: (provider: AiProvider) => void;
  ollamaConfig: OllamaConfig;
  onUpdateOllamaConfig: (config: OllamaConfig) => void;
  optimizationConfig: VisionOptimizationConfig;
  onUpdateOptimizationConfig: (config: VisionOptimizationConfig) => Promise<void> | void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  aiProvider,
  onUpdateAiProvider,
  ollamaConfig,
  onUpdateOllamaConfig,
  optimizationConfig,
  onUpdateOptimizationConfig,
  reducedMotion,
  onToggleReducedMotion,
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    hasApiKey: boolean;
    hasAnthropicKey: boolean;
    hasDeepSeekKey: boolean;
  } | null>(null);
  const lastNonZeroVolumeRef = useRef<number>(settings.volume > 0 ? settings.volume : 1.0);
  const isSupported = isSpeechSynthesisSupported();

  useEffect(() => {
    if (settings.volume > 0) {
      lastNonZeroVolumeRef.current = settings.volume;
    }
  }, [settings.volume]);

  useEffect(() => {
    if (!isSupported) return;

    const updateVoices = () => {
      const v = getAvailableVoices();
      setVoices(v);
    };

    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [isSupported]);

  useEffect(() => {
    if (!isOpen && isPlayingSample && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlayingSample(false);
    }
  }, [isOpen, isPlayingSample]);

  useEffect(() => {
    if (!isOpen) return;
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
        // Ignorer silencieusement si hors-ligne
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestVoice = () => {
    if (!isSupported) return;

    if (isPlayingSample) {
      window.speechSynthesis.cancel();
      setIsPlayingSample(false);
      return;
    }

    window.speechSynthesis.cancel();

    const sampleText = cleanTextForSpeech(
      'Bonjour ! La synthèse vocale Web Speech API est active. Vos réponses seront lues à haute voix avec ces réglages.'
    );

    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;

    if (settings.voiceUri) {
      const found = voices.find(
        (v) => v.voiceURI === settings.voiceUri || v.name === settings.voiceUri
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

    utterance.onstart = () => setIsPlayingSample(true);
    utterance.onend = () => setIsPlayingSample(false);
    utterance.onerror = () => setIsPlayingSample(false);

    window.speechSynthesis.speak(utterance);
  };

  const volumePercent = Math.round(settings.volume * 100);
  const handleToggleMute = () => {
    if (settings.volume > 0) {
      lastNonZeroVolumeRef.current = settings.volume;
      onUpdateSettings({ ...settings, volume: 0 });
    } else {
      onUpdateSettings({
        ...settings,
        volume: lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 1.0,
      });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                Réglages AI Hub Local
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ollama Termux · Moteurs Cloud · Synthèse vocale
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Fermer les réglages"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps des réglages */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Section Ollama Local (Termux) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Ollama Local (Android Termux)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Port 11434
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="settings-ollama-endpoint"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  URL du serveur Ollama
                </label>
                <input
                  id="settings-ollama-endpoint"
                  type="url"
                  value={ollamaConfig.endpoint}
                  onChange={(e) =>
                    onUpdateOllamaConfig({ ...ollamaConfig, endpoint: e.target.value })
                  }
                  placeholder="http://127.0.0.1:11434"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="settings-ollama-model"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Modèle par défaut
                </label>
                <input
                  id="settings-ollama-model"
                  type="text"
                  value={ollamaConfig.model}
                  onChange={(e) =>
                    onUpdateOllamaConfig({ ...ollamaConfig, model: e.target.value })
                  }
                  placeholder="qwen:7b"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="settings-ollama-system"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Instruction système (Ollama)
              </label>
              <textarea
                id="settings-ollama-system"
                rows={2}
                value={ollamaConfig.systemPrompt}
                onChange={(e) =>
                  onUpdateOllamaConfig({ ...ollamaConfig, systemPrompt: e.target.value })
                }
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800" />

          {/* Section Fournisseur IA Cloud (Vision IA) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Moteur d'Analyse Multimodale (Cloud)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {aiProvider === 'claude'
                  ? 'Anthropic SDK'
                  : aiProvider === 'deepseek'
                  ? 'DeepSeek API'
                  : 'Google GenAI'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => onUpdateAiProvider('gemini')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  aiProvider === 'gemini'
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Gemini Multimodal
                  </span>
                  {aiProvider === 'gemini' && (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Images &amp; vidéos haute vélocité
                </p>
                {healthStatus && (
                  <p
                    className={`mt-2 text-[11px] font-medium ${
                      healthStatus.hasApiKey
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {healthStatus.hasApiKey ? 'Clé prête' : 'Clé non détectée'}
                  </p>
                )}
              </button>

              <button
                type="button"
                onClick={() => onUpdateAiProvider('claude')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  aiProvider === 'claude'
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Claude 3.5 Sonnet
                  </span>
                  {aiProvider === 'claude' && (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  SDK @anthropic-ai/sdk (Vision)
                </p>
                {healthStatus && (
                  <p
                    className={`mt-2 text-[11px] font-medium ${
                      healthStatus.hasAnthropicKey
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {healthStatus.hasAnthropicKey
                      ? 'Clé prête'
                      : 'ANTHROPIC_API_KEY requise'}
                  </p>
                )}
              </button>

              <button
                type="button"
                onClick={() => onUpdateAiProvider('deepseek')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  aiProvider === 'deepseek'
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    DeepSeek Chat
                  </span>
                  {aiProvider === 'deepseek' && (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  deepseek-chat · mode agentic
                </p>
                {healthStatus && (
                  <p
                    className={`mt-2 text-[11px] font-medium ${
                      healthStatus.hasDeepSeekKey
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {healthStatus.hasDeepSeekKey
                      ? 'Clé prête'
                      : 'DEEPSEEK_API_KEY requise'}
                  </p>
                )}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800" />

          {/* Section Optimisation Agentique (visionia_optimization.json) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Configuration Agentique (visionia_optimization.json)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => void onUpdateOptimizationConfig(DEFAULT_OPTIMIZATION_CONFIG)}
                className="text-[11px] font-semibold text-slate-500 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Défaut</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              v{optimizationConfig.system_config.version} · Frameworks :{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {optimizationConfig.system_config.active_frameworks.join(' · ')}
              </span>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label
                  htmlFor="opt-mode"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Mode d&apos;exécution
                </label>
                <select
                  id="opt-mode"
                  value={optimizationConfig.system_config.mode}
                  onChange={(e) =>
                    void onUpdateOptimizationConfig({
                      ...optimizationConfig,
                      system_config: {
                        ...optimizationConfig.system_config,
                        mode: e.target.value === 'Standard' ? 'Standard' : 'Agentic_Native',
                      },
                    })
                  }
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Agentic_Native">Agentic_Native</option>
                  <option value="Standard">Standard</option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="opt-vector"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Accès vectoriel mémoire
                </label>
                <select
                  id="opt-vector"
                  value={optimizationConfig.system_config.performance_optimizations.vector_db_access}
                  onChange={(e) =>
                    void onUpdateOptimizationConfig({
                      ...optimizationConfig,
                      system_config: {
                        ...optimizationConfig.system_config,
                        performance_optimizations: {
                          ...optimizationConfig.system_config.performance_optimizations,
                          vector_db_access:
                            e.target.value === 'Local_Only' ? 'Local_Only' : 'Pinecone_Ready',
                        },
                      },
                    })
                  }
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Pinecone_Ready">Pinecone_Ready</option>
                  <option value="Local_Only">Local_Only</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  void onUpdateOptimizationConfig({
                    ...optimizationConfig,
                    system_config: {
                      ...optimizationConfig.system_config,
                      performance_optimizations: {
                        ...optimizationConfig.system_config.performance_optimizations,
                        long_term_memory:
                          optimizationConfig.system_config.performance_optimizations
                            .long_term_memory === 'enabled'
                            ? 'disabled'
                            : 'enabled',
                      },
                    },
                  })
                }
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
              >
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Mémoire long terme
                </span>
                <span
                  className={`font-mono font-bold ${
                    optimizationConfig.system_config.performance_optimizations.long_term_memory ===
                    'enabled'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {optimizationConfig.system_config.performance_optimizations.long_term_memory}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  void onUpdateOptimizationConfig({
                    ...optimizationConfig,
                    system_config: {
                      ...optimizationConfig.system_config,
                      performance_optimizations: {
                        ...optimizationConfig.system_config.performance_optimizations,
                        eval_loop:
                          optimizationConfig.system_config.performance_optimizations.eval_loop ===
                          'active'
                            ? 'inactive'
                            : 'active',
                      },
                    },
                  })
                }
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
              >
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Boucle d&apos;évaluation
                </span>
                <span
                  className={`font-mono font-bold ${
                    optimizationConfig.system_config.performance_optimizations.eval_loop ===
                    'active'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {optimizationConfig.system_config.performance_optimizations.eval_loop}
                </span>
              </button>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="opt-priority"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Priorité d&apos;instruction système
              </label>
              <textarea
                id="opt-priority"
                rows={2}
                value={optimizationConfig.system_config.instruction_priority}
                onChange={(e) =>
                  void onUpdateOptimizationConfig({
                    ...optimizationConfig,
                    system_config: {
                      ...optimizationConfig.system_config,
                      instruction_priority: e.target.value,
                    },
                  })
                }
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800" />

          {/* Section Synthèse Vocale */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  Synthèse Vocale (Web Speech API)
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {isSupported ? 'Disponible' : 'Non pris en charge'}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="space-y-0.5 pr-4">
                <label
                  htmlFor="toggle-auto-read"
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  Lecture automatique des réponses
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lit automatiquement le dernier message de l'IA dès sa réception.
                </p>
              </div>
              <button
                id="toggle-auto-read"
                type="button"
                role="switch"
                aria-checked={settings.autoRead}
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    autoRead: !settings.autoRead,
                  })
                }
                disabled={!isSupported}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                  settings.autoRead ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.autoRead ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {isSupported && (
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label
                    htmlFor="select-voice"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Voix de lecture
                  </label>
                  <select
                    id="select-voice"
                    value={settings.voiceUri}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        voiceUri: e.target.value,
                      })
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Voix française recommandée par défaut</option>
                    {voices.map((v, index) => {
                      const voiceKey = `voice-${index}-${v.voiceURI || v.name || v.lang}`;
                      const voiceValue = v.voiceURI || v.name;
                      return (
                        <option key={voiceKey} value={voiceValue}>
                          {v.name} ({v.lang})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleMute}
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        title={settings.volume === 0 ? 'Rétablir le volume' : 'Couper le volume'}
                        aria-label={settings.volume === 0 ? 'Rétablir le volume' : 'Couper le volume'}
                      >
                        {settings.volume === 0 ? (
                          <VolumeX className="w-4 h-4 text-rose-500" />
                        ) : settings.volume < 0.5 ? (
                          <Volume1 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </button>
                      <label
                        htmlFor="slider-volume"
                        className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Volume de lecture
                      </label>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {settings.volume === 0 ? 'Muet (0%)' : `${volumePercent}%`}
                    </span>
                  </div>
                  <input
                    id="slider-volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.volume}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        volume: parseFloat(e.target.value),
                      })
                    }
                    aria-label="Volume de la synthèse vocale"
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-slate-500" />
                      Vitesse d'élocution
                    </span>
                    <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">
                      {settings.rate.toFixed(1)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.5"
                    step="0.1"
                    value={settings.rate}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        rate: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleTestVoice}
                  className={`w-full min-h-[44px] px-4 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                    isPlayingSample
                      ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-300'
                      : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  {isPlayingSample ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      Arrêter l'échantillon vocal
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Tester la voix configurée
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800" />

          {/* Accessibilité : Animations réduites */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2.5 pr-4">
              <Zap className="w-4 h-4 text-slate-600 dark:text-slate-300 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Animations réduites
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Désactive les transitions rapides pour plus de confort.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={reducedMotion}
              onClick={onToggleReducedMotion}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                reducedMotion ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  reducedMotion ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Pied du modal */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            Enregistrer et fermer
          </button>
        </div>
      </div>
    </div>
  );
};
