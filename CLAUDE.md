# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Vue 3 application called "MulmoChat" that provides a multi-modal voice chat interface with OpenAI's GPT-4 Realtime API. The application features a comprehensive plugin system with various AI-powered tools including image generation, web browsing, search, mapping, and interactive games.

## Key Commands

- **Development server**: `npm run dev` (runs both client and server concurrently)
- **Client only**: `npm run dev:client`
- **Server only**: `npm run dev:server` or `npm run server`
- **Lint**: `npm run lint`
- **Format code**: `npm run format`

**IMPORTANT**: Do NOT run build commands (`npm run build`, `npm run build:server`, `npm run preview`, `npm run start`) as they create unnecessary build artifacts.

## Architecture

### Core Components

- **App.vue** (src/App.vue): Main application component that orchestrates the UI and coordinates between composables. Handles routing between sidebar and main canvas view components based on selected tool results.
- **Sidebar.vue** (src/components/Sidebar.vue): Left panel with voice controls, tool results display, and text input
- **GoogleMap.vue** (src/components/GoogleMap.vue): Google Maps integration component

### Composables Architecture

The application uses Vue 3 composables to separate concerns and manage complex state:

#### useRealtimeSession (src/composables/useRealtimeSession.ts)
Manages WebRTC connection and OpenAI Realtime API communication:
- **WebRTC Management**: Creates RTCPeerConnection, data channels, and manages audio streams
- **Session Lifecycle**: Start/stop chat, connection state tracking
- **Message Handling**: Processes incoming messages (tool calls, text deltas, speech events)
- **Audio Control**: Mute/unmute, local audio enable/disable
- **Event System**: Registers event handlers for tool calls, text updates, conversation events, and speech detection
- **Data Channel Communication**: Sends user messages, function call outputs, and instructions

Key features:
- Ephemeral key management via `/api/start` endpoint
- Bidirectional audio streaming with getUserMedia
- Function call argument accumulation and deduplication
- Conversation state tracking (active/inactive)
- Speech start/stop detection for listener mode

#### useToolResults (src/composables/useToolResults.ts)
Manages plugin/tool execution and results state:
- **Result Management**: Maintains array of tool execution results with selection state
- **Tool Execution**: Handles incoming tool calls from OpenAI, executes plugins with context
- **Result Updates**: Updates existing results vs. adding new ones based on plugin's `updating` flag
- **Instructions**: Conditionally sends follow-up instructions based on plugin configuration and user preferences
- **File Uploads**: Processes uploaded files as tool results
- **UI Coordination**: Triggers sidebar scrolling and canvas updates

Key features:
- Tool result selection and updates
- Generation status tracking with custom messages per plugin
- Instruction suppression logic (respects `instructionsRequired` flag)
- Plugin delay handling after execution
- Context passing (e.g., current result for updates)

#### useUserPreferences (src/composables/useUserPreferences.ts)
Manages user settings and preferences with localStorage persistence:
- **Preference State**: User language, system prompt ID, custom instructions, suppress instructions flag, enabled plugins
- **localStorage Sync**: Automatically persists all preferences to localStorage with watchers
- **Instruction Building**: Constructs final system prompt from base prompt + plugin prompts + custom instructions + language
- **Tool Building**: Filters enabled tools based on plugin preferences

Storage keys:
- `user_language_v1`: User's native language code
- `suppress_instructions_v1`: Whether to suppress plugin follow-up instructions
- `system_prompt_id_v1`: Selected system prompt (e.g., "default", "listener")
- `enabled_plugins_v1`: JSON object of plugin enable/disable state
- `custom_instructions_v1`: User's custom instructions text

### Server Architecture

- **Express.js server** (server/index.ts): Handles API endpoints and serves the client
- **API routes** (server/routes/api.ts): REST endpoints for starting sessions, Twitter embeds, and search
- **Types** (server/types.ts): TypeScript interfaces for API responses

