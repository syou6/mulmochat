"""
LangChain-powered Quiz Generator Service
学習者プロファイルとBKT習熟度に基づいた適応的クイズ生成
"""

import os
from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

from models.schemas import AgeGroup, LearnerProfile
from services.bkt_service import bkt_service


# ==================== Pydantic Models for Structured Output ====================

class QuizQuestion(BaseModel):
    """クイズ問題の構造"""
    id: str = Field(description="問題ID (例: q1, q2)")
    type: Literal["multiple_choice", "fill_blank", "true_false"] = Field(
        description="問題タイプ"
    )
    question: str = Field(description="問題文")
    options: Optional[List[str]] = Field(
        default=None,
        description="選択肢 (multiple_choice, true_falseの場合)"
    )
    correct_answer: str | int = Field(
        description="正解 (選択肢のインデックスまたはテキスト)"
    )
    explanation: str = Field(description="解説文")
    difficulty: Literal["easy", "medium", "hard"] = Field(description="難易度")
    skill_id: Optional[str] = Field(
        default=None,
        description="関連するスキルID (BKT追跡用)"
    )
    hints: Optional[List[str]] = Field(
        default=None,
        description="段階的ヒント (最大3つ)"
    )


class QuizSet(BaseModel):
    """クイズセット全体の構造"""
    title: str = Field(description="クイズのタイトル")
    description: str = Field(description="クイズの説明")
    questions: List[QuizQuestion] = Field(description="問題リスト")
    target_skills: List[str] = Field(
        default_factory=list,
        description="このクイズで評価するスキルID一覧"
    )


class QuizGenerationRequest(BaseModel):
    """クイズ生成リクエスト"""
    content: str = Field(description="クイズの元となるコンテンツ")
    learner_id: Optional[str] = Field(default=None, description="学習者ID")
    age_group: AgeGroup = Field(default=AgeGroup.PRESCHOOL, description="年齢グループ")
    interests: List[str] = Field(default_factory=list, description="興味関心")
    count: int = Field(default=5, ge=1, le=20, description="問題数")
    types: List[str] = Field(
        default_factory=lambda: ["multiple_choice"],
        description="問題タイプ"
    )
    include_hints: bool = Field(default=True, description="ヒントを含めるか")
    adapt_difficulty: bool = Field(default=True, description="習熟度に応じて難易度調整")


class QuizGenerationResponse(BaseModel):
    """クイズ生成レスポンス"""
    quiz: QuizSet
    generation_time: datetime
    adapted_for_learner: bool
    difficulty_distribution: dict


# ==================== Age-specific Configuration ====================

AGE_CONFIG = {
    AgeGroup.PRESCHOOL: {
        "max_options": 3,
        "language_rules": """
- ひらがなのみを使用してください
- 1文は15文字以内
- 絵文字を適度に使用 (例: 🍎🚗🐕)
- 「どっちかな？」「みつけてね！」などやさしい問いかけ
""",
        "default_difficulty": "easy",
        "allowed_difficulties": ["easy"],
    },
    AgeGroup.ELEMENTARY_LOWER: {
        "max_options": 4,
        "language_rules": """
- 小学校低学年で習う漢字のみ（ふりがな付き）
- 日常生活に関連した具体例を使用
- わかりやすい言葉で説明
""",
        "default_difficulty": "easy",
        "allowed_difficulties": ["easy", "medium"],
    },
    AgeGroup.ELEMENTARY_UPPER: {
        "max_options": 4,
        "language_rules": """
- 小学校で習う漢字を使用可能
- 論理的思考を促す問題を含める
- 応用的な問題も出題可能
""",
        "default_difficulty": "medium",
        "allowed_difficulties": ["easy", "medium", "hard"],
    },
    AgeGroup.ADULT: {
        "max_options": 4,
        "language_rules": """
- 専門用語を適切に使用
- 実践的な応用問題を含める
- 深い理解を問う問題
""",
        "default_difficulty": "medium",
        "allowed_difficulties": ["medium", "hard"],
    },
}

# 興味関心別の例示マッピング
INTEREST_EXAMPLES = {
    "vehicles": "車、電車、飛行機、バスなど乗り物",
    "animals": "犬、猫、うさぎ、ライオンなど動物",
    "food": "りんご、カレー、アイスクリームなど食べ物",
    "sports": "サッカー、野球、水泳などスポーツ",
    "music": "ピアノ、歌、リズムなど音楽",
    "nature": "花、木、空、海など自然",
    "space": "星、月、ロケットなど宇宙",
}


# ==================== Quiz Generator Service ====================

