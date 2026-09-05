// Voice notes → text. Runs speech-to-text server-side, then the normal chat
// path (crisis gate included) handles the transcript.
//
// Provider: OpenAI transcription (OPENAI_API_KEY) — the same account that runs
// the live voice calls, so voice is one provider end to end. The client sends a
// 16 kHz mono WAV (or mp3) as base64.
const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

class VoiceError extends Error {}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function transcribeAudioCore(input: { audio_base64: string; mime_type: string }) {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new VoiceError("Voice messages aren't configured yet.");

  const isMp3 = input.mime_type === "audio/mpeg" || input.mime_type === "audio/mp3";
  const filename = isMp3 ? "note.mp3" : "note.wav";
  const contentType = isMp3 ? "audio/mpeg" : "audio/wav";

  const form = new FormData();
  form.append("model", OPENAI_TRANSCRIBE_MODEL);
  form.append("response_format", "json");
  form.append("file", new Blob([base64ToBytes(input.audio_base64)], { type: contentType }), filename);

  const response = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("openai transcription failed", response.status, body.slice(0, 300));
    throw new VoiceError(
      response.status === 401
        ? "The voice provider rejected the configured key."
        : response.status === 429 || response.status === 402
          ? "Too many voice notes right now — try again in a moment."
          : "Couldn't understand that recording. Try again or type instead.",
    );
  }

  const payload = (await response.json()) as { text?: string | null };
  const text = (payload.text ?? "").trim();

  if (!text) throw new VoiceError("That recording came through silent. Try again.");
  return { text };
}
