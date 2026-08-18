# Learn Your Way 実行計画 TODO

## Phase 1: MVP開発

### 1. 環境構築
- [ ] 必要なnpmパッケージのインストール
  - [ ] `pdf-parse` (PDF解析)
  - [ ] `mermaid` (マインドマップ生成)
  - [ ] `uuid` (ジョブID生成)
- [ ] 環境変数の設定 (.env)
  - [ ] `OPENAI_API_KEY`
  - [ ] `OUTPUT_DIR`
  - [ ] `DEFAULT_VIDEO_STYLE`
  - [ ] `DEFAULT_VOICE_ID`
- [ ] 出力ディレクトリの作成 (`./outputs`)

### 2. バックエンド開発

#### 2.1 PDF解析モジュール
- [ ] `server/services/pdfParser.ts` 作成
  - [ ] PDFからテキスト抽出機能
  - [ ] PDFから画像抽出機能
  - [ ] テキストのチャンク分割機能（意味単位）
  - [ ] エラーハンドリング

#### 2.2 コンテンツリライトサービス
- [ ] `server/services/rewriter.ts` 作成
  - [ ] OpenAI GPT-4 API連携
  - [ ] 年齢グループ別リライトロジック
    - [ ] `preschool` (幼児向け: ひらがな中心)
    - [ ] `elementary_lower` (小学校低学年)
    - [ ] `elementary_upper` (小学校高学年)
    - [ ] `adult` (大人・保育者向け)
  - [ ] 興味関心に基づく具体例生成
  - [ ] リライトプロンプトの実装

#### 2.3 クイズ生成サービス
- [ ] `server/services/quizGenerator.ts` 作成
  - [ ] 選択式問題生成
  - [ ] 穴埋め問題生成
  - [ ] 難易度調整（年齢別）
  - [ ] JSON形式での出力

#### 2.4 マインドマップ生成サービス
- [ ] `server/services/mindmapGenerator.ts` 作成
  - [ ] Mermaid.js形式でのマインドマップ生成
  - [ ] SVG/PNG出力

#### 2.5 MulmoScript生成サービス
- [ ] `server/services/mulmoScriptGenerator.ts` 作成
  - [ ] リライト済みテキストからMulmoScript JSON生成
  - [ ] スピーカー設定（せんせい）
  - [ ] 画像プロンプト自動生成
  - [ ] キャンバスサイズ設定

#### 2.6 APIエンドポイント
- [ ] `server/routes/transform.ts` 作成
  - [ ] `POST /api/v1/transform` - 教材変換ジョブ作成
  - [ ] `GET /api/v1/jobs/:jobId` - ジョブ状態取得
  - [ ] `GET /api/v1/jobs/:jobId/outputs` - 生成ファイル一覧
  - [ ] `DELETE /api/v1/jobs/:jobId` - ジョブキャンセル
- [ ] `server/routes/profiles.ts` 作成
  - [ ] `POST /api/v1/profiles` - プロファイル登録
  - [ ] `GET /api/v1/profiles/:profileId` - プロファイル取得
- [ ] ファイルアップロード処理（multer）
- [ ] バリデーション（学習者プロファイル）

#### 2.7 ジョブ管理
- [ ] `server/services/jobManager.ts` 作成
  - [ ] ジョブキュー管理（インメモリ/簡易実装）
  - [ ] ジョブ状態管理（pending/processing/completed/failed）
  - [ ] 進捗トラッキング

### 3. フロントエンド開発

#### 3.1 プラグイン本体
- [ ] `src/tools/learnYourWay.ts` 作成
  - [ ] ToolPlugin インターフェース実装
  - [ ] ツール定義（パラメータ）
  - [ ] execute関数実装
  - [ ] 結果フォーマット定義

