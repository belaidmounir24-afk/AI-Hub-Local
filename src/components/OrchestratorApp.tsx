import React, { useEffect, useRef, useState } from 'react';
import {
  Layers,
  ScanText,
  Play,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Brain,
  ImagePlus,
  RefreshCw,
} from 'lucide-react';
import { AiProvider, OllamaConfig } from '../types';
import { extractTextClientSide } from '../utils/ocrClient';
import { generateOllamaResponse, OllamaTagsResult } from '../utils/ollamaClient';
import { sauvegarderDansMemoire } from '../utils/visionMemory';

type StepNumber = 1 | 2 | 3 | 4;
type OrchestratorEngine = AiProvider | 'ollama';

interface StepMeta {
  step: StepNumber;
  role: 'PLANNER' | 'WRITER' | 'REVIEWER' | 'MERGER';
  title: string;
  description: string;
}

const PIPELINE_STEPS: StepMeta[] = [
  {
    step: 1,
    role: 'PLANNER',
    title: '01. PLANNER',
    description: 'Analyse le besoin et découpe en sous-tâches simples.',
  },
  {
    step: 2,
    role: 'WRITER',
    title: '02. WRITER',
    description: 'Génère le code pour une seule sous-tâche (≤ 150 lignes).',
  },
  {
    step: 3,
    role: 'REVIEWER',
    title: '03. REVIEWER',
    description: 'Vérifie syntaxe et optimisation mémoire uniquement.',
  },
  {
    step: 4,
    role: 'MERGER',
    title: '04. MERGER',
    description: 'Assemble les segments validés en résultat final.',
  },
];

interface OrchestratorAppProps {
  aiProvider: AiProvider;
  ollamaConfig: OllamaConfig;
  ollamaStatus: OllamaTagsResult | null;
}

function extractSummaryFromOutput(text: string): string {
  const match = text.match(/\*\*Résumé d['’]État\*\*\s*:?\s*([\s\S]*?)(?=ÉTAPE\s+\d+\s+TERMINÉE|$)/i);
  if (match && match[1]) {
    return match[1].trim().slice(0, 420);
  }
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('ÉTAPE '));
  return lines.slice(-3).join(' ').slice(0, 420);
}

function extractSubtasksFromPlanner(text: string): string[] {
  const matches = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(\d+[.)]|[-*])\s+/.test(l))
    .map((l) => l.replace(/^(\d+[.)]|[-*])\s+/, '').trim())
    .filter((l) => l.length > 4 && !l.toLowerCase().startsWith('résumé'));
  return matches.slice(0, 8);
}

function countCodeLines(text: string): number {
  const blocks = [...text.matchAll(/```[\w-]*\n([\s\S]*?)```/g)];
  if (blocks.length > 0) {
    return blocks.reduce((acc, m) => acc + m[1].split('\n').length, 0);
  }
  return text.split('\n').length;
}

function buildClientStepSystemPrompt(step: StepNumber): string {
  const base = [
    "Tu es l'Agent Multi-Rôles du Système d'Orchestration Séquentiel (Low-RAM).",
    'Tu ne traites QU’UNE SEULE étape à la fois.',
    'Contraintes RAM absolues :',
    '- Ne génère JAMAIS plus de 150 lignes de code par bloc.',
    '- Produis un **Résumé d’État** très court (2 à 3 lignes max) à la fin.',
    `- Termine impérativement par la ligne exacte : "ÉTAPE ${step} TERMINÉE - RAM LIBÉRÉE"`,
  ];
  if (step === 1) {
    base.push(
      'Rôle actif : ÉTAPE 1 (PLANNER). Analyse le besoin et découpe-le en sous-tâches simples numérotées (1., 2., 3...). Ne génère pas encore le code.'
    );
  } else if (step === 2) {
    base.push(
      'Rôle actif : ÉTAPE 2 (WRITER). Génère le code correspondant UNIQUEMENT à la sous-tâche demandée (strictement ≤ 150 lignes). Si le projet dépasse 150 lignes, demande validation de ce segment.'
    );
  } else if (step === 3) {
    base.push(
      'Rôle actif : ÉTAPE 3 (REVIEWER). Vérifie UNIQUEMENT les erreurs de syntaxe et l’optimisation mémoire sur ce bloc (≤ 150 lignes).'
    );
  } else {
    base.push(
      'Rôle actif : ÉTAPE 4 (MERGER). Assemble proprement les segments validés en résultat final concis.'
    );
  }
  return base.join('\n');
}

