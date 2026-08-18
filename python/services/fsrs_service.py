"""
FSRS (Free Spaced Repetition Scheduler) Service
py-fsrsを使用した復習スケジューリングサービス
"""

from typing import Dict, List, Optional
from datetime import datetime, timedelta
import uuid

try:
    from fsrs import Scheduler, Card, Rating, ReviewLog
    FSRS_AVAILABLE = True
except ImportError:
    FSRS_AVAILABLE = False
    print("Warning: fsrs package not installed. FSRS features will be limited.")

from models.schemas import (
    FSRSCard,
    FSRSReviewLog,
    FSRSScheduleResult,
    FSRSDueCards,
    FSRSRating,
)


class FSRSService:
    """
    Free Spaced Repetition Scheduler サービス

    FSRSは3つの変数で記憶を追跡:
    - Difficulty (D): 難易度 - カードの固有の難しさ
    - Stability (S): 安定性 - 記憶の保持力
    - Retrievability (R): 想起可能性 - 現時点で思い出せる確率
    """

    # デフォルトの目標保持率
    DEFAULT_RETENTION = 0.9  # 90%の確率で思い出せるようにスケジュール

    def __init__(self, desired_retention: float = DEFAULT_RETENTION):
        self.desired_retention = desired_retention

        # FSRS スケジューラを初期化
        if FSRS_AVAILABLE:
            self.fsrs = Scheduler()
        else:
            self.fsrs = None

        # カード状態を保持（インメモリ）
        self._cards: Dict[str, FSRSCard] = {}
        self._review_logs: Dict[str, List[FSRSReviewLog]] = {}

    def create_card(
        self,
        learner_id: str,
        content_id: str,
        content_type: str = "quiz"
    ) -> FSRSCard:
        """
        新しい学習カードを作成
        """
        card_id = str(uuid.uuid4())

        card = FSRSCard(
            card_id=card_id,
            learner_id=learner_id,
            content_id=content_id,
            content_type=content_type,
            difficulty=0.0,
            stability=0.0,
            retrievability=1.0,
            due_date=datetime.utcnow(),
            review_count=0,
            lapses=0,
        )

        self._cards[card_id] = card
        return card

    def get_card(self, card_id: str) -> Optional[FSRSCard]:
        """
        カードを取得
        """
        return self._cards.get(card_id)

    def review(
        self,
        card_id: str,
        rating: FSRSRating,
        review_time: Optional[datetime] = None
    ) -> FSRSScheduleResult:
        """
        カードをレビューして次回復習日を計算
        """
        if review_time is None:
            review_time = datetime.utcnow()

        card = self._cards.get(card_id)
        if not card:
            raise ValueError(f"Card not found: {card_id}")

        # レビューログを記録
        log = FSRSReviewLog(
            card_id=card_id,
            learner_id=card.learner_id,
            rating=rating,
            review_time=review_time,
        )

        if card_id not in self._review_logs:
            self._review_logs[card_id] = []
        self._review_logs[card_id].append(log)

        # FSRSでスケジューリング
        if FSRS_AVAILABLE and self.fsrs:
            result = self._schedule_with_fsrs(card, rating, review_time)
        else:
            result = self._schedule_fallback(card, rating, review_time)

        # カード状態を更新
        card.last_review = review_time
        card.review_count += 1
        card.due_date = result.next_review
        card.difficulty = result.new_difficulty
        card.stability = result.new_stability

        if rating == FSRSRating.AGAIN:
            card.lapses += 1

        self._cards[card_id] = card

        return result

    def _schedule_with_fsrs(
        self,
        card: FSRSCard,
        rating: FSRSRating,
        review_time: datetime
    ) -> FSRSScheduleResult:
        """
        py-fsrsを使用したスケジューリング
        """
        from datetime import timezone

        # py-fsrs の Card オブジェクトを作成
        fsrs_card = Card()

        # Rating を変換
        fsrs_rating = Rating(rating.value)

        # review_time をUTCタイムゾーン付きに変換
        if review_time.tzinfo is None:
            review_time_utc = review_time.replace(tzinfo=timezone.utc)
        else:
            review_time_utc = review_time

        # スケジューリング（新API: review_card）
        updated_card, review_log = self.fsrs.review_card(
            fsrs_card,
            fsrs_rating,
            review_datetime=review_time_utc
        )

        # 次回復習日を計算
        next_review = updated_card.due

        # 間隔（日数）を計算
        interval_days = (next_review - review_time_utc).total_seconds() / 86400

        # 推奨メッセージ
        recommendation = self._get_recommendation(rating, interval_days)

        return FSRSScheduleResult(
            card_id=card.card_id,
            next_review=next_review.replace(tzinfo=None),  # タイムゾーン情報を除去
            interval_days=interval_days,
            new_difficulty=updated_card.difficulty,
            new_stability=updated_card.stability,
            estimated_retrievability=0.9,  # 目標保持率
            recommendation=recommendation,
        )

    def _schedule_fallback(
        self,
        card: FSRSCard,
        rating: FSRSRating,
        review_time: datetime
    ) -> FSRSScheduleResult:
        """
        py-fsrsが利用できない場合のフォールバック実装
        簡易的なSM-2ベースのスケジューリング
        """
        # 基本間隔（分）
        base_intervals = {
            FSRSRating.AGAIN: 1,      # 1分
            FSRSRating.HARD: 6,       # 6分
            FSRSRating.GOOD: 10,      # 10分
            FSRSRating.EASY: 4 * 24 * 60,  # 4日
        }

        # 復習回数による倍率
        multiplier = max(1, card.review_count * 0.5 + 1)

        if rating == FSRSRating.AGAIN:
            # 忘れた場合はリセット
            interval_minutes = base_intervals[rating]
            new_difficulty = min(1.0, card.difficulty + 0.1)
            new_stability = max(0.1, card.stability * 0.5)
        else:
            interval_minutes = base_intervals[rating] * multiplier
            new_difficulty = max(0.0, card.difficulty - 0.05 * (rating.value - 2))
            new_stability = card.stability + (rating.value - 1) * 0.1

        interval_days = interval_minutes / (24 * 60)
        next_review = review_time + timedelta(minutes=interval_minutes)

        recommendation = self._get_recommendation(rating, interval_days)

        return FSRSScheduleResult(
            card_id=card.card_id,
            next_review=next_review,
            interval_days=interval_days,
            new_difficulty=new_difficulty,
            new_stability=new_stability,
            estimated_retrievability=0.9,
            recommendation=recommendation,
        )

    def _get_recommendation(self, rating: FSRSRating, interval_days: float) -> str:
        """
        レーティングに基づく推奨メッセージ
        """
        if rating == FSRSRating.AGAIN:
            return "もう一度復習しましょう！すぐに再チャレンジ！"
        elif rating == FSRSRating.HARD:
            return f"がんばりました！{self._format_interval(interval_days)}後にまた復習しましょう。"
        elif rating == FSRSRating.GOOD:
            return f"よくできました！{self._format_interval(interval_days)}後に復習予定です。"
        else:  # EASY
            return f"かんぺき！{self._format_interval(interval_days)}後まで大丈夫！"

    def _format_interval(self, days: float) -> str:
        """
        間隔を人間が読みやすい形式に変換
        """
        if days < 1/24:
            minutes = int(days * 24 * 60)
            return f"{minutes}分"
        elif days < 1:
            hours = int(days * 24)
            return f"{hours}時間"
        elif days < 7:
            return f"{int(days)}日"
        elif days < 30:
            weeks = int(days / 7)
            return f"{weeks}週間"
        else:
            months = int(days / 30)
            return f"{months}ヶ月"

    def get_due_cards(
        self,
        learner_id: str,
        limit: int = 20
    ) -> FSRSDueCards:
        """
        復習が必要なカードを取得
        """
        now = datetime.utcnow()

        due_cards = [
            card for card in self._cards.values()
            if card.learner_id == learner_id and card.due_date <= now
        ]

        # 期限順にソート
        due_cards.sort(key=lambda c: c.due_date)

        # 次回復習時刻を取得
        future_cards = [
            card for card in self._cards.values()
            if card.learner_id == learner_id and card.due_date > now
        ]
        future_cards.sort(key=lambda c: c.due_date)
        next_review_time = future_cards[0].due_date if future_cards else None

        return FSRSDueCards(
            learner_id=learner_id,
            due_cards=due_cards[:limit],
            total_due=len(due_cards),
            next_review_time=next_review_time,
        )

    def get_learner_cards(self, learner_id: str) -> List[FSRSCard]:
        """
        学習者の全カードを取得
        """
        return [
            card for card in self._cards.values()
            if card.learner_id == learner_id
        ]

    def get_statistics(self, learner_id: str) -> Dict:
        """
        学習統計を取得
        """
        cards = self.get_learner_cards(learner_id)

        if not cards:
            return {
                "total_cards": 0,
                "reviewed_cards": 0,
                "average_difficulty": 0,
                "average_stability": 0,
                "total_reviews": 0,
                "total_lapses": 0,
            }

        reviewed_cards = [c for c in cards if c.review_count > 0]

        return {
            "total_cards": len(cards),
            "reviewed_cards": len(reviewed_cards),
            "average_difficulty": sum(c.difficulty for c in cards) / len(cards),
            "average_stability": sum(c.stability for c in cards) / len(cards),
            "total_reviews": sum(c.review_count for c in cards),
            "total_lapses": sum(c.lapses for c in cards),
        }


# シングルトンインスタンス
fsrs_service = FSRSService()
