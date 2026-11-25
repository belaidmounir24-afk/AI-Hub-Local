export interface OptimizationCustomFields {
  bug_tracking: {
    enabled: boolean;
    severity_levels: string[];
  };
  code_inventory: {
    enabled: boolean;
    track_dependencies: boolean;
    scan_paths: string[];
  };
  [key: string]: unknown;
}

export interface VisionOptimizationConfig {
  system_config: {
    version: string;
    profile_name: string;
    mode: 'Agentic_Native' | 'Standard';
    target_accuracy: number;
    active_frameworks: string[];
    ecosystem: {
      runtime_targets: string[];
      protocols: string[];
      mcp_automation: boolean;
    };
    performance_optimizations: {
      long_term_memory: 'enabled' | 'disabled';
      eval_loop: 'active' | 'inactive';
      vector_db_access: 'Pinecone_Ready' | 'Local_Only';
    };
    custom_fields: OptimizationCustomFields;
    instruction_priority: string;
  };
}

export const STORAGE_KEY_OPTIMIZATION = 'visionia_optimization_v1';

export const DEFAULT_OPTIMIZATION_CONFIG: VisionOptimizationConfig = {
  system_config: {
    version: '1.1.0',
    profile_name: 'AI_Native_Engineer_Assistant',
    mode: 'Agentic_Native',
    target_accuracy: 0.98,
    active_frameworks: ['LangGraph', 'MCP-Client', 'RAG-Local'],
    ecosystem: {
      runtime_targets: ['AI Hub Local', 'Ollama', 'Termux'],
      protocols: ['MCP', 'RAG'],
      mcp_automation: true,
    },
    performance_optimizations: {
      long_term_memory: 'enabled',
      eval_loop: 'active',
      vector_db_access: 'Pinecone_Ready',
    },
    custom_fields: {
      bug_tracking: {
        enabled: true,
        severity_levels: ['critique', 'majeur', 'mineur'],
      },
      code_inventory: {
        enabled: true,
        track_dependencies: true,
        scan_paths: ['src/', 'server.ts'],
      },
    },
    instruction_priority:
      "Calibrer AI Hub Local sur le profil AI_Native_Engineer_Assistant (précision cible 98 %) : prioriser l'extraction JSON rigoureuse, le RAG local, l'automatisation MCP, le suivi de bugs et l'inventaire de code.",
  },
};

export function normalizeOptimizationConfig(raw: unknown): VisionOptimizationConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<VisionOptimizationConfig>;
  const sc = (obj.system_config && typeof obj.system_config === 'object'
    ? obj.system_config
    : obj) as Partial<VisionOptimizationConfig['system_config']>;
  const po = (sc.performance_optimizations && typeof sc.performance_optimizations === 'object'
    ? sc.performance_optimizations
    : {}) as Partial<VisionOptimizationConfig['system_config']['performance_optimizations']>;
  const eco = (sc.ecosystem && typeof sc.ecosystem === 'object'
    ? sc.ecosystem
    : {}) as Partial<VisionOptimizationConfig['system_config']['ecosystem']>;
  const rawCustom = (sc.custom_fields && typeof sc.custom_fields === 'object'
    ? sc.custom_fields
    : {}) as Record<string, unknown>;
  const rawBug = (rawCustom.bug_tracking && typeof rawCustom.bug_tracking === 'object'
    ? rawCustom.bug_tracking
    : {}) as Partial<OptimizationCustomFields['bug_tracking']>;
  const rawInv = (rawCustom.code_inventory && typeof rawCustom.code_inventory === 'object'
    ? rawCustom.code_inventory
    : {}) as Partial<OptimizationCustomFields['code_inventory']>;

  const rawAcc = typeof sc.target_accuracy === 'number' ? sc.target_accuracy : 0.98;
  const clampedAcc = Number(Math.min(1, Math.max(0.5, rawAcc)).toFixed(2));

  const extraCustomEntries = Object.fromEntries(
    Object.entries(rawCustom).filter(([k]) => k !== 'bug_tracking' && k !== 'code_inventory')
  );

  return {
    system_config: {
      version: typeof sc.version === 'string' && sc.version.trim() ? sc.version.trim() : '1.1.0',
      profile_name:
        typeof sc.profile_name === 'string' && sc.profile_name.trim()
          ? sc.profile_name.trim()
          : DEFAULT_OPTIMIZATION_CONFIG.system_config.profile_name,
      mode: sc.mode === 'Standard' ? 'Standard' : 'Agentic_Native',
      target_accuracy: clampedAcc,
      active_frameworks: Array.isArray(sc.active_frameworks)
        ? sc.active_frameworks.filter((f): f is string => typeof f === 'string' && Boolean(f.trim()))
        : [...DEFAULT_OPTIMIZATION_CONFIG.system_config.active_frameworks],
      ecosystem: {
        runtime_targets: Array.isArray(eco.runtime_targets)
          ? eco.runtime_targets.filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
          : [...DEFAULT_OPTIMIZATION_CONFIG.system_config.ecosystem.runtime_targets],
        protocols: Array.isArray(eco.protocols)
          ? eco.protocols.filter((p): p is string => typeof p === 'string' && Boolean(p.trim()))
          : [...DEFAULT_OPTIMIZATION_CONFIG.system_config.ecosystem.protocols],
        mcp_automation:
          typeof eco.mcp_automation === 'boolean' ? eco.mcp_automation : true,
      },
      performance_optimizations: {
        long_term_memory: po.long_term_memory === 'disabled' ? 'disabled' : 'enabled',
        eval_loop: po.eval_loop === 'inactive' ? 'inactive' : 'active',
        vector_db_access: po.vector_db_access === 'Local_Only' ? 'Local_Only' : 'Pinecone_Ready',
      },
      custom_fields: {
        ...extraCustomEntries,
        bug_tracking: {
          enabled: typeof rawBug.enabled === 'boolean' ? rawBug.enabled : true,
          severity_levels: Array.isArray(rawBug.severity_levels)
            ? rawBug.severity_levels.filter((s): s is string => typeof s === 'string' && Boolean(s.trim()))
            : [...DEFAULT_OPTIMIZATION_CONFIG.system_config.custom_fields.bug_tracking.severity_levels],
        },
        code_inventory: {
          enabled: typeof rawInv.enabled === 'boolean' ? rawInv.enabled : true,
          track_dependencies:
            typeof rawInv.track_dependencies === 'boolean' ? rawInv.track_dependencies : true,
          scan_paths: Array.isArray(rawInv.scan_paths)
            ? rawInv.scan_paths.filter((p): p is string => typeof p === 'string' && Boolean(p.trim()))
            : [...DEFAULT_OPTIMIZATION_CONFIG.system_config.custom_fields.code_inventory.scan_paths],
        },
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
