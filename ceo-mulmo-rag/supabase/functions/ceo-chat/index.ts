import { createClient } from "@supabase/supabase-js";
import { OpenAIStream, StreamingTextResponse } from "ai";
import { codeBlock } from "common-tags";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or supabase key" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const authHeader =
    req.headers.get("Authorization") || `Bearer ${supabaseAnonKey}`;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
    auth: { persistSession: false },
  });

  let payload: {
    query?: string;
    messages?: { role: "user" | "assistant"; content: string }[];
    topK?: number;
    threshold?: number;
  };

  try {
    payload = await req.json();
  } catch (error) {
    console.error("Invalid JSON", error);
    return new Response(
      JSON.stringify({ error: "Invalid JSON payload" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const query = (payload.query || "").trim();
  if (!query) {
    return new Response(
      JSON.stringify({ error: "query is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const embeddingModel =
    Deno.env.get("EMBEDDING_MODEL") || "text-embedding-3-small";

  const embeddingResponse = await openai.embeddings.create({
    model: embeddingModel,
    input: query,
  });

  const embedding = embeddingResponse.data?.[0]?.embedding;

  if (!embedding) {
    return new Response(
      JSON.stringify({ error: "Failed to create embedding" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const matchThreshold = payload.threshold ?? 0.75;
  const matchLimit = payload.topK ?? 8;

  const { data: documents, error: matchError } = await supabase
    .rpc("match_document_sections", {
      embedding,
      match_threshold: matchThreshold,
    })
    .select("content")
    .limit(matchLimit);

  if (matchError) {
    console.error("match_document_sections failed", matchError);
    return new Response(
      JSON.stringify({ error: "Failed to fetch documents" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const injectedDocs =
    documents && documents.length > 0
      ? documents.map(({ content }) => content).join("\n\n")
      : "該当文書なし";

  const ceoPrompt = codeBlock`
あなたは企業の経営参謀です。社内ドキュメントを根拠に日本語で回答してください。

- 要約: 箇条書きで 3 行以内
- リスク: 2-4 件、具体的に
- 次の一手: 具体的なアクションを短く
- 文書に根拠が薄い場合は「情報不足」と明記

文書:
${injectedDocs}
`; 

  const chatModel = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

  const completionStream = await openai.chat.completions.create({
    model: chatModel,
    stream: true,
    temperature: 0.3,
    max_tokens: 900,
    messages: [
      { role: "system", content: "経営者向けに簡潔かつ具体的に答えてください。" },
      { role: "user", content: ceoPrompt },
      ...(payload.messages || []),
      { role: "user", content: query },
    ],
  });

  const stream = OpenAIStream(completionStream);
  return new StreamingTextResponse(stream, { headers: corsHeaders });
});
