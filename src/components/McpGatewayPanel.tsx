import React, { useEffect, useState } from 'react';
import {
  Server,
  Play,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Braces,
  Database,
  Upload,
} from 'lucide-react';
import { chercherDansMemoire } from '../utils/visionMemory';

export interface McpActionItem {
  tache: string;
  priorite: 'haute' | 'moyenne' | 'basse';
}

export interface McpBlueprint {
  titre: string;
  resume: string;
  entites: string[];
  points_cles: string[];
  actions_mcp_recommandees: McpActionItem[];
  updatedAt?: string;
}

interface McpToolDef {
  name: string;
  description: string;
  category: string;
}

const STORAGE_KEY_COMPLETED_ACTIONS = 'aihub_mcp_completed_actions_v1';

const PRESET_GRAPHQL_QUERIES: Array<{ label: string; query: string }> = [
  {
    label: 'Blueprint complet',
    query: `{
  blueprint {
    titre
    resume
    entites
    points_cles
    actions {
      tache
      priorite
    }
  }
}`,
  },
  {
    label: 'Priorité haute',
    query: `{
  blueprint(priorite: "haute") {
    titre
    actions {
      tache
      priorite
    }
  }
}`,
  },
  {
    label: 'MCP & Config',
    query: `{
  mcpTools {
    name
    category
    description
  }
  systemConfig {
    mode
    version
    frameworks
    vectorDb
  }
}`,
  },
];