### Plugin System

The application implements a comprehensive plugin architecture located in `src/tools/`:

**IMPORTANT**: Keep all plugin-specific code out of App.vue and composables. The plugin system is designed to be modular and self-contained:
- **App.vue**: Only orchestrates UI and coordinates between composables using the centralized plugin interface (`toolExecute`, `getToolPlugin`)
- **Composables**: Handle generic concerns (WebRTC, results management, preferences) without plugin-specific logic
- **Plugin system**: All plugin-specific behavior lives in `src/tools/`

#### Core Plugin Interface (src/tools/type.ts)
- **ToolPlugin**: Defines plugin structure with tool definition, execute function, and metadata
- **ToolResult**: Standardized result format for all plugins
- **ToolContext**: Provides context like images to plugin execution

#### Available Plugins
1. **generateImage** (src/tools/generateImage.ts): Google Gemini image generation
2. **editImage** (src/tools/editImage.ts): Image editing capabilities
3. **browse** (src/tools/browse.ts): Web browsing and content extraction
4. **exa** (src/tools/exa.ts): AI-powered search using Exa API
5. **map** (src/tools/map.ts): Google Maps location and directions
6. **mulmocast** (src/tools/mulmocast.ts): Podcast/audio content integration
7. **music** (src/tools/music.ts): Music playback and control
8. **othello** (src/tools/othello.ts): Interactive Othello game with AI
9. **quiz** (src/tools/quiz.ts): Interactive quiz functionality
10. **markdown** (src/tools/markdown.ts): Markdown processing and rendering
11. **canvas** (src/tools/canvas.ts): Canvas drawing and manipulation

#### Plugin Components and Previews
Each plugin has associated Vue components:
- **Components** (src/tools/views/): Full-view components for displaying tool results
- **Previews** (src/tools/previews/): Sidebar thumbnail previews of tool results

### Key Integration Points

The application integrates multiple AI services and APIs:
1. **OpenAI Realtime API**: Voice chat with WebRTC and function calling
2. **Google Gemini**: Image generation and editing
3. **Exa API**: AI-powered web search
4. **Google Maps API**: Location services and mapping
5. **Twitter API**: Tweet embedding (server-side)

### State Management

State is now distributed across composables rather than centralized:
- **User Preferences** (useUserPreferences): System prompt, language, custom instructions, plugin settings - persisted to localStorage
- **Session State** (useRealtimeSession): WebRTC connection, audio streams, data channels, mute state, conversation active status
- **Tool Results** (useToolResults): Array of plugin execution results, selected result, generation status
- **App-level State** (App.vue): User input text, messages array, current text accumulation

### Data Flow

#### Session Initialization Flow
1. User clicks start chat in Sidebar
2. App.vue calls `startChat()` which invokes `useRealtimeSession.startChat()`
3. `useRealtimeSession` fetches ephemeral key from `/api/start` endpoint
4. Creates RTCPeerConnection with data channel named "oai-events"
5. Requests microphone access via getUserMedia
6. Creates WebRTC offer and exchanges SDP with OpenAI's realtime endpoint
7. On data channel open, sends `session.update` with instructions (from useUserPreferences) and tools

#### Message Flow (WebRTC → Tool Execution)
1. OpenAI sends message through WebRTC data channel
2. `useRealtimeSession` receives message in `handleMessage` handler
3. Different message types trigger different handlers:
   - `response.function_call_arguments.delta`: Accumulates function arguments
   - `response.function_call_arguments.done`: Calls registered `onToolCall` handler
   - `response.text.delta`: Calls `onTextDelta` for streaming text
   - `response.created`/`response.done`: Updates conversation active state
   - `input_audio_buffer.speech_started/stopped`: Triggers speech event handlers
