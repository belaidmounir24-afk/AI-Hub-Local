// Module de gestion de la synthèse vocale basé sur la Web Speech API (window.speechSynthesis)

export interface SpeechSettings {
  autoRead: boolean; // Lecture automatique des réponses de l'IA
  voiceUri: string; // Identifiant unique de la voix
  rate: number; // Vitesse d'élocution (0.8 à 1.5)
  pitch: number; // Hauteur de la voix (0.8 à 1.2)
  volume: number; // Volume (0.0 à 1.0)
}

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  autoRead: true, // Activé par défaut selon la demande
  voiceUri: '',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
};

const STORAGE_KEY_SPEECH = 'marchedz_speech_settings_v1';

export function loadSpeechSettings(): SpeechSettings {
  if (typeof window === 'undefined') return DEFAULT_SPEECH_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SPEECH);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_SPEECH_SETTINGS, ...parsed };
      return {
        ...merged,
        autoRead: Boolean(merged.autoRead),
        volume: typeof merged.volume === 'number' && !Number.isNaN(merged.volume)
          ? Math.min(1, Math.max(0, merged.volume))
          : DEFAULT_SPEECH_SETTINGS.volume,
        rate: typeof merged.rate === 'number' && !Number.isNaN(merged.rate)
          ? Math.min(1.5, Math.max(0.8, merged.rate))
          : DEFAULT_SPEECH_SETTINGS.rate,
        pitch: typeof merged.pitch === 'number' && !Number.isNaN(merged.pitch)
          ? Math.min(1.2, Math.max(0.8, merged.pitch))
          : DEFAULT_SPEECH_SETTINGS.pitch,
      };
    }
  } catch {
    // Échec de lecture local storage
  }
  return DEFAULT_SPEECH_SETTINGS;
}

export function saveSpeechSettings(settings: SpeechSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SPEECH, JSON.stringify(settings));
  } catch {
    // Ignorer
  }
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Nettoie le texte Markdown pour obtenir une prononciation fluide, agréable et naturelle
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return '';

  return text
    // Supprimer les blocs de code volumineux pour ne pas épeler le code
    .replace(/```[\s\S]*?```/g, ' [extrait technique omis] ')
    // Remplacer le code inline par le mot sans accentuation syntaxique
    .replace(/`([^`]+)`/g, '$1')
    // Liens markdown [texte](url) -> texte
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Supprimer les URLs brutes
    .replace(/https?:\/\/[^\s]+/g, ' lien web ')
    // Nettoyer les puces et symboles markdown
    .replace(/[*_#~>•-]/g, ' ')
    // Remplacer les tirets doubles par des pauses
    .replace(/--+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Récupère les voix disponibles sur le système, triées par pertinence (Français en premier)
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  const voices = window.speechSynthesis.getVoices();

  // Déduplication des voix identiques (certains moteurs Android TTS exposent plusieurs instances pour la même langue/URI)
  const seen = new Set<string>();
  const uniqueVoices: SpeechSynthesisVoice[] = [];

  for (const voice of voices) {
    const id = voice.voiceURI ? voice.voiceURI.trim() : `${voice.name}__${voice.lang}`;
    if (!seen.has(id)) {
      seen.add(id);
      uniqueVoices.push(voice);
    }
  }

  // Tri : voix françaises en tête, puis alphabétique
  return uniqueVoices.sort((a, b) => {
    const aIsFr = a.lang.toLowerCase().startsWith('fr');
    const bIsFr = b.lang.toLowerCase().startsWith('fr');
    if (aIsFr && !bIsFr) return -1;
    if (!aIsFr && bIsFr) return 1;
    return a.name.localeCompare(b.name);
  });
}
