"""
まなびのカタチ - Python FastAPI Server
教育AI機能（BKT, FSRS, LangChain）を提供
"""

import sys
from pathlib import Path

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from datetime import datetime

from models.schemas import (
    HealthResponse,
    SkillResponse,
    BKTParameters,
    BKTPrediction,
    BKTBatchRequest,
    BKTBatchResponse,
    FSRSCard,
    FSRSReviewLog,
    FSRSScheduleResult,
    FSRSDueCards,
    FSRSRating,
    LearningState,
    LearnerProfile,
    AgeGroup,
)
from services.bkt_service import bkt_service
from services.fsrs_service import fsrs_service
from services.quiz_generator import (
    quiz_generator,
    QuizGenerationRequest,
    QuizGenerationResponse,
    QuizQuestion,
)


# FastAPI アプリケーション
app = FastAPI(
    title="まなびのカタチ - Education AI API",
    description="幼児教育向けAI個別最適化学習システム",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Health Check ====================

@app.get("/", response_model=HealthResponse)
async def root():
    """ヘルスチェック"""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        services={
            "bkt": True,
            "fsrs": True,
        }
    )


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """詳細ヘルスチェック"""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        services={
            "bkt": True,
            "fsrs": fsrs_service.fsrs is not None,
        }
    )


# ==================== BKT Endpoints ====================

