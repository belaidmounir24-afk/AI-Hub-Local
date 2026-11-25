import React, { useEffect, useMemo, useState } from 'react';
import {
  Presentation,
  Code2,
  Sliders,
  Download,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  FileText,
  AlertCircle,
  Play,
} from 'lucide-react';
import {
  AdvancedBuilderSettings,
  FRAMEWORK_LABELS,
  compileSourceTemplate,
  loadAdvancedBuilderSettings,
} from '../utils/builderSettings';
import { downloadReport } from '../utils/reportExporter';
import { triggerTextDownload } from '../utils/androidExporter';

interface PitchSlide {
  number: string;
  title: string;
  subtitle: string;
  bullets: string[];
}

interface AppBuilderStudioProps {
  onOpenSettings?: () => void;
}

interface StarterTemplate {
  id: string;
  label: string;
  filename: string;
  engine: 'handlebars' | 'jinja2';
  template: string;
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'react-component',
    label: 'React + Tailwind (Handlebars)',
    filename: 'GeneratedModule.tsx',
    engine: 'handlebars',
    template: `import React, { useState } from 'react';

export interface {{appName}}Props {
  endpoint?: string;
}

export const {{appName}}: React.FC<{{appName}}Props> = ({ endpoint = '/api/chat' }) => {
  const [query, setQuery] = useState('');
  const entities = [
{{#each entities}}
    '{{this}}',
{{/each}}
  ];

  return (
    <section className="p-6 rounded-2xl border border-slate-200 bg-white space-y-4">
      <header className="space-y-1">
        <p className="text-xs font-mono text-slate-500">{{framework}} · {{modelName}}</p>
        <h2 className="text-lg font-bold text-slate-900">{{appName}}</h2>
      </header>
{{#if enableMcp}}
      <p className="text-xs text-emerald-700">Agent MCP actif ({{databaseBackend}})</p>
{{/if}}
      <ul className="text-xs text-slate-600 space-y-1">
        {entities.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
};`,
  },
  {
    id: 'nextjs-pg-route',
    label: 'Next.js API + PostgreSQL (Jinja2)',
    filename: 'route.ts',
    engine: 'jinja2',
    template: `{# Route générée pour {{ framework }} avec stockage {{ databaseBackend }} #}
import { NextResponse } from 'next/server';

const ROUTER_CONFIG = {
  app: '{{ appName }}',
  provider: '{{ provider }}',
  model: '{{ modelName }}',
  database: '{{ databaseBackend }}',
  modules: [
{% for item in entities %}
    '{{ item }}',
{% endfor %}
  ],
};

export async function POST(req: Request) {
  const body = await req.json();
{% if enableMcp %}
  // Dispatch MCP + persistance {{ databaseBackend }}
  const mcpEnabled = true;
{% else %}
  const mcpEnabled = false;
{% endif %}
  return NextResponse.json({
    ok: true,
    config: ROUTER_CONFIG,
    mcpEnabled,
    received: body,
  });
}`,
  },
  {
    id: 'express-mcp-tool',
    label: 'Outil Serveur MCP (Handlebars)',
    filename: 'mcpTool.ts',
    engine: 'handlebars',
    template: `export const {{appName}}McpTool = {
  name: 'run_{{appName}}',
  framework: '{{framework}}',
  model: '{{modelName}}',
  storage: '{{databaseBackend}}',
  capabilities: [
{{#each entities}}
    '{{this}}',
{{/each}}
  ],
  async execute(input: Record<string, unknown>) {
    return {
      status: 'ok',
      engine: '{{provider}}',
      payload: input,
    };
  },
};`,
  },
];