#### 3.2 メインビュー
- [ ] `src/tools/views/LearnYourWayView.vue` 作成
  - [ ] PDFアップロードUI
  - [ ] 学習者プロファイル設定フォーム
    - [ ] 年齢グループ選択
    - [ ] 興味関心選択（複数選択）
    - [ ] 学習スタイル選択
    - [ ] 出力形式選択（複数選択）
  - [ ] オプション設定
    - [ ] 動画スタイル選択
    - [ ] 音声選択
    - [ ] クイズ問題数
  - [ ] 変換開始ボタン
  - [ ] 進捗表示
  - [ ] 結果表示
    - [ ] リライトテキストプレビュー
    - [ ] 動画プレビュー/ダウンロード
    - [ ] 音声プレイヤー/ダウンロード
    - [ ] クイズプレビュー
    - [ ] マインドマップ表示

#### 3.3 サイドバープレビュー
- [ ] `src/tools/previews/LearnYourWayPreview.vue` 作成
  - [ ] サムネイル表示
  - [ ] ステータス表示
  - [ ] 簡易情報表示

#### 3.4 プラグイン登録
- [ ] `src/tools/index.ts` にLearn Your Wayプラグイン追加
- [ ] App.vueでのルーティング追加

### 4. MulmoCast連携

- [ ] MulmoScriptからの動画生成連携
  - [ ] `mulmo movie` コマンド実行
  - [ ] 出力ファイルパス管理
- [ ] 音声のみ生成
  - [ ] `mulmo audio` コマンド実行
- [ ] 画像生成連携
  - [ ] DALL-E 3 API連携
  - [ ] 画像プロンプト最適化

### 5. テスト

- [ ] PDF解析テスト
  - [ ] サンプルPDFでのテキスト抽出確認
- [ ] リライトテスト
  - [ ] 各年齢グループでの出力確認
  - [ ] 各興味関心での具体例確認
- [ ] クイズ生成テスト
  - [ ] 問題形式の確認
  - [ ] 難易度の確認
- [ ] MulmoCast連携テスト
  - [ ] MulmoScript生成確認
  - [ ] 動画/音声生成確認
- [ ] E2Eテスト
  - [ ] PDF→動画の一気通貫テスト

---

## Phase 2: パイロット実証

### 6. 教材準備
- [ ] 実験用教材の選定（パターン認識テーマ）
- [ ] 教材PDFの作成/収集
- [ ] テスト用学習者プロファイルの作成

### 7. システム調整
- [ ] ユーザーフィードバック収集機能
- [ ] プロンプト最適化
- [ ] 出力品質の改善

### 8. 実証実験
- [ ] 保育者研修での試用（実験A）
- [ ] 幼児向け教材の試用（実験B）
- [ ] データ収集・記録

---

## Phase 3: 分析・改善

### 9. データ分析
- [ ] 学習効果データの統計分析
- [ ] ユーザビリティ分析

### 10. システム改善
- [ ] フィードバックに基づく機能追加
- [ ] バグ修正
- [ ] パフォーマンス最適化

### 11. ドキュメント整備
- [ ] 利用ガイド作成
- [ ] API仕様書更新
- [ ] 開発者向けドキュメント

---

## 優先度・依存関係

```
環境構築
    ↓
PDF解析モジュール → リライトサービス → MulmoScript生成
                  ↓
              クイズ生成
                  ↓
              マインドマップ生成
    ↓
APIエンドポイント
    ↓
フロントエンドUI
    ↓
MulmoCast連携
    ↓
テスト
```

---

## 技術的注意事項

1. **PDF解析**: 日本語PDFの文字化け対策が必要
2. **リライト**: トークン制限に注意、長文は分割処理
3. **MulmoCast**: FFmpegのインストールが必要
4. **画像生成**: DALL-E 3のレート制限に注意
5. **非同期処理**: 動画生成は時間がかかるためジョブキュー必須

---

## 参考コマンド

```bash
# 開発サーバー起動
npm run dev

# PDF解析テスト
npm run test:pdf

# MulmoCast動画生成
npx mulmo movie script.json -c ja

# MulmoCast音声生成
npx mulmo audio script.json -l ja
```

---

最終更新: 2024年12月
