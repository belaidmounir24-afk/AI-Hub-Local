export type FileCategory = 'image' | 'video';
export type AiProvider = 'gemini' | 'claude' | 'deepseek';
export type HubAppId =
  | 'hub'
  | 'studio'
  | 'ollama'
  | 'multimodal'
  | 'capture'
  | 'exports'
  | 'orchestrator';

export interface VideoFrame {
  timestamp: number;
  dataUrl: string;
  mimeType: string;
}

export interface AttachedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: FileCategory;
  mimeType: string;
  previewUrl: string; // URL blob ou dataUrl pour la miniature
  dataUrl?: string; // base64 de l'image réduite à 1600px max
  duration?: number; // durée totale en secondes pour une vidéo
  frames?: VideoFrame[]; // images extraites toutes les 2s (max 12)
  isProcessing?: boolean;
  processProgress?: number;
  error?: string;
}

export interface AttachedFileSummary {
  type: FileCategory;
  name: string;
  size: number;
  mimeType: string;
  previewUrl: string;
  dataUrl?: string;
  duration?: number;
  frames?: VideoFrame[];
}

export interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  modelName: string;
}

export interface EvalLoopMeta {
  latencyMs: number;
  hasStructuredSections: boolean;
  memoryContextUsed: number;
  wordCount: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  files?: AttachedFileSummary[];
  timestamp: string;
  isError?: boolean;
  canRetry?: boolean;
  rawError?: string;
  usage?: TokenUsage;
  evalMeta?: EvalLoopMeta;
}

export interface OllamaConfig {
  endpoint: string;
  model: string;
  stream: boolean;
  systemPrompt: string;
}

export interface OllamaMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  model?: string;
  durationMs?: number;
  evalCount?: number;
  isError?: boolean;
}

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  category: 'action' | 'navigation' | 'aide';
}

export interface ProcessingProgress {
  stage: string;
  percent: number;
}