export const McpGatewayPanel: React.FC = () => {
  const [blueprint, setBlueprint] = useState<McpBlueprint | null>(null);
  const [loadingBlueprint, setLoadingBlueprint] = useState<boolean>(true);
  const [priorityFilter, setPriorityFilter] = useState<'toutes' | 'haute' | 'moyenne'>('toutes');
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_COMPLETED_ACTIONS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Importation JSON personnalisée
  const [showImportEditor, setShowImportEditor] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [savingBlueprint, setSavingBlueprint] = useState<boolean>(false);

  // Serveur MCP local
  const [mcpTools, setMcpTools] = useState<McpToolDef[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('mcp_query_blueprint');
  const [toolArgsJson, setToolArgsJson] = useState<string>('{\n  "priorite": "haute"\n}');
  const [toolRunning, setToolRunning] = useState<boolean>(false);
  const [toolOutput, setToolOutput] = useState<string>('');

  // Passerelle GraphQL / REST
  const [graphqlQuery, setGraphqlQuery] = useState<string>(PRESET_GRAPHQL_QUERIES[0].query);
  const [graphqlRunning, setGraphqlRunning] = useState<boolean>(false);
  const [graphqlOutput, setGraphqlOutput] = useState<string>('');
  const [copiedGraphql, setCopiedGraphql] = useState<boolean>(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadGatewayData = async () => {
    setLoadingBlueprint(true);
    setErrorMsg(null);
    try {
      const [bpRes, toolsRes] = await Promise.all([
        fetch('/api/v1/blueprint'),
        fetch('/api/mcp/tools'),
      ]);
      if (bpRes.ok) {
        const bpData = (await bpRes.json()) as McpBlueprint;
        setBlueprint(bpData);
      }
      if (toolsRes.ok) {
        const toolsData = (await toolsRes.json()) as { tools?: McpToolDef[] };
        if (Array.isArray(toolsData.tools)) {
          setMcpTools(toolsData.tools);
        }
      }
    } catch {
      setErrorMsg('Impossible de joindre le serveur MCP local.');
    } finally {
      setLoadingBlueprint(false);
    }
  };

  useEffect(() => {
    loadGatewayData();
  }, []);

  const toggleTaskCompleted = (tache: string) => {
    setCompletedTasks((prev) => {
      const next = { ...prev, [tache]: !prev[tache] };
      try {
        localStorage.setItem(STORAGE_KEY_COMPLETED_ACTIONS, JSON.stringify(next));
      } catch {
        // Ignorer
      }
      return next;
    });
  };

  const handleSelectTool = (toolName: string) => {
    setSelectedTool(toolName);
    if (toolName === 'mcp_query_blueprint') {
      setToolArgsJson('{\n  "priorite": "toutes",\n  "search": ""\n}');
    } else if (toolName === 'mcp_inspect_configs') {
      setToolArgsJson('{\n  "includeSpecPreview": false\n}');
    } else if (toolName === 'mcp_query_memory_records') {
      setToolArgsJson('{\n  "query": ""\n}');
    } else {
      setToolArgsJson('{\n  "format": "csv"\n}');
    }
  };

  const handleRunMcpTool = async () => {
    setToolRunning(true);
    setErrorMsg(null);
    try {
      let parsedArgs: Record<string, unknown> = {};
      if (toolArgsJson.trim()) {
        parsedArgs = JSON.parse(toolArgsJson) as Record<string, unknown>;
      }
      if (selectedTool === 'mcp_query_memory_records' && !Array.isArray(parsedArgs.records)) {
        parsedArgs.records = chercherDansMemoire('');
      }

      const res = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: selectedTool,
            arguments: parsedArgs,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Échec de l’exécution MCP.');
      }
      const structured = data?.result?.structuredContent ?? data;
      setToolOutput(JSON.stringify(structured, null, 2));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur d’arguments JSON ou appel MCP.');
    } finally {
      setToolRunning(false);
    }
  };

  const handleRunGraphql = async () => {
    if (!graphqlQuery.trim()) return;
    setGraphqlRunning(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: graphqlQuery }),
      });
      const data = await res.json();
      setGraphqlOutput(JSON.stringify(data, null, 2));
      if (!res.ok) {
        setErrorMsg(data?.errors?.[0]?.message || 'Erreur GraphQL.');
      }
    } catch {
      setErrorMsg('Impossible de joindre /api/graphql.');
    } finally {
      setGraphqlRunning(false);
    }
  };

  const handleSaveImportedBlueprint = async () => {
    setSavingBlueprint(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const parsed = JSON.parse(importJsonText);
      const res = await fetch('/api/v1/blueprint', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const saved = await res.json();
      if (!res.ok) {
        throw new Error(saved.error || 'Format JSON invalide.');
      }
      setBlueprint(saved);
      setShowImportEditor(false);
      setImportJsonText('');
      setStatusMsg('Blueprint MCP mis à jour et persisté sur le serveur.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'JSON invalide.');
    } finally {
      setSavingBlueprint(false);
    }
  };

  const filteredActions =
    blueprint?.actions_mcp_recommandees.filter((a) =>
      priorityFilter === 'toutes' ? true : a.priorite === priorityFilter
    ) || [];

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-semibold hover:underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {statusMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="font-semibold hover:underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* 1. Cartographie Architecturale & Actions MCP Recommandées */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Blueprint MCP Actif</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {blueprint ? `${blueprint.entites.length} entités` : 'Chargement...'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {blueprint ? `${blueprint.actions_mcp_recommandees.length} actions` : '...'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {blueprint?.titre || 'Chargement du blueprint...'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {blueprint?.resume}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowImportEditor((v) => !v)}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importer JSON</span>
            </button>
            <a
              href="/api/v1/data/export?format=json&download=1"
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>REST JSON</span>
            </a>
            <a
              href="/api/v1/data/export?format=csv"
              className="min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>REST CSV</span>
            </a>
          </div>
        </div>

        {showImportEditor && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <label
              htmlFor="mcp-import-json"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Collez un JSON structuré (issu de « Extraire JSON ») pour mettre à jour le serveur MCP :
            </label>
            <textarea
              id="mcp-import-json"
              rows={5}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='{ "titre": "...", "resume": "...", "entites": [...], "points_cles": [...], "actions_mcp_recommandees": [...] }'
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportEditor(false)}
                className="min-h-[40px] px-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveImportedBlueprint}
                disabled={!importJsonText.trim() || savingBlueprint}
                className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-500 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-50"
              >
                {savingBlueprint ? 'Enregistrement...' : 'Enregistrer sur /api/v1/blueprint'}
              </button>
            </div>
          </div>
        )}

        {loadingBlueprint ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Chargement du blueprint MCP...</span>
          </div>
        ) : blueprint ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Colonne gauche : Entités & Points clés */}
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Stack &amp; Entités identifiées
                </h3>
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-mono">
                  {blueprint.entites.join(' · ')}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Points clés d&apos;architecture
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {blueprint.points_cles.map((pt, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono text-slate-400 tabular-nums shrink-0">
                        0{idx + 1}.
                      </span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Colonne droite : Table des actions MCP */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Plan d&apos;actions MCP recommandées
                </h3>
                <div
                  role="group"
                  aria-label="Filtrer par priorité"
                  className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800"
                >
                  {(['toutes', 'haute', 'moyenne'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriorityFilter(p)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition-colors ${
                        priorityFilter === p
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {filteredActions.map((action, idx) => {
                  const done = Boolean(completedTasks[action.tache]);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 px-3.5 py-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => toggleTaskCompleted(action.tache)}
                        className="flex items-start gap-2.5 text-left min-w-0 flex-1"
                      >
                        <CheckCircle2
                          className={`w-4 h-4 mt-0.5 shrink-0 transition-colors ${
                            done
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                        <span
                          className={`text-xs sm:text-sm leading-snug ${
                            done
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-800 dark:text-slate-100 font-medium'
                          }`}
                        >
                          {action.tache}
                        </span>
                      </button>
                      <span
                        className={`text-[11px] font-mono font-semibold shrink-0 ${
                          action.priorite === 'haute'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        Priorité {action.priorite}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2. Console Serveur MCP Local & Passerelle GraphQL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Serveur MCP Local (JSON-RPC 2.0 /api/mcp/call) */}
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Serveur MCP Local (JSON-RPC 2.0)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exécute les outils MCP sur le stockage local (<span className="font-mono">/api/mcp/call</span>).
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="mcp-tool-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Outil MCP enregistré ({mcpTools.length})
            </label>
            <select
              id="mcp-tool-select"
              value={selectedTool}
              onChange={(e) => handleSelectTool(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {mcpTools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} — {t.description}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="mcp-tool-args"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Arguments JSON (params.arguments)
            </label>
            <textarea
              id="mcp-tool-args"
              rows={3}
              value={toolArgsJson}
              onChange={(e) => setToolArgsJson(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            type="button"
            onClick={() => void handleRunMcpTool()}
            disabled={toolRunning}
            className="w-full min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50 text-white dark:text-slate-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {toolRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            <span>Exécuter outil MCP</span>
          </button>

          {toolOutput && (
            <pre className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200 max-h-60 overflow-y-auto">
              {toolOutput}
            </pre>
          )}
        </section>

        {/* Passerelle GraphQL (/api/graphql) */}
        <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0">
                <Braces className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Passerelle GraphQL (/api/graphql)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Interroge et extrait sélectivement blueprint, outils MCP et configuration.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_GRAPHQL_QUERIES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setGraphqlQuery(preset.query)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-500 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            aria-label="Requête GraphQL"
            rows={5}
            value={graphqlQuery}
            onChange={(e) => setGraphqlQuery(e.target.value)}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRunGraphql()}
              disabled={graphqlRunning || !graphqlQuery.trim()}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white disabled:opacity-50 text-white dark:text-slate-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {graphqlRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Exécuter GraphQL</span>
            </button>
            {graphqlOutput && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(graphqlOutput);
                    setCopiedGraphql(true);
                    window.setTimeout(() => setCopiedGraphql(false), 2000);
                  } catch {
                    // Ignorer
                  }
                }}
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                {copiedGraphql ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedGraphql ? 'Copié' : 'Copier'}</span>
              </button>
            )}
          </div>

          {graphqlOutput && (
            <pre className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200 max-h-60 overflow-y-auto">
              {graphqlOutput}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
};
