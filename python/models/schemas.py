from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


# ==================== Learner Profile ====================

class AgeGroup(str, Enum):
    PRESCHOOL = "preschool"
    ELEMENTARY_LOWER = "elementary_lower"
    ELEMENTARY_UPPER = "elementary_upper"
    ADULT = "adult"


class LearnerProfile(BaseModel):
    """学習者プロファイル"""
    learner_id: str
    age_group: AgeGroup = AgeGroup.PRESCHOOL
    interests: List[str] = Field(default_factory=lambda: ["animals"])
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ==================== BKT (Bayesian Knowledge Tracing) ====================

class SkillResponse(BaseModel):
    """スキルへの回答記録"""
    learner_id: str
    skill_id: str
    correct: bool  # True = 正解, False = 不正解
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    response_time_ms: Optional[int] = None  # 回答時間（ミリ秒）


class BKTParameters(BaseModel):
    """BKTモデルのパラメータ（幼児教育向けにチューニング済み）"""
    # P(L0): 事前知識確率 - 幼児は新規スキルが多いため低め
    prior: float = Field(default=0.1, ge=0, le=1, description="初期習得確率 P(L0)")
    # P(T): 学習率 - 幼児は習得が速いため高め
    learn: float = Field(default=0.3, ge=0, le=1, description="学習確率 P(T)")
    # P(G): 推測率 - 選択肢が少ない問題が多いため高め
    guess: float = Field(default=0.25, ge=0, le=1, description="推測確率 P(G)")
    # P(S): スリップ率 - 注意力の変動が大きいため高め
    slip: float = Field(default=0.15, ge=0, le=1, description="スリップ確率 P(S)")
    # P(F): 忘却率（拡張BKT用）
    forget: float = Field(default=0.05, ge=0, le=1, description="忘却確率 P(F)")


class BKTPrediction(BaseModel):
    """BKTによる習熟度予測結果"""
    learner_id: str
    skill_id: str
    mastery_probability: float = Field(ge=0, le=1, description="習熟確率 P(L)")
    is_mastered: bool = Field(description="習熟判定（閾値: 0.95）")
    confidence: float = Field(ge=0, le=1, description="予測の信頼度")
    recommendation: str = Field(description="次の学習推奨")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BKTBatchRequest(BaseModel):
    """複数回答のバッチ処理リクエスト"""
    responses: List[SkillResponse]
    parameters: Optional[BKTParameters] = None


class BKTBatchResponse(BaseModel):
    """バッチ処理レスポンス"""
    predictions: Dict[str, BKTPrediction]  # skill_id -> prediction
    overall_mastery: float = Field(description="全体的な習熟度")


# ==================== FSRS (Free Spaced Repetition Scheduler) ====================

class FSRSRating(int, Enum):
    """FSRSの評価レーティング"""
    AGAIN = 1  # 完全に忘れた
    HARD = 2   # 思い出すのに苦労した
    GOOD = 3   # 正しく思い出せた
    EASY = 4   # 簡単に思い出せた


class FSRSCard(BaseModel):
    """FSRSカード（学習アイテム）"""
    card_id: str
    learner_id: str
    content_id: str  # クイズや教材のID
    content_type: str = "quiz"  # quiz, flashcard, concept

    # FSRS状態
    difficulty: float = Field(default=0.0, description="難易度 D")
    stability: float = Field(default=0.0, description="安定性 S")
    retrievability: float = Field(default=1.0, ge=0, le=1, description="想起可能性 R")

    # スケジュール情報
    due_date: datetime = Field(default_factory=datetime.utcnow)
    last_review: Optional[datetime] = None
    review_count: int = 0
    lapses: int = 0  # 忘却回数

    created_at: datetime = Field(default_factory=datetime.utcnow)


class FSRSReviewLog(BaseModel):
    """FSRSレビュー記録"""
    card_id: str
    learner_id: str
    rating: FSRSRating
    review_time: datetime = Field(default_factory=datetime.utcnow)
    response_time_ms: Optional[int] = None


class FSRSScheduleResult(BaseModel):
    """FSRSスケジューリング結果"""
    card_id: str
    next_review: datetime
    interval_days: float
    new_difficulty: float
    new_stability: float
    estimated_retrievability: float
    recommendation: str


class FSRSDueCards(BaseModel):
    """復習が必要なカード一覧"""
    learner_id: str
    due_cards: List[FSRSCard]
    total_due: int
    next_review_time: Optional[datetime] = None


# ==================== Combined Learning State ====================

class LearningState(BaseModel):
    """学習者の総合的な学習状態"""
    learner_id: str
    profile: LearnerProfile

    # BKT: スキル別習熟度
    skill_masteries: Dict[str, BKTPrediction] = Field(default_factory=dict)
    overall_mastery: float = 0.0

    # FSRS: 復習スケジュール
    due_reviews: int = 0
    next_review: Optional[datetime] = None

    # 統計
    total_responses: int = 0
    correct_rate: float = 0.0
    streak_days: int = 0

    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ==================== API Response ====================

class HealthResponse(BaseModel):
    """ヘルスチェックレスポンス"""
    status: str = "ok"
    version: str = "1.0.0"
    services: Dict[str, bool] = Field(default_factory=dict)
