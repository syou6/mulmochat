import OpenAI from 'openai';
import type { AgeGroup } from './rewriter';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type QuizType = 'multiple_choice' | 'fill_blank' | 'true_false';

export interface QuizQuestion {
  id: string;
  type: QuizType;
  question: string;
  options?: string[]; // 選択肢（multiple_choice用）
  correctAnswer: string | number; // 正解（indexまたはテキスト）
  explanation: string; // 解説
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface QuizSet {
  title: string;
  description: string;
  questions: QuizQuestion[];
  ageGroup: AgeGroup;
  totalQuestions: number;
}

export interface QuizOptions {
  ageGroup: AgeGroup;
  count: number;
  types?: QuizType[];
}

// 年齢グループ別のクイズ設定
const QUIZ_CONFIG: Record<AgeGroup, { maxOptions: number; instructions: string }> = {
  preschool: {
    maxOptions: 3,
    instructions: `
- ひらがなのみを使用
- 選択肢は3つまで
- 絵文字や記号を活用して視覚的に
- 「どっちかな？」「さがしてみよう」などのやさしい問いかけ
- すべて「やさしい」難易度で作成`,
  },
  elementary_lower: {
    maxOptions: 4,
    instructions: `
- 小学校低学年で習う漢字のみ（ふりがな付き）
- 選択肢は4つまで
- 日常生活に関連した問題
- 「やさしい」〜「ふつう」の難易度で作成`,
  },
  elementary_upper: {
    maxOptions: 4,
    instructions: `
- 小学校で習う漢字を使用可能
- 選択肢は4つ
- 論理的思考を促す問題を含める
- 「やさしい」〜「むずかしい」の難易度で作成`,
  },
  adult: {
    maxOptions: 4,
    instructions: `
- 専門用語を適切に使用
- 実践的な応用問題を含める
- 「ふつう」〜「むずかしい」の難易度で作成`,
  },
};

/**
 * コンテンツからクイズを生成する
 */
export async function generateQuiz(
  content: string,
  options: QuizOptions
): Promise<QuizSet> {
  const { ageGroup, count, types = ['multiple_choice', 'fill_blank'] } = options;
  const config = QUIZ_CONFIG[ageGroup];

  const systemPrompt = `あなたは教育クイズの専門家です。
以下のコンテンツに基づいて、理解度確認のためのクイズを作成してください。

## 対象年齢: ${ageGroup}

## クイズ作成ルール
${config.instructions}

## 出力形式
以下のJSON形式で出力してください：
{
  "title": "クイズのタイトル",
  "description": "クイズの説明",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "question": "問題文",
      "options": ["選択肢1", "選択肢2", "選択肢3"],
      "correctAnswer": 0,
      "explanation": "解説文",
      "difficulty": "easy"
    }
  ]
}

## 問題タイプ
- multiple_choice: 選択問題
- fill_blank: 穴埋め問題（correctAnswerに正解の単語を入れる）
- true_false: ○×問題（options: ["○", "×"]）

${count}問作成してください。問題タイプ: ${types.join(', ')}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `以下のコンテンツからクイズを作成してください:\n\n${content}` },
    ],
    temperature: 0.7,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const responseText = response.choices[0]?.message?.content || '{}';

  try {
    const quizData = JSON.parse(responseText);

    return {
      title: quizData.title || 'クイズ',
      description: quizData.description || '',
      questions: quizData.questions || [],
      ageGroup,
      totalQuestions: quizData.questions?.length || 0,
    };
  } catch {
    console.error('Failed to parse quiz response:', responseText);
    return {
      title: 'クイズ',
      description: '',
      questions: [],
      ageGroup,
      totalQuestions: 0,
    };
  }
}

/**
 * クイズをJSON形式でエクスポート
 */
export function exportQuizAsJson(quiz: QuizSet): string {
  return JSON.stringify(quiz, null, 2);
}

/**
 * クイズの正解率を計算
 */
export function calculateScore(
  quiz: QuizSet,
  answers: (string | number)[]
): { score: number; total: number; percentage: number } {
  let correct = 0;
  const total = quiz.questions.length;

  quiz.questions.forEach((question, index) => {
    if (answers[index] === question.correctAnswer) {
      correct++;
    }
  });

  return {
    score: correct,
    total,
    percentage: Math.round((correct / total) * 100),
  };
}