4. App.vue's registered `onToolCall` handler forwards to `useToolResults.handleToolCall()`
5. `useToolResults` executes the plugin via `toolExecute(context, toolName, args)`
6. Result is added to `toolResults` array (or updates existing if `result.updating === true`)
7. Result displayed in sidebar preview and selected for main canvas
8. Function output sent back to OpenAI via `sendFunctionCallOutput()`
9. Optional follow-up instructions sent via `sendInstructions()` if plugin defines them

#### User Text Message Flow
1. User types in sidebar text input and presses send
2. Sidebar emits `send-text-message` event
3. App.vue's `sendTextMessage()` waits for conversation to be inactive (max 5 seconds)
4. Calls `useRealtimeSession.sendUserMessage(text)`
5. Sends two data channel messages:
   - `conversation.item.create` with user message content
   - `response.create` to trigger model response

#### Listener Mode Flow (Special System Prompt)
When `systemPromptId === "listener"`:
1. Speech starts → Updates `lastSpeechStartedTime`
2. Speech stops → Checks if speech duration exceeded threshold (15 seconds)
3. If threshold exceeded:
   - Disables local audio via `setLocalAudioEnabled(false)`
   - Waits for audio gap (2 seconds)
   - Re-enables audio based on current mute state
   - Resets speech start timer

## Mulmocast NPM Package API

### Overview

The mulmocast npm package provides programmatic TypeScript/JavaScript API to create movies from MulmoScript. It exports both Node.js and browser-compatible modules with full TypeScript type definitions.

### Installation

```bash
yarn add mulmocast
```

**Requirements**: Node.js >= 20.0.0, FFmpeg installed on system

### Main Entry Points

```typescript
// Node.js import
import { movie, movieFilePath } from 'mulmocast';
import type { MulmoStudioContext, MulmoCanvasDimension, BeatMediaType, MulmoFillOption } from 'mulmocast';

// Package exports:
// - Node: "./lib/index.node.js" (types: "./lib/index.node.d.ts")
// - Browser: "./lib/index.browser.js" (types: "./lib/index.browser.d.ts")
```

### Key Function: `movie()`

The primary function to create a movie from MulmoScript:

```typescript
function movie(context: MulmoStudioContext): Promise<void>
```

**Parameters:**
- `context: MulmoStudioContext` - Studio context object containing:
  - The MulmoScript data (JSON/YAML format with beats)
  - Audio files for each beat
  - Image files for visual content
  - Canvas dimensions and layout settings
  - Output file path and settings
  - Localization options (language, captions)

**Returns:** `Promise<void>` - Resolves when the video MP4 file is created

### Supporting Functions

1. **`movieFilePath(context: MulmoStudioContext): string`**
   ```typescript
   function movieFilePath(context: MulmoStudioContext): string
   ```
   - Generates the output video file path based on the context
   - Returns the full path where the video will be saved

2. **`getVideoPart(inputIndex: number, mediaType: BeatMediaType, duration: number, canvasInfo: MulmoCanvasDimension, fillOption: MulmoFillOption, speed: number)`**
   ```typescript
   function getVideoPart(
     inputIndex: number,
     mediaType: BeatMediaType,
     duration: number,
     canvasInfo: MulmoCanvasDimension,
     fillOption: MulmoFillOption,
     speed: number
   ): { videoId: string; videoPart: string }
   ```
   - Generates video processing parameters for FFmpeg filtering
   - Handles different media types (image, video, screen)
   - Returns video filter configuration with `videoId` and `videoPart`

3. **`getAudioPart(inputIndex: number, duration: number, delay: number, mixAudio: number)`**
   ```typescript
   function getAudioPart(
     inputIndex: number,
     duration: number,
     delay: number,
     mixAudio: number
   ): { audioId: string; audioPart: string }
   ```
   - Creates audio processing parameters for mixing
   - Handles audio trimming, delay, and volume mixing
   - Returns audio filter configuration with `audioId` and `audioPart`

### Usage Pattern

The typical workflow to create a movie:

