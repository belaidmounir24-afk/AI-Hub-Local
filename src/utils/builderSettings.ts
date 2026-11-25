import { AiProvider } from '../types';

export type TargetFrameworkId = 'react-tailwind' | 'nextjs' | 'express-node' | 'android';
export type TemplateEngineId = 'handlebars' | 'jinja2';
export type DatabaseBackendId = 'postgresql' | 'local';
export type PlanTierId = 'pro-saas' | 'starter';

export interface AdvancedBuilderSettings {
  provider: AiProvider;
  modelName: string;
  framework: TargetFrameworkId;
  templateEngine: TemplateEngineId;
  databaseBackend: DatabaseBackendId;
  planTier: PlanTierId;
  temperature: number;
  maxTokens: number;
  enableMcpAgents: boolean;
}

export const STORAGE_KEY_ADVANCED_BUILDER = 'aihub_advanced_builder_settings_v1';

export const MODEL_OPTIONS_BY_PROVIDER: Record<AiProvider, string[]> = {
  gemini: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
};

export const FRAMEWORK_LABELS: Record<TargetFrameworkId, string> = {
  'react-tailwind': 'React + Tailwind CSS',
  nextjs: 'Next.js (App Router)',
  'express-node': 'Node.js + Express MCP',
  android: 'Android WebView / Kotlin',
};

export const DEFAULT_ADVANCED_BUILDER_SETTINGS: AdvancedBuilderSettings = {
  provider: 'gemini',
  modelName: 'gemini-4-hydrogen',
  framework: 'react-tailwind',
  templateEngine: 'handlebars',
  databaseBackend: 'postgresql',
  planTier: 'pro-saas',
  temperature: 0.4,
  maxTokens: 4096,
  enableMcpAgents: true,
};

export function loadAdvancedBuilderSettings(): AdvancedBuilderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ADVANCED_BUILDER);
    if (!raw) return DEFAULT_ADVANCED_BUILDER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AdvancedBuilderSettings>;
    const provider: AiProvider =
      parsed.provider === 'claude' || parsed.provider === 'deepseek' ? parsed.provider : 'gemini';
    const rawModelName =
      typeof parsed.modelName === 'string' && parsed.modelName.trim() ? parsed.modelName.trim() : '';
    const sanitizedModelName =
      rawModelName && rawModelName !== 'gemini-flash-lite-latest'
        ? rawModelName
        : MODEL_OPTIONS_BY_PROVIDER[provider][0];
    return {
      provider,
      modelName: sanitizedModelName,
      framework:
        parsed.framework === 'nextjs' ||
        parsed.framework === 'express-node' ||
        parsed.framework === 'android'
          ? parsed.framework
          : 'react-tailwind',
      templateEngine: parsed.templateEngine === 'jinja2' ? 'jinja2' : 'handlebars',
      databaseBackend: parsed.databaseBackend === 'local' ? 'local' : 'postgresql',
      planTier: parsed.planTier === 'starter' ? 'starter' : 'pro-saas',
      temperature:
        typeof parsed.temperature === 'number'
          ? Math.min(1, Math.max(0, parsed.temperature))
          : 0.4,
      maxTokens:
        typeof parsed.maxTokens === 'number' && parsed.maxTokens >= 512 ? parsed.maxTokens : 4096,
      enableMcpAgents: typeof parsed.enableMcpAgents === 'boolean' ? parsed.enableMcpAgents : true,
    };
  } catch {
    return DEFAULT_ADVANCED_BUILDER_SETTINGS;
  }
}

export function saveAdvancedBuilderSettings(next: AdvancedBuilderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_ADVANCED_BUILDER, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('aihub-builder-settings-updated', { detail: next }));
  } catch {
    // Ignorer
  }
}

function resolvePath(ctx: Record<string, unknown>, pathExpr: string): unknown {
  const parts = pathExpr.trim().split('.');
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Moteur léger compatible Handlebars ({{#each}}, {{#if}}, {{var}})
 * et Jinja2 ({% for item in list %}...{% endfor %}, {% if cond %}...{% endif %}, {{ var }}).
 */
export function compileSourceTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  let out = template.replace(/\{#[\s\S]*?#\}/g, '').replace(/\{\{!--[\s\S]*?--\}\}/g, '');

  // 1. Boucles Jinja2 : {% for x in list %}...{% endfor %}
  out = out.replace(
    /\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
    (_, itemVar: string, listPath: string, body: string) => {
      const list = resolvePath(context, listPath);
      if (!Array.isArray(list)) return '';
      return list
        .map((entry, idx) =>
          compileSourceTemplate(body, {
            ...context,
            [itemVar]: entry,
            loop_index: idx + 1,
          })
        )
        .join('');
    }
  );

  // 2. Boucles Handlebars : {{#each list}}...{{/each}}
  out = out.replace(
    /\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, listPath: string, body: string) => {
      const list = resolvePath(context, listPath);
      if (!Array.isArray(list)) return '';
      return list
        .map((entry, idx) => {
          const itemContext: Record<string, unknown> =
            entry && typeof entry === 'object'
              ? { ...context, ...(entry as Record<string, unknown>), this: entry, '@index': idx }
              : { ...context, this: entry, '@index': idx };
          return compileSourceTemplate(body, itemContext);
        })
        .join('');
    }
  );

  // 3. Conditions Jinja2 : {% if cond %}...{% else %}...{% endif %}
  out = out.replace(
    /\{%\s*if\s+([\w.]+)\s*%\}([\s\S]*?)(?:\{%\s*else\s*%\}([\s\S]*?))?\{%\s*endif\s*%\}/g,
    (_, condPath: string, truthyBody: string, falsyBody = '') => {
      const val = resolvePath(context, condPath);
      const ok = Array.isArray(val) ? val.length > 0 : Boolean(val);
      return compileSourceTemplate(ok ? truthyBody : falsyBody, context);
    }
  );

  // 4. Conditions Handlebars : {{#if cond}}...{{else}}...{{/if}}
  out = out.replace(
    /\{\{#if\s+([\w.]+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, condPath: string, truthyBody: string, falsyBody = '') => {
      const val = resolvePath(context, condPath);
      const ok = Array.isArray(val) ? val.length > 0 : Boolean(val);
      return compileSourceTemplate(ok ? truthyBody : falsyBody, context);
    }
  );

  // 5. Interpolation de variables {{ var }} / {{this}}
  out = out.replace(/\{\{\s*([\w.@]+)\s*\}\}/g, (_, expr: string) => {
    if (expr === 'this') {
      return context.this !== undefined ? String(context.this) : '';
    }
    const val = resolvePath(context, expr);
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });

  return out;
}
