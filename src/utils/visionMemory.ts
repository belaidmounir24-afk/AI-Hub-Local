export const STORAGE_KEY_VISION_MEMORY = 'visionia_memoire';
const MAX_MEMORY_ENTRIES = 60;

export interface VisionMemoryEntry {
  id: string;
  date: string;
  titre: string;
  contenu: string;
  source?: 'vision-ia' | 'capture-ia' | 'studio-pro' | 'manuel';
}

function readRawMemory(): VisionMemoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_VISION_MEMORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, idx) => ({
      id: typeof item?.id === 'string' ? item.id : `mem_${idx}_${Date.now()}`,
      date: typeof item?.date === 'string' ? item.date : new Date().toLocaleString('fr-FR'),
      titre: typeof item?.titre === 'string' ? item.titre : 'Analyse sans titre',
      contenu: typeof item?.contenu === 'string' ? item.contenu : '',
      source: item?.source,
    }));
  } catch {
    return [];
  }
}

function writeRawMemory(entries: VisionMemoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_VISION_MEMORY,
      JSON.stringify(entries.slice(-MAX_MEMORY_ENTRIES))
    );
  } catch {
    try {
      window.localStorage.setItem(
        STORAGE_KEY_VISION_MEMORY,
        JSON.stringify(entries.slice(-20))
      );
    } catch {
      // Ignorer si le quota localStorage est saturé
    }
  }
}

function notifyMemoryUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('visionia-memory-updated'));
  }
}

/**
 * Enregistre une analyse faite par Vision IA dans localStorage ('visionia_memoire')
 */
export function sauvegarderDansMemoire(
  titre: string,
  contenu: string,
  source?: VisionMemoryEntry['source']
): VisionMemoryEntry {
  const memoire = readRawMemory();
  const cleanTitle = (titre || 'Analyse Vision IA').trim().slice(0, 140);
  const cleanContent = (contenu || '').trim();

  const entry: VisionMemoryEntry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toLocaleString('fr-FR'),
    titre: cleanTitle || 'Analyse Vision IA',
    contenu: cleanContent,
    source,
  };

  // Éviter les doublons exacts immédiats
  const existingIdx = memoire.findIndex(
    (m) => m.titre === entry.titre && m.contenu === entry.contenu
  );
  if (existingIdx !== -1) {
    memoire[existingIdx] = entry;
  } else {
    memoire.push(entry);
  }

  writeRawMemory(memoire);
  notifyMemoryUpdated();
  return entry;
}

/**
 * Recherche dans la mémoire persistante ('visionia_memoire') par mot-clé
 */
export function chercherDansMemoire(terme: string): VisionMemoryEntry[] {
  const memoire = readRawMemory();
  const cleanTerm = (terme || '').trim().toLowerCase();
  if (!cleanTerm) {
    return [...memoire].reverse();
  }
  return memoire
    .filter(
      (item) =>
        item.contenu.toLowerCase().includes(cleanTerm) ||
        item.titre.toLowerCase().includes(cleanTerm)
    )
    .reverse();
}

export function chargerMemoire(): VisionMemoryEntry[] {
  return [...readRawMemory()].reverse();
}

export function supprimerDeMemoire(id: string): VisionMemoryEntry[] {
  const updated = readRawMemory().filter((item) => item.id !== id);
  writeRawMemory(updated);
  notifyMemoryUpdated();
  return [...updated].reverse();
}

export function viderMemoire(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY_VISION_MEMORY);
  notifyMemoryUpdated();
}

function tokenizeForVector(text: string): string[] {
  const stopWords = new Set([
    'dans', 'avec', 'pour', 'elle', 'vous', 'nous', 'cette', 'quel',
    'quelle', 'quoi', 'comment', 'est', 'sont', 'une', 'des', 'les', 'que',
  ]);
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

function cosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  for (const t of tokensA) freqA.set(t, (freqA.get(t) || 0) + 1);
  for (const t of tokensB) freqB.set(t, (freqB.get(t) || 0) + 1);

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, countA] of freqA) {
    normA += countA * countA;
    const countB = freqB.get(term) || 0;
    if (countB > 0) dot += countA * countB;
  }
  for (const [, countB] of freqB) {
    normB += countB * countB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Sélectionne automatiquement les souvenirs pertinents pour enrichir le contexte de l'IA
 * Utilise une similarité vectorielle lexicale (cosinus) lorsque le mode vectoriel est actif
 */
export function extraireContexteMemoirePertinent(
  requete: string,
  maxItems = 4,
  useVectorRanking = true
): VisionMemoryEntry[] {
  const memoire = readRawMemory();
  if (memoire.length === 0) return [];

  const lowerReq = (requete || '').toLowerCase();
  const queryTokens = tokenizeForVector(requete);

  const scored = memoire.map((item, idx) => {
    const haystack = `${item.titre} ${item.contenu}`;
    const lowerHaystack = haystack.toLowerCase();
    let score = 0;

    if (useVectorRanking) {
      const docTokens = tokenizeForVector(haystack);
      score += cosineSimilarity(queryTokens, docTokens) * 10;
    }

    for (const kw of queryTokens) {
      if (lowerHaystack.includes(kw)) {
        score += 1;
      }
    }
    return { item, score, recency: idx };
  });

  const matches = scored
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score || b.recency - a.recency)
    .slice(0, maxItems)
    .map((s) => s.item);

  if (matches.length > 0) {
    return matches;
  }

  // Si l'utilisateur fait référence explicitement à la mémoire ou aux projets passés, fournir les plus récents
  const asksMemory =
    lowerReq.includes('mémoire') ||
    lowerReq.includes('memoire') ||
    lowerReq.includes('souvien') ||
    lowerReq.includes('rappel') ||
    lowerReq.includes('enregistr') ||
    lowerReq.includes('précédent') ||
    lowerReq.includes('historique');

  if (asksMemory) {
    return memoire.slice(-maxItems).reverse();
  }

  return [];
}