1. Prepare your MulmoScript JSON with beats defining the content
2. Generate audio files for narration (using audio generation)
3. Prepare image/video files for visuals (using image generation)
4. Create a `MulmoStudioContext` with all resources
5. Call `movie(context)` to generate the final MP4 video

The package uses FFmpeg internally for video generation, combining audio, images, and transitions into a single video file.

### MulmoScript Format

Basic structure:
```typescript
interface MulmoScript {
  $mulmocast: { version: string };
  beats: Array<{
    text: string;
    image?: string;
    audio?: string;
  }>;
}

// Example:
const script: MulmoScript = {
  "$mulmocast": { "version": "1.0" },
  "beats": [
    {
      "text": "Hello World",
      "image": "path/to/image.png",
      "audio": "path/to/audio.mp3"
    }
  ]
};
```

### CLI Alternative

The package also provides CLI commands via the `mulmo` binary:
- `mulmo movie <script.json>` - Generate movie from script
- `mulmo audio <script.json>` - Generate audio only
- `mulmo images <script.json>` - Generate images only

---

## Learn Your Way - 日本版 幼児教育向けAI個別最適化学習システム

### 1. エグゼクティブサマリー

#### 1.1 プロジェクト概要
本プロジェクトは、Googleが2025年9月に発表した「Learn Your Way」の設計思想を、日本の幼児教育・保育者研修領域に適用するオープンソースシステムの開発を目指す。

#### 1.2 解決する課題
- 保育者研修教材が静的テキスト中心で、学習効率が低い
- 幼児向け教材の個別最適化（興味関心への対応）が人手に依存
- 既存のAI学習サービス（atama+等）が幼児教育領域に未対応

#### 1.3 提案するソリューション
教材PDF/テキストを入力として、学習者の属性（年齢・興味関心）に応じてコンテンツをリライトし、動画・音声・クイズ・マインドマップなど複数形式に自動変換するシステム。

#### 1.4 既存サービスとの差別化

| 観点 | atama+ | 本システム |
|------|--------|-----------|
| 最適化の軸 | 学習経路（何を学ぶか） | 表現・例示（どう学ぶか） |
| 対象年齢 | 小中高生 | 幼児・保育者 |
| 教材変換 | 順序の並べ替え | AIによる書き換え＋形式変換 |
| 提供形態 | 商用SaaS | オープンソース |
| 導入コスト | 月額課金 | API利用料のみ |

---

### 2. システムアーキテクチャ

#### 2.1 全体構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        入力レイヤー                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │ PDF教材  │  │ テキスト │  │ 学習者   │                       │
│  │          │  │ ファイル │  │ プロファイル│                    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                       │
└───────┼──────────────┼──────────────┼───────────────────────────┘
        │              │              │
        ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     処理レイヤー                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              コンテンツ変換エンジン                        │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │  │
│  │  │PDF解析  │→│リライト │→│形式変換 │→│品質検証 │    │  │
│  │  │(PyMuPDF)│  │(LLM)    │  │(MulmoCast)│ │(LLM)    │    │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      出力レイヤー                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐           │
│  │リライト │  │ 動画    │  │ 音声    │  │ クイズ  │           │
│  │テキスト │  │ (.mp4)  │  │ (.mp3)  │  │ (JSON)  │           │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                        │
│  │マインド │  │ PDF     │  │ スライド│                        │
│  │マップ   │  │ 資料    │  │ (PPTX)  │                        │
│  └─────────┘  └─────────┘  └─────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2 コンポーネント構成

##### 2.2.1 入力処理モジュール

| コンポーネント | 技術 | 役割 |
|--------------|------|------|
| PDF Parser | PyMuPDF / pdfplumber | PDFからテキスト・画像を抽出 |
| Text Chunker | LangChain TextSplitter | 長文を意味単位で分割 |
| Profile Manager | JSON Schema | 学習者属性の管理・バリデーション |

##### 2.2.2 コンテンツ変換エンジン

