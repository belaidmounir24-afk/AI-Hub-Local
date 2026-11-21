import { ChatMessage } from '../types';

export type ReportFormat = 'pdf' | 'excel';

export async function downloadReport(
  format: ReportFormat,
  messages: ChatMessage[] = []
): Promise<void> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const url =
    format === 'pdf' ? '/api/v1/export/pdf' : '/api/v1/export/excel';
  const filename =
    format === 'pdf' ? 'rapport_visionia.pdf' : 'donnees_visionia.xlsx';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Préparer les données utiles sans inclure les lourdes chaînes base64 des fichiers
  const sanitizedMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    timestamp: m.timestamp,
    files: m.files?.map((f) => ({
      name: f.name,
      type: f.type,
    })),
    usage: m.usage,
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: "Rapport d'analyse • VisionIA",
      messages: sanitizedMessages,
    }),
  });

  if (!response.ok) {
    let detail = 'Erreur lors de la génération du fichier.';
    try {
      const errData = await response.json();
      if (errData?.error) detail = errData.error;
    } catch {
      // Ignorer
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1000);
}