@app.post("/api/v1/bkt/update", response_model=BKTPrediction)
async def bkt_update(response: SkillResponse, params: Optional[BKTParameters] = None):
    """
    BKT状態を更新（1回の回答）

    - **response**: 学習者の回答情報
    - **params**: BKTパラメータ（省略時はデフォルト値使用）
    """
    try:
        prediction = bkt_service.update(response, params)
        return prediction
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/bkt/batch", response_model=BKTBatchResponse)
async def bkt_batch_update(request: BKTBatchRequest):
    """
    BKT状態をバッチ更新（複数の回答）
    """
    try:
        result = bkt_service.batch_update(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/bkt/mastery/{learner_id}/{skill_id}")
async def get_mastery(learner_id: str, skill_id: str):
    """
    特定スキルの習熟度を取得
    """
    mastery = bkt_service.get_mastery(learner_id, skill_id)
    return {
        "learner_id": learner_id,
        "skill_id": skill_id,
        "mastery_probability": mastery,
        "is_mastered": mastery >= bkt_service.MASTERY_THRESHOLD,
    }


@app.get("/api/v1/bkt/learner/{learner_id}")
async def get_learner_state(learner_id: str):
    """
    学習者の全スキル状態を取得
    """
    state = bkt_service.get_learner_state(learner_id)
    return {
        "learner_id": learner_id,
        "skills": state,
        "total_skills": len(state),
        "mastered_skills": sum(1 for p in state.values() if p.is_mastered),
    }


@app.post("/api/v1/bkt/recommend/{learner_id}")
async def recommend_skill(learner_id: str, available_skills: List[str]):
    """
    次に学習すべきスキルを推薦
    """
    recommended = bkt_service.recommend_next_skill(learner_id, available_skills)
    return {
        "learner_id": learner_id,
        "recommended_skill": recommended,
        "all_mastered": recommended is None,
    }


# ==================== FSRS Endpoints ====================

@app.post("/api/v1/fsrs/cards", response_model=FSRSCard)
async def create_card(learner_id: str, content_id: str, content_type: str = "quiz"):
    """
    新しい学習カードを作成
    """
    card = fsrs_service.create_card(learner_id, content_id, content_type)
    return card


@app.get("/api/v1/fsrs/cards/{card_id}", response_model=FSRSCard)
async def get_card(card_id: str):
    """
    カードを取得
    """
    card = fsrs_service.get_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@app.post("/api/v1/fsrs/review/{card_id}", response_model=FSRSScheduleResult)
async def review_card(card_id: str, rating: int):
    """
    カードをレビューして次回復習日を計算

    - **rating**: 1=AGAIN, 2=HARD, 3=GOOD, 4=EASY
    """
    try:
        fsrs_rating = FSRSRating(rating)
    except ValueError:
        raise HTTPException(status_code=400, detail="Rating must be 1-4")

    try:
        result = fsrs_service.review(card_id, fsrs_rating)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/v1/fsrs/due/{learner_id}", response_model=FSRSDueCards)
async def get_due_cards(learner_id: str, limit: int = 20):
    """
    復習が必要なカードを取得
    """
    due_cards = fsrs_service.get_due_cards(learner_id, limit)
    return due_cards


@app.get("/api/v1/fsrs/learner/{learner_id}/cards")
async def get_learner_cards(learner_id: str):
    """
    学習者の全カードを取得
    """
    cards = fsrs_service.get_learner_cards(learner_id)
    return {"learner_id": learner_id, "cards": cards, "total": len(cards)}


@app.get("/api/v1/fsrs/learner/{learner_id}/stats")
async def get_learner_stats(learner_id: str):
    """
    学習統計を取得
    """
    stats = fsrs_service.get_statistics(learner_id)
    return {"learner_id": learner_id, **stats}


# ==================== Quiz Generation Endpoints (LangChain) ====================

@app.post("/api/v1/quiz/generate", response_model=QuizGenerationResponse)
async def generate_quiz(request: QuizGenerationRequest):
    """
    LangChainを使用してクイズを生成

    - **content**: クイズの元となるコンテンツ
    - **learner_id**: 学習者ID（難易度調整用）
    - **age_group**: 年齢グループ（preschool, elementary_lower, elementary_upper, adult）
    - **interests**: 興味関心リスト（vehicles, animals, food, sports, music, nature, space）
    - **count**: 問題数（1-20）
    - **types**: 問題タイプ（multiple_choice, fill_blank, true_false）
    - **include_hints**: ヒントを含めるか
    - **adapt_difficulty**: 習熟度に応じた難易度調整を行うか
    """
    try:
        result = await quiz_generator.generate_quiz(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/quiz/hints")
async def generate_hints(
    question: str,
    correct_answer: str,
    age_group: AgeGroup = AgeGroup.PRESCHOOL
):
    """
    問題に対する段階的ヒントを生成
    """
    try:
        hints = await quiz_generator.generate_hints(question, correct_answer, age_group)
        return {"hints": hints}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/quiz/answer")
async def submit_answer(
    learner_id: str,
    question_id: str,
    skill_id: str,
    is_correct: bool
):
    """
    クイズの回答を送信し、BKTを更新

    回答結果をBKTサービスに送信してスキル習熟度を更新します。
    """
    from models.schemas import SkillResponse

    response = SkillResponse(
        learner_id=learner_id,
        skill_id=skill_id,
        correct=is_correct,
    )

    prediction = bkt_service.update(response)

    return {
        "question_id": question_id,
        "is_correct": is_correct,
        "new_mastery": prediction.mastery_probability,
        "is_mastered": prediction.is_mastered,
        "message": "よくできました！" if is_correct else "もういちどがんばろう！",
    }


# ==================== Combined Learning State ====================

@app.get("/api/v1/learning/{learner_id}", response_model=LearningState)
async def get_learning_state(learner_id: str):
    """
    学習者の総合的な学習状態を取得
    """
    # BKT状態
    skill_masteries = bkt_service.get_learner_state(learner_id)
    overall_mastery = (
        sum(p.mastery_probability for p in skill_masteries.values()) / len(skill_masteries)
        if skill_masteries else 0.0
    )

    # FSRS状態
    due_cards = fsrs_service.get_due_cards(learner_id)

    # プロファイル（簡易実装）
    profile = LearnerProfile(
        learner_id=learner_id,
        age_group=AgeGroup.PRESCHOOL,
        interests=["animals"],
    )

    return LearningState(
        learner_id=learner_id,
        profile=profile,
        skill_masteries=skill_masteries,
        overall_mastery=overall_mastery,
        due_reviews=due_cards.total_due,
        next_review=due_cards.next_review_time,
    )


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