| コンポーネント | 技術 | 役割 |
|--------------|------|------|
| Rewriter | Claude API / GPT-4 | 年齢・興味に応じた文章リライト |
| Example Generator | Claude API / GPT-4 | 興味関心に基づく具体例生成 |
| Quiz Generator | Claude API / GPT-4 | 理解度確認クイズの自動生成 |
| MindMap Generator | Mermaid.js | 概念関係図の自動生成 |

##### 2.2.3 マルチモーダル出力モジュール

| コンポーネント | 技術 | 役割 |
|--------------|------|------|
| Video Generator | MulmoCast | テキスト→ナレーション付き動画 |
| Audio Generator | OpenAI TTS / ElevenLabs | 音声教材の生成 |
| Slide Generator | MulmoCast / python-pptx | プレゼンスライド生成 |
| PDF Generator | MulmoCast / ReportLab | 配布用PDF資料生成 |

---

### 3. 技術スタック

#### 3.1 バックエンド

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| 言語 | Python | 3.11+ | メイン処理 |
| 言語 | Node.js | 20 LTS | MulmoCast実行 |
| フレームワーク | FastAPI | 0.100+ | REST API |
| タスクキュー | Celery + Redis | 5.3+ | 非同期処理 |
| データベース | PostgreSQL | 15+ | メタデータ管理 |
| オブジェクトストレージ | MinIO / S3 | - | 生成ファイル保存 |

#### 3.2 AI/ML

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| LLM | Claude 3.5 Sonnet / GPT-4o | テキストリライト・クイズ生成 |
| TTS | OpenAI TTS / ElevenLabs / VOICEVOX | 音声合成（日本語対応） |
| 画像生成 | DALL-E 3 / Stable Diffusion | 挿絵・背景画像生成 |
| Embedding | text-embedding-3-small | 類似コンテンツ検索 |

#### 3.3 OSSライブラリ

| ライブラリ | GitHub | 用途 |
|-----------|--------|------|
| MulmoCast | receptron/mulmocast-cli | マルチモーダルコンテンツ生成 |
| LermoAI | LERM0/LermoAI | 教育特化AI基盤（参考実装） |
| LangChain | langchain-ai/langchain | LLMオーケストレーション |
| PyMuPDF | pymupdf/PyMuPDF | PDF解析 |
| Mermaid | mermaid-js/mermaid | マインドマップ生成 |

#### 3.4 インフラ

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| コンテナ | Docker / Docker Compose | 開発・デプロイ |
| オーケストレーション | Kubernetes（本番） | スケーリング |
| CI/CD | GitHub Actions | 自動テスト・デプロイ |
| 監視 | Prometheus + Grafana | パフォーマンス監視 |

---

### 4. データフロー

#### 4.1 メイン処理フロー

```
[ユーザー]
    │
    │ 1. 教材PDF + 学習者プロファイル
    ▼
[API Gateway] ─────────────────────────────────────────────────
    │
    │ 2. リクエスト検証・認証
    ▼
[Job Queue (Celery)] ──────────────────────────────────────────
    │
    ├─→ 3a. PDF解析 (PyMuPDF)
    │       └─→ テキスト抽出・チャンク分割
    │
    ├─→ 3b. プロファイル解析
    │       └─→ 年齢・興味関心の正規化
    │
    ▼
[LLM Processing] ──────────────────────────────────────────────
    │
    ├─→ 4a. コンテンツリライト
    │       └─→ 年齢に応じた語彙・文体調整
    │
    ├─→ 4b. 例示生成
    │       └─→ 興味関心に基づく具体例挿入
    │
    ├─→ 4c. クイズ生成
    │       └─→ 選択式・穴埋め問題作成
    │
    ▼
[MulmoCast] ───────────────────────────────────────────────────
    │
    ├─→ 5a. MulmoScript生成 (JSON)
    ├─→ 5b. 画像生成 (DALL-E / SD)
    ├─→ 5c. 音声生成 (TTS)
    ├─→ 5d. 動画合成 (FFmpeg)
    │
    ▼
[Storage (S3/MinIO)] ──────────────────────────────────────────
    │
    │ 6. 生成ファイル保存・URL発行
    ▼
[ユーザー]
    │
    │ 7. ダウンロードURL受信
    ▼
[完了]
```