export const AppBuilderStudio: React.FC<AppBuilderStudioProps> = ({ onOpenSettings }) => {
  const [builderSettings, setBuilderSettings] = useState<AdvancedBuilderSettings>(() =>
    loadAdvancedBuilderSettings()
  );

  // Pitch Deck Technique
  const [platformName, setPlatformName] = useState<string>('MarineVision AI App Builder');
  const [slides, setSlides] = useState<PitchSlide[]>([]);
  const [deckMarkdown, setDeckMarkdown] = useState<string>('');
  const [generatingDeck, setGeneratingDeck] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [copiedDeck, setCopiedDeck] = useState<boolean>(false);

  // Moteur de Templates
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(STARTER_TEMPLATES[0].id);
  const [templateSource, setTemplateSource] = useState<string>(STARTER_TEMPLATES[0].template);
  const [variablesJson, setVariablesJson] = useState<string>(() =>
    JSON.stringify(
      {
        appName: 'MarineVisionBuilder',
        provider: builderSettings.provider,
        modelName: builderSettings.modelName,
        framework: FRAMEWORK_LABELS[builderSettings.framework],
        databaseBackend: builderSettings.databaseBackend,
        enableMcp: builderSettings.enableMcpAgents,
        entities: ['Gemini', 'Claude', 'DeepSeek', 'PostgreSQL', 'MCP'],
      },
      null,
      2
    )
  );
  const [serverRenderedCode, setServerRenderedCode] = useState<string | null>(null);
  const [renderingServer, setRenderingServer] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const onSettingsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<AdvancedBuilderSettings>).detail;
      if (detail) {
        setBuilderSettings(detail);
      } else {
        setBuilderSettings(loadAdvancedBuilderSettings());
      }
    };
    window.addEventListener('aihub-builder-settings-updated', onSettingsUpdated);
    return () => {
      window.removeEventListener('aihub-builder-settings-updated', onSettingsUpdated);
    };
  }, []);

  const handleGeneratePitchDeck = async (enrichWithAi: boolean) => {
    setGeneratingDeck(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/pitch-deck/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformName: platformName.trim() || 'AI Studio-as-a-Service',
          provider: builderSettings.provider,
          modelName: builderSettings.modelName,
          framework: FRAMEWORK_LABELS[builderSettings.framework],
          templateEngine: builderSettings.templateEngine,
          databaseBackend: builderSettings.databaseBackend,
          planTier: builderSettings.planTier,
          enrichWithAi,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la génération du Pitch Deck.');
      }
      setSlides(Array.isArray(data.slides) ? data.slides : []);
      setDeckMarkdown(data.markdown || '');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur Pitch Deck.');
    } finally {
      setGeneratingDeck(false);
    }
  };

  useEffect(() => {
    void handleGeneratePitchDeck(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderSettings]);

  const handleExportDeckPdf = async () => {
    if (!deckMarkdown.trim()) return;
    setExportingPdf(true);
    setErrorMsg(null);
    try {
      await downloadReport('pdf', [
        {
          id: `deck_${Date.now()}`,
          role: 'model',
          text: deckMarkdown,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur export PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const liveTemplateResult = useMemo(() => {
    try {
      const parsedVars = variablesJson.trim()
        ? (JSON.parse(variablesJson) as Record<string, unknown>)
        : {};
      return {
        code: compileSourceTemplate(templateSource, parsedVars),
        error: null as string | null,
      };
    } catch (err: unknown) {
      return {
        code: '',
        error: err instanceof Error ? err.message : 'JSON de variables invalide.',
      };
    }
  }, [templateSource, variablesJson]);

  const activeTemplateMeta =
    STARTER_TEMPLATES.find((t) => t.id === selectedTemplateId) || STARTER_TEMPLATES[0];

  const handleCompileOnServer = async () => {
    setRenderingServer(true);
    setErrorMsg(null);
    try {
      const parsedVars = variablesJson.trim() ? JSON.parse(variablesJson) : {};
      const res = await fetch('/api/templates/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: templateSource,
          variables: parsedVars,
          engine: builderSettings.templateEngine,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur template.');
      setServerRenderedCode(data.rendered || '');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de compilation serveur.');
    } finally {
      setRenderingServer(false);
    }
  };

  const displayedCode = serverRenderedCode !== null ? serverRenderedCode : liveTemplateResult.code;

  return (
    <div className="space-y-6">
      {/* Bandeau résumé de la configuration Advanced Settings active */}
      <section className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Profil SaaS App Builder actif (Advanced Settings)
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 tabular-nums">
            <span>{builderSettings.modelName}</span>
            <span aria-hidden="true">·</span>
            <span>{FRAMEWORK_LABELS[builderSettings.framework]}</span>
            <span aria-hidden="true">·</span>
            <span>{builderSettings.templateEngine}</span>
            <span aria-hidden="true">·</span>
            <span>{builderSettings.databaseBackend}</span>
            <span aria-hidden="true">·</span>
            <span>{builderSettings.planTier}</span>
          </div>
        </div>

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
          >
            <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Advanced Settings</span>
          </button>
        )}
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. Générateur de Pitch Deck Technique */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Presentation className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Pitch Deck Technique — SaaS AI App Builder
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                6 diapositives structurées alignées sur votre modèle, framework et stratégie SaaS Pro.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label="Nom de la plateforme"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              disabled={generatingDeck}
              onClick={() => void handleGeneratePitchDeck(false)}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generatingDeck ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
            <button
              type="button"
              disabled={generatingDeck}
              onClick={() => void handleGeneratePitchDeck(true)}
              className="min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Enrichir par IA</span>
            </button>
            <button
              type="button"
              onClick={() =>
                triggerTextDownload(
                  'pitch_deck_technique.md',
                  deckMarkdown,
                  'text/markdown;charset=utf-8'
                )
              }
              disabled={!deckMarkdown}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Markdown</span>
            </button>
            <button
              type="button"
              disabled={!deckMarkdown || exportingPdf}
              onClick={() => void handleExportDeckPdf()}
              className="min-h-[40px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{exportingPdf ? 'PDF...' : 'PDF'}</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(deckMarkdown);
                  setCopiedDeck(true);
                  window.setTimeout(() => setCopiedDeck(false), 2000);
                } catch {
                  // Ignorer
                }
              }}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
            >
              {copiedDeck ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedDeck ? 'Copié' : 'Copier'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {slides.map((slide) => (
            <article
              key={slide.number}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                <span>Slide {slide.number}</span>
                <span className="truncate max-w-[180px]">{slide.subtitle}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                {slide.title}
              </h3>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {slide.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 shrink-0">-</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* 2. Moteur de Templates (Handlebars / Jinja2) pour la Génération de Code Source */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Moteur de Templates Code Source (Handlebars &amp; Jinja2)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compilez des squelettes modulaires (<span className="font-mono">{'{{var}}'}</span>,{' '}
                <span className="font-mono">{'{{#each}}'}</span>,{' '}
                <span className="font-mono">{'{% for %}'}</span>) avec vos paramètres JSON.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {STARTER_TEMPLATES.map((tpl) => {
              const active = selectedTemplateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(tpl.id);
                    setTemplateSource(tpl.template);
                    setServerRenderedCode(null);
                  }}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-500'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {tpl.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Éditeur Template + Variables */}
          <div className="lg:col-span-6 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="tpl-source"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Source du Template ({activeTemplateMeta.engine})
              </label>
              <textarea
                id="tpl-source"
                rows={11}
                value={templateSource}
                onChange={(e) => {
                  setTemplateSource(e.target.value);
                  setServerRenderedCode(null);
                }}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="tpl-vars"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Variables d&apos;injection (JSON)
              </label>
              <textarea
                id="tpl-vars"
                rows={6}
                value={variablesJson}
                onChange={(e) => {
                  setVariablesJson(e.target.value);
                  setServerRenderedCode(null);
                }}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Code source généré */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <span>Code source généré ({activeTemplateMeta.filename})</span>
                {displayedCode && (
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {displayedCode.split('\n').length} lignes
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={renderingServer || Boolean(liveTemplateResult.error)}
                  onClick={() => void handleCompileOnServer()}
                  className="min-h-[38px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-50 text-white dark:text-slate-950 text-xs font-semibold flex items-center gap-1.5"
                >
                  {renderingServer ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>Compiler API</span>
                </button>
                <button
                  type="button"
                  disabled={!displayedCode}
                  onClick={() =>
                    triggerTextDownload(
                      activeTemplateMeta.filename,
                      displayedCode,
                      'text/plain;charset=utf-8'
                    )
                  }
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Télécharger</span>
                </button>
                <button
                  type="button"
                  disabled={!displayedCode}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(displayedCode);
                      setCopiedCode(true);
                      window.setTimeout(() => setCopiedCode(false), 2000);
                    } catch {
                      // Ignorer
                    }
                  }}
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copié' : 'Copier'}</span>
                </button>
              </div>
            </div>

            {liveTemplateResult.error ? (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                {liveTemplateResult.error}
              </div>
            ) : (
              <pre className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap max-h-[440px] overflow-auto">
                {displayedCode}
              </pre>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
