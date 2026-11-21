export interface OcrResult {
  text: string;
  confidence: number;
}

export function cleanOcrText(rawText: string): string {
  return rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': 'Chargement moteur OCR...',
  'initializing tesseract': 'Initialisation OCR...',
  'loading language traineddata': 'Chargement dictionnaire FR/EN...',
  'initializing api': 'Préparation reconnaissance...',
  'recognizing text': 'Lecture du texte en cours...',
};

export async function extractTextClientSide(
  imageSource: string,
  onProgress?: (percent: number, stage: string) => void
): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker(['fra', 'eng'], undefined, {
    logger: (msg) => {
      if (!onProgress) return;
      const pct = typeof msg.progress === 'number' ? Math.round(msg.progress * 100) : 0;
      const stage = STATUS_LABELS[msg.status] || 'Traitement OCR...';
      onProgress(pct, stage);
    },
  });

  try {
    const result = await worker.recognize(imageSource);
    const cleaned = cleanOcrText(result.data.text || '');
    const confidence = typeof result.data.confidence === 'number' ? Math.round(result.data.confidence) : 0;

    return {
      text: cleaned,
      confidence,
    };
  } finally {
    await worker.terminate();
  }
}
