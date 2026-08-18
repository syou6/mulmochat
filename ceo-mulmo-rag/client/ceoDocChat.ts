export interface CeoDocChatOptions {
  endpoint?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  topK?: number;
  threshold?: number;
  messages?: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
}

function readEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name];
  }
  if (typeof globalThis !== "undefined") {
    const metaEnv = (globalThis as typeof globalThis & {
      import?: { meta?: { env?: Record<string, string> } };
    }).import?.meta?.env;
    if (metaEnv && metaEnv[name]) {
      return metaEnv[name];
    }
  }
  return undefined;
}

export async function ceoDocChat(
  query: string,
  options?: CeoDocChatOptions,
): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("query is required");
  }

  const supabaseUrl =
    options?.supabaseUrl ||
    readEnv("VITE_SUPABASE_URL") ||
    readEnv("SUPABASE_URL");

  const supabaseKey =
    options?.supabaseKey ||
    readEnv("VITE_SUPABASE_SERVICE_ROLE_KEY") ||
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readEnv("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE key are required");
  }

  const endpoint =
    options?.endpoint || `${supabaseUrl}/functions/v1/ceo-chat`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      query: trimmed,
      messages: options?.messages || [],
      topK: options?.topK,
      threshold: options?.threshold,
    }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ceoDocChat failed: ${response.status} ${text}`);
  }

  return response.text();
}