#### 4.2 学習者プロファイル仕様

```json
{
  "learner_id": "uuid",
  "age_group": "preschool" | "elementary_lower" | "elementary_upper" | "adult",
  "grade_level": 1-6 | null,
  "interests": ["vehicles", "animals", "food", "sports", "music"],
  "learning_style": "visual" | "auditory" | "reading" | "kinesthetic",
  "output_formats": ["video", "audio", "quiz", "mindmap", "pdf", "slides"],
  "language": "ja" | "en"
}
```

---

### 5. API設計

#### 5.1 エンドポイント一覧

| メソッド | エンドポイント | 説明 |
|---------|---------------|------|
| POST | /api/v1/transform | 教材変換ジョブの作成 |
| GET | /api/v1/jobs/{job_id} | ジョブ状態の取得 |
| GET | /api/v1/jobs/{job_id}/outputs | 生成ファイル一覧の取得 |
| DELETE | /api/v1/jobs/{job_id} | ジョブのキャンセル |
| POST | /api/v1/profiles | 学習者プロファイルの登録 |
| GET | /api/v1/profiles/{profile_id} | 学習者プロファイルの取得 |

#### 5.2 リクエスト/レスポンス例

##### 5.2.1 教材変換リクエスト

```
POST /api/v1/transform
Content-Type: multipart/form-data
```

```json
{
  "file": "<binary: PDF file>",
  "profile": {
    "age_group": "preschool",
    "interests": ["vehicles", "animals"],
    "output_formats": ["video", "audio", "quiz"]
  },
  "options": {
    "video_style": "ghibli",
    "voice_id": "nova",
    "quiz_count": 5
  }
}
```

##### 5.2.2 変換結果レスポンス

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "outputs": {
    "rewritten_text": "https://storage.example.com/outputs/xxx/text.md",
    "video": "https://storage.example.com/outputs/xxx/video.mp4",
    "audio": "https://storage.example.com/outputs/xxx/audio.mp3",
    "quiz": "https://storage.example.com/outputs/xxx/quiz.json",
    "mindmap": "https://storage.example.com/outputs/xxx/mindmap.svg"
  },
  "metadata": {
    "processing_time_seconds": 127,
    "token_usage": { "input": 2340, "output": 8920 },
    "cost_usd": 0.42
  }
}
```

---

### 6. リライトプロンプト設計

#### 6.1 システムプロンプト

```
あなたは幼児教育の専門家です。
以下の教育コンテンツを、指定された年齢層と興味関心に合わせてリライトしてください。

## リライトのルール
1. 語彙: 対象年齢に適した語彙を使用（幼児向けは平仮名中心）
2. 文長: 1文は20文字以内を目安に短く
3. 具体例: 抽象的な概念は、指定された興味関心に関連する具体例で説明
4. 感情: 「すごいね！」「ふしぎだね！」など感嘆表現を適度に挿入
5. 対話: 「〇〇って知ってる？」など問いかけを含める

## 入力情報
- 対象年齢: {age_group}
- 興味関心: {interests}
- 元のコンテンツ: {original_content}