const STORAGE_KEY_ORCHESTRATOR_STATE = 'aihub_lowram_orchestrator_v1';

interface SavedOrchestratorState {
  engine: OrchestratorEngine;
  currentStep: StepNumber;
  goalInput: string;
  selectedSubtask: string;
  suggestedSubtasks: string[];
  stateSummary: string;
  activeCodeBlock: string;
  validatedSegments: string[];
  stepOutput: string;
  lastLineCount: number;
  ramReleasedCount: number;
}

function loadSavedOrchestratorState(defaultProvider: AiProvider): SavedOrchestratorState {
  const fallback: SavedOrchestratorState = {
    engine: defaultProvider,
    currentStep: 1,
    goalInput: '',
    selectedSubtask: '',
    suggestedSubtasks: [],
    stateSummary: '',
    activeCodeBlock: '',
    validatedSegments: [],
    stepOutput: '',
    lastLineCount: 0,
    ramReleasedCount: 0,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ORCHESTRATOR_STATE);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SavedOrchestratorState>;
    const validStep: StepNumber =
      parsed.currentStep === 2 || parsed.currentStep === 3 || parsed.currentStep === 4
        ? parsed.currentStep
        : 1;
    const validEngine: OrchestratorEngine =
      parsed.engine === 'claude' ||
      parsed.engine === 'deepseek' ||
      parsed.engine === 'ollama' ||
      parsed.engine === 'gemini'
        ? parsed.engine
        : defaultProvider;
    return {
      engine: validEngine,
      currentStep: validStep,
      goalInput: typeof parsed.goalInput === 'string' ? parsed.goalInput : '',
      selectedSubtask: typeof parsed.selectedSubtask === 'string' ? parsed.selectedSubtask : '',
      suggestedSubtasks: Array.isArray(parsed.suggestedSubtasks)
        ? parsed.suggestedSubtasks.filter((s): s is string => typeof s === 'string')
        : [],
      stateSummary: typeof parsed.stateSummary === 'string' ? parsed.stateSummary : '',
      activeCodeBlock: typeof parsed.activeCodeBlock === 'string' ? parsed.activeCodeBlock : '',
      validatedSegments: Array.isArray(parsed.validatedSegments)
        ? parsed.validatedSegments.filter((s): s is string => typeof s === 'string')
        : [],
      stepOutput: typeof parsed.stepOutput === 'string' ? parsed.stepOutput : '',
      lastLineCount:
        typeof parsed.lastLineCount === 'number' && parsed.lastLineCount >= 0
          ? parsed.lastLineCount
          : 0,
      ramReleasedCount:
        typeof parsed.ramReleasedCount === 'number' && parsed.ramReleasedCount >= 0
          ? parsed.ramReleasedCount
          : 0,
    };
  } catch {
    return fallback;
  }
}

function persistOrchestratorState(payload: SavedOrchestratorState) {
  try {
    localStorage.setItem(STORAGE_KEY_ORCHESTRATOR_STATE, JSON.stringify(payload));
  } catch {
    try {
      localStorage.setItem(
        STORAGE_KEY_ORCHESTRATOR_STATE,
        JSON.stringify({
          ...payload,
          stepOutput: '',
          activeCodeBlock: '',
          validatedSegments: payload.validatedSegments.slice(-4),
        })
      );
    } catch {
      // Quota localStorage plein
    }
  }
}

