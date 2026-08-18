# CEO RAG Bridge (MulmoChat × chatgpt-your-files)

経営者向けに「自社ドキュメントに基づく回答」を返すための橋渡しコードです。

- `supabase/functions/ceo-chat/` : Supabase Edge Function（RAG＋経営者向けプロンプト）
- `client/ceoDocChat.ts` : フロント（MulmoChatなど）から Edge Function を叩くための軽量クライアント

## 前提
- Supabase ローカル／または Supabase プロジェクトが起動済み（`chatgpt-your-files` のスキーマと `match_document_sections` RPC を利用）
- OpenAI API キー（埋め込み＆回答生成に使用）
- `match_document_sections` が参照する `document_sections` テーブルに PDF/MD などのセクションが格納されていること

## 設定
`supabase/functions/.env`（Edge Functions 用）に最低限以下を設定してください。

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini            # 任意（デフォルトは gpt-4o-mini）
EMBEDDING_MODEL=text-embedding-3-small  # 任意（デフォルト）
SUPABASE_SERVICE_ROLE_KEY=...       # サービスロールキー（Authorization にも使用）
```

## 配置手順
1) `ceo-mulmo-rag/supabase/functions/ceo-chat` を、`chatgpt-your-files/supabase/functions/` 配下にコピー
2) Supabase を起動

```
supabase start
supabase functions serve --env-file supabase/functions/.env
```

## フロントから呼ぶ（MulmoChat など）
`ceo-mulmo-rag/client/ceoDocChat.ts` をフロント側プロジェクトに配置し、環境変数を設定:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_SERVICE_ROLE_KEY=...
```

呼び出し例:

```ts
import { ceoDocChat } from "./ceoDocChat";

const answer = await ceoDocChat("今期の主要リスクを要約して");
console.log(answer);
```

## プロンプトの方針
- 要約 / リスク / 次の一手 を日本語で返す
- 文書外の推測は避け、根拠が薄い場合は「情報不足」と明記
- 近似検索の件数は `topK`（デフォルト 8）、類似度閾値は `threshold`（デフォルト 0.75）で調整可能

## ZIP 化
このフォルダごと zip 化したい場合はプロジェクトルートで:

```
zip -r ceo-mulmo-rag.zip ceo-mulmo-rag
```

を実行してください。