## 出力形式
リライトしたコンテンツのみを出力してください。
```

#### 6.2 興味関心別の例示マッピング

| 興味関心 | 数学的概念 | 具体例 |
|---------|-----------|--------|
| 乗り物 | パターン（繰り返し） | 信号機の色の順番、電車のドアの開閉 |
| 動物 | パターン（繰り返し） | シマウマの縞模様、蝶の羽の対称 |
| 食べ物 | パターン（繰り返し） | おせんべいの模様、ケーキのデコレーション |
| 音楽 | パターン（繰り返し） | リズムの繰り返し、メロディのパターン |
| スポーツ | パターン（繰り返し） | サッカーのパス回し、体操の動きの順番 |

---

### 7. MulmoCast連携仕様

#### 7.1 MulmoScript生成フロー

リライト済みテキストから、MulmoCast用のMulmoScript（JSON形式）を自動生成する。

##### 7.1.1 MulmoScript構造

```json
{
  "$mulmocast": { "version": "1.0" },
  "canvasSize": { "width": 1280, "height": 720 },
  "speechParams": {
    "provider": "openai",
    "speakers": {
      "Narrator": {
        "displayName": { "ja": "せんせい" },
        "voiceId": "nova",
        "speechOptions": {
          "instruction": "優しく語りかけるように、ゆっくり話してください",
          "speed": 0.9
        }
      }
    }
  },
  "imageParams": {
    "style": "やさしい水彩画風、パステルカラー、丸みのある形",
    "provider": "openai"
  },
  "lang": "ja",
  "beats": [
    {
      "speaker": "Narrator",
      "text": "きょうは「パターン」について おはなしするよ！",
      "imagePrompt": "幼稚園の教室、カラフルな積み木、明るい雰囲気"
    }
  ]
}
```

#### 7.2 出力形式オプション

| 形式 | MulmoCastコマンド | 用途 |
|------|------------------|------|
| 動画 | `mulmo movie script.json -c ja` | ナレーション付き動画教材 |
| 音声のみ | `mulmo audio script.json -l ja` | ポッドキャスト形式 |
| PDF | `mulmo pdf script.json --pdf_mode slide` | 配布用スライド資料 |
| スライド | `mulmo slides script.json` | プレゼン用スライド |

---

### 8. セキュリティ設計

#### 8.1 認証・認可
- **API認証**: JWT (JSON Web Token) による Bearer認証
- **認可**: RBAC (Role-Based Access Control) による権限管理
- **APIキー**: 環境変数での管理、Vault等での暗号化保存

#### 8.2 データ保護
- **通信**: TLS 1.3による暗号化
- **保存**: AES-256による暗号化
- **個人情報**: 学習者プロファイルは匿名化オプション提供
- **ログ**: 個人情報をマスキングして保存

#### 8.3 コンテンツ安全性
- **入力検証**: 不適切コンテンツのフィルタリング
- **出力検証**: 生成コンテンツの年齢適合性チェック
- **人間レビュー**: 本番運用前の教育専門家によるチェックフロー

---

### 9. コスト見積もり

#### 9.1 API利用料（1教材あたり）

| サービス | 用途 | 概算コスト |
|---------|------|-----------|
| Claude API | リライト・クイズ生成 | $0.10 - $0.30 |
| OpenAI TTS | 音声生成（5分想定） | $0.05 - $0.10 |
| DALL-E 3 | 画像生成（5枚想定） | $0.20 - $0.40 |
| **合計** | - | **$0.35 - $0.80 / 教材** |

#### 9.2 インフラコスト（月額）

| 項目 | スペック | 概算コスト |
|------|---------|-----------|
| API サーバー | 2vCPU, 4GB RAM | $30 - $50 |
| ワーカーサーバー | 4vCPU, 8GB RAM | $60 - $100 |
| データベース | PostgreSQL 20GB | $20 - $40 |
| オブジェクトストレージ | 100GB | $5 - $10 |
| **合計** | - | **$115 - $200 / 月** |

#### 9.3 スケーリング時のコスト

月間1,000教材処理の場合：
- API利用料: $350 - $800
- インフラ: $200 - $400（スケールアップ含む）
- **合計: $550 - $1,200 / 月**

---

### 10. 開発ロードマップ

#### 10.1 Phase 1: MVP開発（1-2ヶ月）

| タスク | 成果物 |
|-------|--------|
| 要件定義・設計 | 本設計書の確定 |
| PDF解析モジュール開発 | テキスト抽出機能 |
| リライトエンジン開発 | LLM連携・プロンプト最適化 |
| MulmoCast連携 | 動画・音声生成機能 |
| API開発・結合テスト | MVP版API |

#### 10.2 Phase 2: パイロット実証（2-3ヶ月）

| タスク | 成果物 |
|-------|--------|
| 教材準備 | 実験用教材（パターン認識） |
| システム調整 | フィードバック反映 |
| 保育者研修での試用 | 実験A実施 |
| 幼児向け教材の試用 | 実験B実施 |
| データ収集 | 学習効果データ |

#### 10.3 Phase 3: 分析・論文化（3-4ヶ月）

| タスク | 成果物 |
|-------|--------|
| データ分析 | 統計分析結果 |
| 論文執筆 | 学会論文ドラフト |
| システム改善 | 機能追加・バグ修正 |
| OSS公開準備 | ドキュメント・ライセンス整備 |
| 学会発表 | 発表資料 |

---

### 11. リスクと対策

| リスク | 影響度 | 対策 |
|-------|-------|------|
| LLM出力の品質ばらつき | 高 | プロンプトチューニング、出力検証ロジック、人間レビュー |
| API利用料の増大 | 中 | キャッシュ活用、バッチ処理、ローカルLLM検討 |
| 著作権問題 | 中 | 入力教材のライセンス確認フロー、利用規約整備 |
| 幼児向けコンテンツの安全性 | 高 | 年齢別フィルタリング、専門家レビュー必須化 |
| MulmoCast仕様変更 | 低 | バージョン固定、フォールバック処理 |

---

### 12. 付録

#### 12.1 参考リポジトリ
- **MulmoCast**: https://github.com/receptron/mulmocast-cli
- **LermoAI**: https://github.com/LERM0/LermoAI
- **Google Learn Your Way（研究論文）**: https://research.google/blog/learn-your-way-reimagining-textbooks-with-generative-ai/

#### 12.2 関連論文
- 福澤惇也 (2024) 幼児期のパターン認識に関する研究
- Google Research (2025) Learn Your Way: Reimagining textbooks with generative AI

#### 12.3 用語集

| 用語 | 説明 |
|------|------|
| Learn Your Way | Googleの教材個別最適化研究プロジェクト |
| MulmoCast | 中島聡氏開発のマルチモーダルコンテンツ生成OSS |
| MulmoScript | MulmoCastの入力形式（JSON） |
| SFOP | Spontaneous Focus on Pattern（自発的パターン着目） |
| リライト | 対象者に合わせた文章の書き換え |
| マルチモーダル | テキスト・音声・動画など複数形式での表現 |

---

### 13. MulmoChat統合時の追加コンポーネント

#### フロントエンド (src/tools/)

| ファイル | 役割 |
|---------|------|
| `learnYourWay.ts` | Learn Your Wayプラグイン本体 |
| `views/LearnYourWayView.vue` | 教材変換メインUI |
| `previews/LearnYourWayPreview.vue` | サイドバープレビュー |

#### バックエンド (server/)

| ファイル | 役割 |
|---------|------|
| `routes/transform.ts` | 教材変換APIエンドポイント |
| `services/pdfParser.ts` | PDF解析サービス |
| `services/rewriter.ts` | コンテンツリライトサービス |
| `services/quizGenerator.ts` | クイズ生成サービス |
| `services/mindmapGenerator.ts` | マインドマップ生成サービス |

#### 環境変数（追加）

```env
# OpenAI API (必須)
OPENAI_API_KEY=sk-xxx

# 出力ディレクトリ
OUTPUT_DIR=./outputs

# 動画スタイル設定
DEFAULT_VIDEO_STYLE=ghibli
DEFAULT_VOICE_ID=nova
```