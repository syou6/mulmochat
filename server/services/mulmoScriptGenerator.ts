import OpenAI from 'openai';
import type { AgeGroup } from './rewriter';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type VideoStyle = 'ghibli' | 'anime' | 'realistic' | 'watercolor';
export type VoiceId = 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer';

export interface MulmoScriptBeat {
  speaker: string;
  text: string;
  imagePrompt?: string;
}

export interface MulmoScript {
  $mulmocast: { version: string };
  canvasSize: { width: number; height: number };
  speechParams: {
    provider: string;
    speakers: Record<
      string,
      {
        displayName: { ja: string };
        voiceId: string;
        speechOptions?: {
          instruction?: string;
          speed?: number;
        };
      }
    >;
  };
  imageParams: {
    style: string;
    provider: string;
  };
  lang: string;
  beats: MulmoScriptBeat[];
}

export interface MulmoScriptOptions {
  ageGroup: AgeGroup;
  videoStyle?: VideoStyle;
  voiceId?: VoiceId;
}

// 動画スタイル別の画像プロンプトスタイル
const VIDEO_STYLE_CONFIG: Record<VideoStyle, string> = {
  ghibli: 'やさしい水彩画風、パステルカラー、丸みのある形、スタジオジブリ風',
  anime: '明るいアニメ風、鮮やかな色彩、かわいいキャラクター',
  realistic: '写実的なイラスト、自然な色合い、詳細な描写',
  watercolor: 'やわらかい水彩画、淡い色彩、絵本のような雰囲気',
};

// 年齢グループ別のスピーカー設定
const SPEAKER_CONFIG: Record<
  AgeGroup,
  { displayName: string; instruction: string; speed: number }
> = {
  preschool: {
    displayName: 'せんせい',
    instruction: '優しく語りかけるように、ゆっくり話してください。幼児が理解しやすいペースで。',
    speed: 0.85,
  },
  elementary_lower: {
    displayName: '先生',
    instruction: 'はっきりと、ゆっくりめに話してください。小学校低学年向けです。',
    speed: 0.9,
  },
  elementary_upper: {
    displayName: '先生',
    instruction: '明確に、適度なペースで話してください。小学校高学年向けです。',
    speed: 0.95,
  },
  adult: {
    displayName: 'ナレーター',
    instruction: 'プロフェッショナルなトーンで、明確に話してください。',
    speed: 1.0,
  },
};

/**
 * リライト済みテキストからMulmoScriptを生成する
 */
export async function generateMulmoScript(
  rewrittenText: string,
  options: MulmoScriptOptions
): Promise<MulmoScript> {
  const {
    ageGroup,
    videoStyle = 'ghibli',
    voiceId = 'nova',
  } = options;

  const speakerConfig = SPEAKER_CONFIG[ageGroup];
  const styleConfig = VIDEO_STYLE_CONFIG[videoStyle];

  // テキストをビート（セクション）に分割
  const beats = await generateBeats(rewrittenText, styleConfig, ageGroup);

  const script: MulmoScript = {
    $mulmocast: { version: '1.0' },
    canvasSize: { width: 1280, height: 720 },
    speechParams: {
      provider: 'openai',
      speakers: {
        Narrator: {
          displayName: { ja: speakerConfig.displayName },
          voiceId,
          speechOptions: {
            instruction: speakerConfig.instruction,
            speed: speakerConfig.speed,
          },
        },
      },
    },
    imageParams: {
      style: styleConfig,
      provider: 'openai',
    },
    lang: 'ja',
    beats,
  };

  return script;
}

/**
 * テキストからビートを生成する
 */
async function generateBeats(
  text: string,
  imageStyle: string,
  ageGroup: AgeGroup
): Promise<MulmoScriptBeat[]> {
  const systemPrompt = `あなたは教育動画の構成の専門家です。
以下のテキストを、ナレーション付き動画のシーンに分割してください。

## ルール
1. 各シーンは1〜3文程度
2. 各シーンに適切な画像プロンプトを生成
3. 画像プロンプトは${imageStyle}のスタイルで
4. 対象年齢は${ageGroup}

## 出力形式
以下のJSON形式で出力してください：
{
  "beats": [
    {
      "speaker": "Narrator",
      "text": "ナレーションテキスト",
      "imagePrompt": "シーンを表現する画像プロンプト（英語）"
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `以下のテキストをビートに分割してください:\n\n${text}` },
    ],
    temperature: 0.7,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const responseText = response.choices[0]?.message?.content || '{}';

  try {
    const data = JSON.parse(responseText);
    return data.beats || [];
  } catch {
    console.error('Failed to parse beats response:', responseText);
    // フォールバック: テキストを段落で分割
    return text
      .split(/\n\n+/)
      .filter((p) => p.trim())
      .map((paragraph) => ({
        speaker: 'Narrator',
        text: paragraph.trim(),
        imagePrompt: `Educational illustration for children, ${imageStyle}`,
      }));
  }
}

/**
 * MulmoScriptをJSON形式でエクスポート
 */
export function exportMulmoScriptAsJson(script: MulmoScript): string {
  return JSON.stringify(script, null, 2);
}

/**
 * MulmoScriptをファイルに保存
 */
export async function saveMulmoScript(
  script: MulmoScript,
  outputPath: string
): Promise<void> {
  const fs = await import('fs');
  fs.writeFileSync(outputPath, exportMulmoScriptAsJson(script));
}