class QuizGeneratorService:
    """LangChainを使用したクイズ生成サービス"""

    def __init__(self, model_name: str = "gpt-4o"):
        self.llm = ChatOpenAI(
            model=model_name,
            temperature=0.7,
            api_key=os.getenv("OPENAI_API_KEY"),
        )
        self.parser = PydanticOutputParser(pydantic_object=QuizSet)

    def _get_difficulty_for_learner(
        self,
        learner_id: str,
        skill_ids: List[str],
        age_group: AgeGroup
    ) -> str:
        """
        学習者の習熟度に基づいて適切な難易度を決定
        """
        config = AGE_CONFIG[age_group]
        allowed = config["allowed_difficulties"]

        if not skill_ids:
            return config["default_difficulty"]

        # 全スキルの平均習熟度を計算
        masteries = []
        for skill_id in skill_ids:
            mastery = bkt_service.get_mastery(learner_id, skill_id)
            masteries.append(mastery)

        avg_mastery = sum(masteries) / len(masteries) if masteries else 0.5

        # 習熟度に応じた難易度選択
        if avg_mastery < 0.4:
            target = "easy"
        elif avg_mastery < 0.7:
            target = "medium"
        else:
            target = "hard"

        # 年齢グループで許可された難易度に制限
        if target in allowed:
            return target
        elif target == "hard" and "medium" in allowed:
            return "medium"
        elif target == "medium" and "easy" in allowed:
            return "easy"

        return allowed[0]

    def _build_interest_context(self, interests: List[str]) -> str:
        """興味関心に基づくコンテキスト文を生成"""
        if not interests:
            return ""

        examples = []
        for interest in interests:
            if interest in INTEREST_EXAMPLES:
                examples.append(INTEREST_EXAMPLES[interest])

        if examples:
            return f"\n\n## 興味関心に合わせた例示\n問題文や選択肢には、以下に関連する例を使ってください：\n- " + "\n- ".join(examples)

        return ""

    async def generate_quiz(
        self,
        request: QuizGenerationRequest
    ) -> QuizGenerationResponse:
        """
        LangChainを使用してクイズを生成
        """
        age_config = AGE_CONFIG[request.age_group]

        # 難易度決定
        if request.adapt_difficulty and request.learner_id:
            # スキルIDを抽出（コンテンツから推測するか、デフォルトを使用）
            skill_ids = ["general_understanding"]  # 簡易実装
            target_difficulty = self._get_difficulty_for_learner(
                request.learner_id,
                skill_ids,
                request.age_group
            )
            adapted = True
        else:
            target_difficulty = age_config["default_difficulty"]
            adapted = False

        # 興味関心コンテキスト
        interest_context = self._build_interest_context(request.interests)

        # ヒント指示
        hint_instruction = ""
        if request.include_hints:
            hint_instruction = """
## ヒント生成
各問題には段階的なヒントを3つ含めてください：
1. 最初のヒント: 考え方の方向性を示す軽いヒント
2. 2番目のヒント: より具体的な手がかり
3. 3番目のヒント: ほぼ答えに近いヒント
"""

        # プロンプトテンプレート
        prompt = ChatPromptTemplate.from_messages([
            ("system", """あなたは幼児教育・初等教育の専門家です。
学習者に最適化されたクイズを作成してください。

## 対象年齢: {age_group}
## 目標難易度: {difficulty}
## 問題数: {count}問
## 問題タイプ: {types}

## 言語・表現ルール
{language_rules}
{interest_context}
{hint_instruction}

## 出力形式
{format_instructions}

必ず指定された形式で出力してください。"""),
            ("user", "以下のコンテンツからクイズを作成してください:\n\n{content}")
        ])

        # チェーン実行
        chain = prompt | self.llm | self.parser

        quiz = await chain.ainvoke({
            "age_group": request.age_group.value,
            "difficulty": target_difficulty,
            "count": request.count,
            "types": ", ".join(request.types),
            "language_rules": age_config["language_rules"],
            "interest_context": interest_context,
            "hint_instruction": hint_instruction,
            "format_instructions": self.parser.get_format_instructions(),
            "content": request.content,
        })

        # 難易度分布を計算
        difficulty_counts = {"easy": 0, "medium": 0, "hard": 0}
        for q in quiz.questions:
            difficulty_counts[q.difficulty] += 1

        return QuizGenerationResponse(
            quiz=quiz,
            generation_time=datetime.utcnow(),
            adapted_for_learner=adapted,
            difficulty_distribution=difficulty_counts,
        )

    async def generate_hints(
        self,
        question: str,
        correct_answer: str,
        age_group: AgeGroup
    ) -> List[str]:
        """
        問題に対する段階的ヒントを生成
        """
        age_config = AGE_CONFIG[age_group]

        prompt = ChatPromptTemplate.from_messages([
            ("system", """あなたは教育の専門家です。
以下の問題に対して、段階的なヒントを3つ作成してください。

## 対象年齢: {age_group}
## 言語ルール
{language_rules}

ヒントは以下の形式で出力してください：
1. [軽いヒント]
2. [具体的なヒント]
3. [答えに近いヒント]"""),
            ("user", "問題: {question}\n正解: {answer}")
        ])

        chain = prompt | self.llm

        response = await chain.ainvoke({
            "age_group": age_group.value,
            "language_rules": age_config["language_rules"],
            "question": question,
            "answer": correct_answer,
        })

        # レスポンスからヒントを抽出
        hints = []
        lines = response.content.split("\n")
        for line in lines:
            line = line.strip()
            if line and (line.startswith("1.") or line.startswith("2.") or line.startswith("3.")):
                # 番号を除去
                hint = line[2:].strip().strip("[]")
                hints.append(hint)

        return hints[:3]  # 最大3つ


# シングルトンインスタンス
quiz_generator = QuizGeneratorService()
