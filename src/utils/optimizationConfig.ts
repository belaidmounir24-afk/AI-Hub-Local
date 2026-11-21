export interface VisionOptimizationConfig {
  system_config: {
    version: string;
    mode: 'Agentic_Native' | 'Standard';
    active_frameworks: string[];
    performance_optimizations: {
      long_term_memory: 'enabled' | 'disabled';
      eval_loop: 'active' | 'inactive';
      vector_db_access: 'Pinecone_Ready' | 'Local_Only';
    };
    instruction_priority: string;
  };
}

export const STORAGE_KEY_OPTIMIZATION = 'visionia_optimization_v1';

export const DEFAULT_OPTIMIZATION_CONFIG: VisionOptimizationConfig = {
  system_config: {
    version: '1.0.0',
    mode: 'Agentic_Native',
    active_frameworks: ['LangGraph', 'MCP-Client'],
    performance_optimizations: {
      long_term_memory: 'enabled',
      eval_loop: 'active',
      vector_db_access: 'Pinecone_Ready',
    },
    instruction_priority:
      "Prioriser l'extraction structurée et l'exécution de tâches autonomes via le protocole MCP.",
  },
};

export function normalizeOptimizationConfig(raw: unknown): VisionOptimizationConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<VisionOptimizationConfig>;
  const sc = (obj.system_config && typeof obj.system_config === 'object'
    ? obj.system_config
    : {}) as Partial<VisionOptimizationConfig['system_config']>;
  const po = (sc.performance_optimizations && typeof sc.performance_optimizations === 'object'
    ? sc.performance_optimizations
    : {}) as Partial<VisionOptimizationConfig['system_config']['performance_optimizations']>;

  return {
    system_config: {
      version: typeof sc.version === 'string' && sc.version.trim() ? sc.version.trim() : '1.0.0',
      mode: sc.mode === 'Standard' ? 'Standard' : 'Agentic_Native',
      active_frameworks: Array.isArray(sc.active_frameworks)
        ? sc.active_frameworks.filter((f): f is string => typeof f === 'string' && Boolean(f.trim()))
        : [...DEFAULT_OPTIMIZATION_CONFIG.system_config.active_frameworks],
      performance_optimizations: {
        long_term_memory: po.long_term_memory === 'disabled' ? 'disabled' : 'enabled',
        eval_loop: po.eval_loop === 'inactive' ? 'inactive' : 'active',
        vector_db_access: po.vector_db_access === 'Local_Only' ? 'Local_Only' : 'Pinecone_Ready',
      },
      instruction_priority:
        typeof sc.instruction_priority === 'string' && sc.instruction_priority.trim()
          ? sc.instruction_priority.trim()
          : DEFAULT_OPTIMIZATION_CONFIG.system_config.instruction_priority,
    },
  };
}

export function loadOptimizationConfigLocal(): VisionOptimizationConfig {
  if (typeof window === 'undefined') return DEFAULT_OPTIMIZATION_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_OPTIMIZATION);
    if (!raw) return DEFAULT_OPTIMIZATION_CONFIG;
    return normalizeOptimizationConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_OPTIMIZATION_CONFIG;
  }
}

export function saveOptimizationConfigLocal(config: VisionOptimizationConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_OPTIMIZATION, JSON.stringify(config));
  } catch {
    // Ignorer si quota localStorage atteint
  }
}

export async function fetchServerOptimizationConfig(): Promise<VisionOptimizationConfig | null> {
  try {
    const res = await fetch('/api/optimization');
    if (!res.ok) return null;
    const data = await res.json();
    const normalized = normalizeOptimizationConfig(data);
    saveOptimizationConfigLocal(normalized);
    return normalized;
  } catch {
    return null;
  }
}

export async function updateServerOptimizationConfig(
  config: VisionOptimizationConfig
): Promise<VisionOptimizationConfig> {
  saveOptimizationConfigLocal(config);
  const res = await fetch('/api/optimization', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error("Impossible d'enregistrer visionia_optimization.json sur le serveur.");
  }
  const saved = normalizeOptimizationConfig(await res.json());
  saveOptimizationConfigLocal(saved);
  return saved;
}