export const OrchestratorApp: React.FC<OrchestratorAppProps> = ({
  aiProvider,
  ollamaConfig,
  ollamaStatus,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialSavedRef = useRef<SavedOrchestratorState | null>(null);
  if (!initialSavedRef.current) {
    initialSavedRef.current = loadSavedOrchestratorState(aiProvider);
  }
  const initialSaved = initialSavedRef.current;

  const [engine, setEngine] = useState<OrchestratorEngine>(initialSaved.engine);
  const [currentStep, setCurrentStep] = useState<StepNumber>(initialSaved.currentStep);
  const [goalInput, setGoalInput] = useState<string>(initialSaved.goalInput);
  const [selectedSubtask, setSelectedSubtask] = useState<string>(initialSaved.selectedSubtask);
  const [suggestedSubtasks, setSuggestedSubtasks] = useState<string[]>(initialSaved.suggestedSubtasks);
  const [stateSummary, setStateSummary] = useState<string>(initialSaved.stateSummary);
  const [activeCodeBlock, setActiveCodeBlock] = useState<string>(initialSaved.activeCodeBlock);
  const [validatedSegments, setValidatedSegments] = useState<string[]>(initialSaved.validatedSegments);

  const [stepOutput, setStepOutput] = useState<string>(initialSaved.stepOutput);
  const [lastLineCount, setLastLineCount] = useState<number>(initialSaved.lastLineCount);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [ramReleasedCount, setRamReleasedCount] = useState<number>(initialSaved.ramReleasedCount);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isOcrRunning, setIsOcrRunning] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(() =>
    initialSaved.goalInput ||
    initialSaved.validatedSegments.length > 0 ||
    initialSaved.currentStep > 1 ||
    initialSaved.stepOutput ||
    initialSaved.stateSummary
      ? `Session Low-RAM restaurée (Étape ${initialSaved.currentStep} · ${initialSaved.validatedSegments.length} segment(s) validé(s)).`
      : null
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [memorized, setMemorized] = useState<boolean>(false);

  const latestPayloadRef = useRef<SavedOrchestratorState>(initialSaved);

  // Sauvegarde automatique dans le localStorage pour reprendre après un rafraîchissement
  useEffect(() => {
    const payload: SavedOrchestratorState = {
      engine,
      currentStep,
      goalInput,
      selectedSubtask,
      suggestedSubtasks,
      stateSummary,
      activeCodeBlock,
      validatedSegments,
      stepOutput,
      lastLineCount,
      ramReleasedCount,
    };
    latestPayloadRef.current = payload;
    persistOrchestratorState(payload);
  }, [
    engine,
    currentStep,
    goalInput,
    selectedSubtask,
    suggestedSubtasks,
    stateSummary,
    activeCodeBlock,
    validatedSegments,
    stepOutput,
    lastLineCount,
    ramReleasedCount,
  ]);

  useEffect(() => {
    const handleFlush = () => {
      persistOrchestratorState(latestPayloadRef.current);
    };
    window.addEventListener('pagehide', handleFlush);
    return () => {
      window.removeEventListener('pagehide', handleFlush);
    };
  }, []);

  const handleOcrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setStatusMsg(null);
    setIsOcrRunning(true);
    setOcrProgress(5);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error("Impossible de lire l'image."));
        reader.readAsDataURL(file);
      });

      const { text, confidence } = await extractTextClientSide(dataUrl, (pct) => {
        setOcrProgress(pct);
      });

      if (!text) {
        setErrorMsg("Aucun texte lisible n'a été détecté via l'OCR local.");
        return;
      }

      setGoalInput((prev) =>
        prev.trim()
          ? `${prev.trim()}\n\n[Texte OCR extrait de ${file.name} (${confidence}%)]\n${text}`
          : `[Texte OCR extrait de ${file.name} (${confidence}%)]\n${text}`
      );
      setStatusMsg(
        `OCR terminé (${confidence}%) : texte léger injecté sans charger l'image dans le LLM.`
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Échec de l'extraction OCR locale.");
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(0);
    }
  };

  const handleRunCurrentStep = async () => {
    setErrorMsg(null);
    setStatusMsg(null);

    if (currentStep === 1 && !goalInput.trim()) {
      setErrorMsg("Saisissez un besoin ou importez une image via l'OCR local.");
      return;
    }
    if (currentStep === 2 && !selectedSubtask.trim() && !goalInput.trim()) {
      setErrorMsg('Indiquez la sous-tâche unique à générer à cette étape.');
      return;
    }
    if (currentStep === 3 && !activeCodeBlock.trim()) {
      setErrorMsg('Aucun bloc de code actif à vérifier (exécutez d’abord l’étape 2).');
      return;
    }

    setIsRunning(true);
    const t0 = Date.now();

    try {
      let outputText = '';
      let lineCount = 0;

      if (engine === 'ollama') {
        const promptParts = [
          `Besoin : ${goalInput.trim() || '(voir résumé)'}`,
          stateSummary ? `Résumé d'État précédent : ${stateSummary}` : '',
          currentStep === 2 && selectedSubtask
            ? `Sous-tâche unique à coder (≤ 150 lignes) : ${selectedSubtask}`
            : '',
          currentStep === 3 && activeCodeBlock ? `Code à auditer :\n${activeCodeBlock}` : '',
          currentStep === 4
            ? `Segments validés à assembler :\n${(validatedSegments.length > 0
                ? validatedSegments
                : [activeCodeBlock]
              )
                .filter(Boolean)
                .join('\n\n---\n\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n');

        const res = await generateOllamaResponse({
          endpoint: ollamaConfig.endpoint,
          model: ollamaConfig.model,
          prompt: promptParts,
          systemPrompt: buildClientStepSystemPrompt(currentStep),
          stream: false,
        });
        outputText = res.response;
        lineCount = countCodeLines(outputText);
      } else {
        const res = await fetch('/api/orchestrate-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: currentStep,
            provider: engine,
            goal: goalInput.trim(),
            stateSummary: stateSummary.trim(),
            subtask: selectedSubtask.trim(),
            codeBlock:
              currentStep === 4
                ? (validatedSegments.length > 0 ? validatedSegments : [activeCodeBlock])
                    .filter(Boolean)
                    .join('\n\n---\n\n')
                : activeCodeBlock,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Erreur lors de l'étape ${currentStep}.`);
        }
        outputText = data.output || '';
        lineCount = typeof data.lineCount === 'number' ? data.lineCount : countCodeLines(outputText);
      }

      setStepOutput(outputText);
      setLastLineCount(lineCount);
      setLastLatencyMs(Date.now() - t0);

      if (currentStep === 1) {
        const parsed = extractSubtasksFromPlanner(outputText);
        setSuggestedSubtasks(parsed);
        if (parsed.length > 0 && !selectedSubtask) {
          setSelectedSubtask(parsed[0]);
        }
      } else if (currentStep === 2 || currentStep === 3) {
        setActiveCodeBlock(outputText);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Impossible d'exécuter l'étape d'orchestration."
      );
    } finally {
      setIsRunning(false);
    }
  };

  // Libère explicitement le contexte précédent et conserve uniquement le Résumé d'État
  const handleValidateAndReleaseRam = () => {
    if (!stepOutput.trim()) return;
    const compactSummary = extractSummaryFromOutput(stepOutput);
    setStateSummary(compactSummary);

    if (currentStep === 3 && activeCodeBlock.trim()) {
      setValidatedSegments((prev) => [...prev, activeCodeBlock]);
    }

    setRamReleasedCount((c) => c + 1);
    setStepOutput('');

    if (currentStep < 4) {
      const next = (currentStep + 1) as StepNumber;
      setCurrentStep(next);
      setStatusMsg(
        `ÉTAPE ${currentStep} TERMINÉE - RAM LIBÉRÉE · Contexte purgé, seul le Résumé d'État est conservé pour l'étape ${next}.`
      );
    } else {
      setStatusMsg('ÉTAPE 4 TERMINÉE - RAM LIBÉRÉE · Segment final validé.');
    }
  };

  const handleResetPipeline = () => {
    setCurrentStep(1);
    setGoalInput('');
    setStateSummary('');
    setActiveCodeBlock('');
    setStepOutput('');
    setSuggestedSubtasks([]);
    setSelectedSubtask('');
    setValidatedSegments([]);
    setRamReleasedCount(0);
    setLastLineCount(0);
    setLastLatencyMs(null);
    setErrorMsg(null);
    try {
      localStorage.removeItem(STORAGE_KEY_ORCHESTRATOR_STATE);
    } catch {
      // Ignorer
    }
    setStatusMsg('Pipeline réinitialisé et sauvegarde locale effacée.');
  };

  const activeMeta = PIPELINE_STEPS[currentStep - 1];

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* En-tête */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Orchestration Séquentielle (Low-RAM)</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">≤ 150 lignes / bloc</span>
            {ramReleasedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{ramReleasedCount} purge(s) RAM</span>
              </>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Pipeline Séquentiel à Faible Empreinte
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Une seule étape à la fois (PLANNER → WRITER → REVIEWER → MERGER), avec OCR local pour les images et libération explicite du contexte entre segments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Moteur Low-RAM"
            className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            {(['gemini', 'claude', 'deepseek', 'ollama'] as OrchestratorEngine[]).map((item) => {
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
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
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

          <button
            type="button"
            onClick={handleResetPipeline}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </section>

      {/* Sélecteur des 4 étapes séquentielles */}
      <nav aria-label="Étapes du pipeline" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {PIPELINE_STEPS.map((item) => {
          const isActive = currentStep === item.step;
          return (
            <button
              key={item.step}
              type="button"
              onClick={() => setCurrentStep(item.step)}
              className={`p-3.5 rounded-2xl border text-left transition-colors ${
                isActive
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <p
                className={`text-xs font-bold tabular-nums ${
                  isActive
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {item.title}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                {item.description}
              </p>
            </button>
          );
        })}
      </nav>

      {/* Alertes */}
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 text-xs sm:text-sm flex items-center justify-between gap-3"
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
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm flex items-center justify-between gap-3"
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

      {/* Espace principal en 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Entrée de l'étape active */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Entrée · {activeMeta.title}
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleOcrImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isOcrRunning}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-500 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
              title="Extraire le texte d'une image par OCR local sans charger l'image dans le LLM"
            >
              {isOcrRunning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
                  <span className="tabular-nums">OCR {ocrProgress}%</span>
                </>
              ) : (
                <>
                  <ImagePlus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Image → OCR</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="lowram-goal"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Besoin ou texte extrait (OCR prioritaire)
            </label>
            <textarea
              id="lowram-goal"
              rows={4}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="Décrivez votre objectif technique ou importez une capture via « Image → OCR »..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {stateSummary && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span>Résumé d&apos;État actif (contexte léger)</span>
                <button
                  type="button"
                  onClick={() => setStateSummary('')}
                  className="text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Effacer
                </button>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {stateSummary}
              </p>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-2">
              <label
                htmlFor="lowram-subtask"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Sous-tâche unique à coder (≤ 150 lignes)
              </label>
              {suggestedSubtasks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestedSubtasks.map((st, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedSubtask(st)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] text-left border transition-colors ${
                        selectedSubtask === st
                          ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {idx + 1}. {st.slice(0, 48)}
                      {st.length > 48 ? '…' : ''}
                    </button>
                  ))}
                </div>
              )}
              <input
                id="lowram-subtask"
                type="text"
                value={selectedSubtask}
                onChange={(e) => setSelectedSubtask(e.target.value)}
                placeholder="Ex : Créer la fonction de validation du formulaire..."
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {(currentStep === 3 || currentStep === 4) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="lowram-code"
                  className="font-medium text-slate-700 dark:text-slate-300"
                >
                  {currentStep === 3
                    ? 'Bloc de code à vérifier (syntaxe & RAM)'
                    : `Segments validés prêts pour fusion (${validatedSegments.length})`}
                </label>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {countCodeLines(activeCodeBlock)} lignes
                </span>
              </div>
              <textarea
                id="lowram-code"
                rows={5}
                value={activeCodeBlock}
                onChange={(e) => setActiveCodeBlock(e.target.value)}
                placeholder="Collez ou générez d'abord un bloc à l'étape 2..."
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleRunCurrentStep()}
            disabled={isRunning}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50 text-white dark:text-slate-950 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>Exécution ÉTAPE {currentStep}...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 shrink-0" />
                <span>Exécuter {activeMeta.title}</span>
              </>
            )}
          </button>
        </section>

        {/* Sortie & validation de segment */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Résultat · {activeMeta.role}
              </h2>
              {stepOutput && (
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {lastLineCount} ligne{lastLineCount > 1 ? 's' : ''} de code
                  {lastLineCount > 150 ? ' (dépassement > 150 lignes)' : ' · conforme ≤ 150'}
                  {lastLatencyMs !== null ? ` · ${(lastLatencyMs / 1000).toFixed(1)} s` : ''}
                </p>
              )}
            </div>

            {stepOutput && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(stepOutput);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    } catch {
                      // Ignorer
                    }
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copié' : 'Copier'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sauvegarderDansMemoire(
                      `Low-RAM ${activeMeta.role} · ${goalInput.slice(0, 60) || 'Segment'}`,
                      stepOutput,
                      'studio-pro'
                    );
                    setMemorized(true);
                    window.setTimeout(() => setMemorized(false), 2200);
                  }}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {memorized ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Brain className="w-3.5 h-3.5 text-emerald-600" />}
                  <span>{memorized ? 'Mémorisé' : 'Mémoriser'}</span>
                </button>
              </div>
            )}
          </div>

          {stepOutput ? (
            <div className="space-y-4">
              <pre className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-100 max-h-[420px] overflow-y-auto">
                {stepOutput}
              </pre>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Validez ce segment pour purger le contexte précédent et avancer.
                </span>
                <button
                  type="button"
                  onClick={handleValidateAndReleaseRam}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0"
                >
                  <ScanText className="w-4 h-4 shrink-0" />
                  <span>
                    {currentStep < 4
                      ? `Valider & Libérer RAM → Étape ${currentStep + 1}`
                      : 'Valider segment final & Libérer RAM'}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          ) : (
            <div className="py-16 px-4 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <Layers className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                En attente de l&apos;exécution ({activeMeta.title})
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Lancez l&apos;étape en cours : le serveur n&apos;envoie que le strict nécessaire (sans historique lourd) et limite chaque bloc de code à 150 lignes.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
