export interface RealtimeModelOption {
  id: string;
  label: string;
  description?: string;
}

export const REALTIME_MODELS: RealtimeModelOption[] = [
  {
    id: "gpt-realtime",
    label: "GPT Realtime",
  },
  {
    id: "gpt-realtime-mini",
    label: "GPT Realtime Mini",
    description: "Lower-latency, lower-cost realtime model",
  },
];

export const DEFAULT_REALTIME_MODEL_ID = REALTIME_MODELS[0].id;

export interface GoogleLiveModelOption {
  id: string;
  label: string;
  description?: string;
}

export const GOOGLE_LIVE_MODELS: GoogleLiveModelOption[] = [
  {
    id: "gemini-2.0-flash-live-001",
    label: "Gemini 2.0 Flash Live",
    description: "Gemini Live API model with audio support",
  },
  {
    id: "gemini-2.0-flash-exp",
    label: "Gemini 2.0 Flash Experimental",
    description: "Experimental model",
  },
];

export const DEFAULT_GOOGLE_LIVE_MODEL_ID = GOOGLE_LIVE_MODELS[0].id;
