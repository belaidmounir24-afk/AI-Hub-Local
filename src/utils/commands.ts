import { SlashCommand } from '../types';

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: '/aide',
    aliases: ['/help', '/?'],
    description: "Affiche le guide d'utilisation et les commandes disponibles.",
    usage: '/aide',
    category: 'aide',
  },
  {
    name: '/ollama',
    aliases: ['/local', '/termux'],
    description: "Ouvre l'application Chat Local connectée à Ollama (Termux).",
    usage: '/ollama',
    category: 'navigation',
  },
  {
    name: '/accueil',
    aliases: ['/hub', '/apps'],
    description: "Retourne au lanceur principal d'AI Hub Local.",
    usage: '/accueil',
    category: 'navigation',
  },
  {
    name: '/studio',
    aliases: ['/dashboard', '/workspace'],
    description: "Ouvre l'espace de travail SaaS Pro à 3 colonnes (Capture, Analyse, Export).",
    usage: '/studio',
    category: 'navigation',
  },
  {
    name: '/capture',
    aliases: ['/camera', '/photo'],
    description: "Ouvre Capture IA pour activer la caméra ou importer une photo et analyser en direct.",
    usage: '/capture',
    category: 'navigation',
  },
  {
    name: '/effacer',
    aliases: ['/clear', '/reset'],
    description: 'Efface tout le fil de discussion et réinitialise la mémoire.',
    usage: '/effacer',
    category: 'action',
  },
  {
    name: '/exporter',
    aliases: ['/export', '/sauvegarder'],
    description: 'Télécharge ou copie la transcription de la discussion en Markdown.',
    usage: '/exporter',
    category: 'action',
  },
  {
    name: '/pdf',
    aliases: ['/rapport-pdf'],
    description: "Génère et télécharge le rapport d'analyse au format PDF.",
    usage: '/pdf',
    category: 'action',
  },
  {
    name: '/excel',
    aliases: ['/xlsx', '/rapport-excel'],
    description: 'Génère et télécharge les résultats et métriques au format Excel (.xlsx).',
    usage: '/excel',
    category: 'action',
  },
  {
    name: '/memoire',
    aliases: ['/memory', '/souvenir'],
    description: 'Ouvre la mémoire persistante Vision IA (visionia_memoire) ou recherche un terme (/memoire terme).',
    usage: '/memoire [mot-clé]',
    category: 'action',
  },
  {
    name: '/exemple',
    aliases: ['/demo', '/sample'],
    description: "Charge l'infographie modèle (MCP vs RAG vs Agents IA) pour tester.",
    usage: '/exemple',
    category: 'action',
  },
  {
    name: '/statut',
    aliases: ['/ping', '/diagnostic'],
    description: "Vérifie l'état du serveur backend et de la connexion IA.",
    usage: '/statut',
    category: 'aide',
  },
  {
    name: '/reglages',
    aliases: ['/voix', '/audio', '/settings'],
    description: "Ouvre les réglages d'Ollama, du moteur IA et de synthèse vocale.",
    usage: '/reglages',
    category: 'action',
  },
  {
    name: '/claude',
    aliases: ['/anthropic', '/sonnet'],
    description: "Bascule l'analyse multimodale sur Anthropic Claude 3.5 Sonnet (@anthropic-ai/sdk).",
    usage: '/claude',
    category: 'action',
  },
  {
    name: '/gemini',
    aliases: ['/google'],
    description: "Bascule l'analyse multimodale sur Gemini Multimodal (par défaut).",
    usage: '/gemini',
    category: 'action',
  },
  {
    name: '/deepseek',
    aliases: ['/ds', '/deepseek-chat'],
    description: 'Bascule le moteur texte sur DeepSeek (deepseek-chat via deepseek_config.json).',
    usage: '/deepseek',
    category: 'action',
  },
  {
    name: '/lowram',
    aliases: ['/pipeline', '/orchestrateur', '/etapes'],
    description: "Ouvre l'Orchestrateur Séquentiel Low-RAM (PLANNER → WRITER → REVIEWER → MERGER + OCR).",
    usage: '/lowram',
    category: 'navigation',
  },
  {
    name: '/mcp',
    aliases: ['/graphql', '/blueprint', '/passerelle'],
    description: 'Ouvre le Serveur MCP local, la passerelle REST/GraphQL et le visualiseur de fichiers.',
    usage: '/mcp',
    category: 'navigation',
  },
  {
    name: '/builder',
    aliases: ['/pitch', '/templates', '/deck'],
    description: 'Ouvre le Studio SaaS AI App Builder (Pitch Deck technique & Moteur de Templates).',
    usage: '/builder',
    category: 'navigation',
  },
];

export function getCommandSuggestions(query: string): SlashCommand[] {
  if (!query.startsWith('/')) return [];
  const clean = query.toLowerCase().trim();
  const search = clean.slice(1);

  if (search === '') {
    return SLASH_COMMANDS;
  }

  return SLASH_COMMANDS.filter((cmd) => {
    if (cmd.name.toLowerCase().includes(clean)) return true;
    if (cmd.aliases?.some((a) => a.toLowerCase().includes(clean))) return true;
    if (cmd.description.toLowerCase().includes(search)) return true;
    return false;
  });
}

export function parseCommand(text: string): {
  isCommand: boolean;
  commandName: string;
  args: string[];
} {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return { isCommand: false, commandName: '', args: [] };
  }

  const parts = trimmed.split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  return {
    isCommand: true,
    commandName,
    args,
  };
}
