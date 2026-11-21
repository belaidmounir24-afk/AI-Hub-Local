import { OllamaConfig, OllamaMessage } from '../types';

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen:7b',
  stream: true,
  systemPrompt:
    'Tu es un assistant IA local exécuté sur Android via Ollama et Termux. Réponds de manière claire, concise et précise en français.',
};

const STORAGE_KEY_OLLAMA_CONFIG = 'aihub_ollama_config_v1';
const STORAGE_KEY_OLLAMA_MESSAGES = 'aihub_ollama_messages_v1';

export function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_OLLAMA_CONFIG.endpoint;
  if (!/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

export function loadOllamaConfig(): OllamaConfig {
  if (typeof window === 'undefined') return DEFAULT_OLLAMA_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OLLAMA_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        endpoint: normalizeEndpoint(parsed.endpoint || DEFAULT_OLLAMA_CONFIG.endpoint),
        model: (parsed.model || DEFAULT_OLLAMA_CONFIG.model).trim(),
        stream: typeof parsed.stream === 'boolean' ? parsed.stream : DEFAULT_OLLAMA_CONFIG.stream,
        systemPrompt:
          typeof parsed.systemPrompt === 'string'
            ? parsed.systemPrompt
            : DEFAULT_OLLAMA_CONFIG.systemPrompt,
      };
    }
  } catch {
    // Ignorer
  }
  return DEFAULT_OLLAMA_CONFIG;
}

export function saveOllamaConfig(config: OllamaConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY_OLLAMA_CONFIG,
      JSON.stringify({
        ...config,
        endpoint: normalizeEndpoint(config.endpoint),
      })
    );
  } catch {
    // Ignorer
  }
}

export function loadOllamaMessages(): OllamaMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OLLAMA_MESSAGES);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignorer
  }
  return [];
}

export function saveOllamaMessages(messages: OllamaMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_OLLAMA_MESSAGES, JSON.stringify(messages));
  } catch {
    // Ignorer
  }
}

export interface OllamaTagsResult {
  reachable: boolean;
  models: string[];
  error?: string;
}

export async function checkOllamaConnection(
  endpoint: string,
  timeoutMs = 2500
): Promise<OllamaTagsResult> {
  const baseUrl = normalizeEndpoint(endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const rootRes = await fetch(`${baseUrl}/`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (rootRes.ok) {
        return {
          reachable: true,
          models: [],
        };
      }
      return {
        reachable: false,
        models: [],
        error: `HTTP ${response.status} depuis ${baseUrl}`,
      };
    }

    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    const modelNames = (data.models || [])
      .map((m) => m.name || m.model || '')
      .filter(Boolean);

    return {
      reachable: true,
      models: modelNames,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      reachable: false,
      models: [],
      error: isAbort
        ? `Délai dépassé sur ${baseUrl}`
        : `Ollama non joignable sur ${baseUrl}`,
    };
  }
}

export interface GenerateOllamaParams {
  endpoint: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  history?: OllamaMessage[];
  stream: boolean;
  onToken?: (accumulatedText: string) => void;
  signal?: AbortSignal;
}

export interface GenerateOllamaResult {
  response: string;
  model: string;
  durationMs: number;
  evalCount?: number;
}

function buildConversationPrompt(
  currentPrompt: string,
  history: OllamaMessage[] = []
): string {
  const recent = history
    .filter((m) => m.role !== 'system' && !m.isError && m.text.trim())
    .slice(-8);

  if (recent.length === 0) {
    return currentPrompt;
  }

  const formattedHistory = recent
    .map((m) => (m.role === 'user' ? `Utilisateur : ${m.text}` : `Assistant : ${m.text}`))
    .join('\n\n');

  return `${formattedHistory}\n\nUtilisateur : ${currentPrompt}\n\nAssistant :`;
}

export async function generateOllamaResponse(
  params: GenerateOllamaParams
): Promise<GenerateOllamaResult> {
  const baseUrl = normalizeEndpoint(params.endpoint);
  const startedAt = performance.now();
  const fullPrompt = buildConversationPrompt(params.prompt, params.history);

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model || 'qwen:7b',
      prompt: fullPrompt,
      system: params.systemPrompt || undefined,
      stream: params.stream,
    }),
  });

  if (!response.ok) {
    let errDetail = `Erreur HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson?.error) {
        errDetail = errJson.error;
      }
    } catch {
      // Ignorer
    }
    throw new Error(errDetail);
  }

  if (params.stream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulated = '';
    let finalEvalCount: number | undefined;
    let finalModel = params.model;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed) as {
            response?: string;
            done?: boolean;
            model?: string;
            eval_count?: number;
            error?: string;
          };
          if (chunk.error) {
            throw new Error(chunk.error);
          }
          if (chunk.response) {
            accumulated += chunk.response;
            params.onToken?.(accumulated);
          }
          if (chunk.model) finalModel = chunk.model;
          if (typeof chunk.eval_count === 'number') finalEvalCount = chunk.eval_count;
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
            // Ignorer les fragments incomplets mais propager les erreurs explicites d'Ollama
            if (!String(parseErr).includes('JSON')) {
              throw parseErr;
            }
          }
        }
      }
    }

    if (buffer.trim()) {
      try {
        const tail = JSON.parse(buffer.trim()) as {
          response?: string;
          model?: string;
          eval_count?: number;
        };
        if (tail.response) {
          accumulated += tail.response;
          params.onToken?.(accumulated);
        }
        if (tail.model) finalModel = tail.model;
        if (typeof tail.eval_count === 'number') finalEvalCount = tail.eval_count;
      } catch {
        // Ignorer
      }
    }

    return {
      response: accumulated.trim() || 'Aucune réponse renvoyée par Ollama.',
      model: finalModel,
      durationMs: Math.round(performance.now() - startedAt),
      evalCount: finalEvalCount,
    };
  }

  const data = (await response.json()) as {
    response?: string;
    model?: string;
    eval_count?: number;
    error?: string;
  };

  if (data.error) {
    throw new Error(data.error);
  }

  return {
    response: (data.response || '').trim() || 'Aucune réponse renvoyée par Ollama.',
    model: data.model || params.model,
    durationMs: Math.round(performance.now() - startedAt),
    evalCount: data.eval_count,
  };
}
