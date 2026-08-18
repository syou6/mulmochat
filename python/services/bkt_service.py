"""
BKT (Bayesian Knowledge Tracing) Service
pyBKTを使用したスキル習熟度追跡サービス
"""

from typing import Dict, List, Optional
from datetime import datetime
import numpy as np

from models.schemas import (
    SkillResponse,
    BKTParameters,
    BKTPrediction,
    BKTBatchRequest,
    BKTBatchResponse,
)


class BKTService:
    """
    Bayesian Knowledge Tracing サービス

    BKTは4つのパラメータで学習者のスキル習熟度を追跡:
    - P(L0): 初期習得確率（事前知識）
    - P(T): 学習確率（1回の練習で習得する確率）
    - P(G): 推測確率（未習得でも正解する確率）
    - P(S): スリップ確率（習得済みでも間違える確率）
    """

    # 幼児教育向けデフォルトパラメータ
    DEFAULT_PARAMS = BKTParameters(
        prior=0.1,   # 低め: 新しいスキルが多い
        learn=0.3,   # 高め: 幼児は習得が速い
        guess=0.25,  # 高め: 選択肢が少ない
        slip=0.15,   # 高め: 注意力の変動が大きい
        forget=0.05, # 低め: 短期間では忘れにくい
    )

    # 習熟判定閾値
    MASTERY_THRESHOLD = 0.95

    def __init__(self):
        # 学習者ごとのスキル状態を保持（インメモリ）
        # 実運用ではRedisやDBに保存
        self._learner_states: Dict[str, Dict[str, float]] = {}
        self._response_history: Dict[str, List[SkillResponse]] = {}

    def get_mastery(
        self,
        learner_id: str,
        skill_id: str,
        params: Optional[BKTParameters] = None
    ) -> float:
        """
        学習者のスキル習熟度を取得
        """
        key = f"{learner_id}:{skill_id}"
        if key in self._learner_states:
            return self._learner_states[key].get("mastery", params.prior if params else self.DEFAULT_PARAMS.prior)
        return params.prior if params else self.DEFAULT_PARAMS.prior

    def update(
        self,
        response: SkillResponse,
        params: Optional[BKTParameters] = None
    ) -> BKTPrediction:
        """
        1回の回答でBKT状態を更新

        BKTの更新式:
        1. P(L|obs) = P(L) * P(obs|L) / P(obs)
        2. P(L_new) = P(L|obs) + P(T) * (1 - P(L|obs))
        """
        if params is None:
            params = self.DEFAULT_PARAMS

        key = f"{response.learner_id}:{response.skill_id}"

        # 現在の習熟度を取得
        current_mastery = self.get_mastery(response.learner_id, response.skill_id, params)

        # BKT更新
        if response.correct:
            # 正解の場合
            # P(L|correct) = P(L) * (1 - P(S)) / (P(L) * (1 - P(S)) + (1 - P(L)) * P(G))
            numerator = current_mastery * (1 - params.slip)
            denominator = numerator + (1 - current_mastery) * params.guess
            p_learned_given_correct = numerator / denominator if denominator > 0 else current_mastery
        else:
            # 不正解の場合
            # P(L|incorrect) = P(L) * P(S) / (P(L) * P(S) + (1 - P(L)) * (1 - P(G)))
            numerator = current_mastery * params.slip
            denominator = numerator + (1 - current_mastery) * (1 - params.guess)
            p_learned_given_correct = numerator / denominator if denominator > 0 else current_mastery

        # 学習による更新
        # P(L_new) = P(L|obs) + P(T) * (1 - P(L|obs))
        new_mastery = p_learned_given_correct + params.learn * (1 - p_learned_given_correct)

        # 忘却を考慮（拡張BKT）
        # 最後の回答からの時間経過で忘却を適用
        # 簡易実装: 今回は省略

        # 状態を保存
        if key not in self._learner_states:
            self._learner_states[key] = {}
        self._learner_states[key]["mastery"] = new_mastery
        self._learner_states[key]["last_update"] = datetime.utcnow().isoformat()

        # 回答履歴を保存
        if key not in self._response_history:
            self._response_history[key] = []
        self._response_history[key].append(response)

        # 習熟判定
        is_mastered = new_mastery >= self.MASTERY_THRESHOLD

        # 信頼度計算（回答数に基づく）
        num_responses = len(self._response_history.get(key, []))
        confidence = min(1.0, num_responses / 10)  # 10回で最大信頼度

        # 推奨アクション
        if is_mastered:
            recommendation = "このスキルは習得済みです。次のスキルに進みましょう！"
        elif new_mastery > 0.7:
            recommendation = "もう少しで習得できます。あと数問練習しましょう！"
        elif new_mastery > 0.4:
            recommendation = "着実に進歩しています。練習を続けましょう！"
        else:
            recommendation = "基礎から丁寧に学習しましょう。ヒントを活用してください。"

        return BKTPrediction(
            learner_id=response.learner_id,
            skill_id=response.skill_id,
            mastery_probability=new_mastery,
            is_mastered=is_mastered,
            confidence=confidence,
            recommendation=recommendation,
        )

    def batch_update(
        self,
        request: BKTBatchRequest
    ) -> BKTBatchResponse:
        """
        複数の回答をバッチ処理
        """
        predictions: Dict[str, BKTPrediction] = {}

        for response in request.responses:
            prediction = self.update(response, request.parameters)
            predictions[response.skill_id] = prediction

        # 全体的な習熟度を計算
        if predictions:
            overall_mastery = np.mean([p.mastery_probability for p in predictions.values()])
        else:
            overall_mastery = 0.0

        return BKTBatchResponse(
            predictions=predictions,
            overall_mastery=overall_mastery,
        )

    def get_learner_state(
        self,
        learner_id: str
    ) -> Dict[str, BKTPrediction]:
        """
        学習者の全スキル状態を取得
        """
        results = {}
        for key, state in self._learner_states.items():
            if key.startswith(f"{learner_id}:"):
                skill_id = key.split(":", 1)[1]
                mastery = state.get("mastery", self.DEFAULT_PARAMS.prior)
                is_mastered = mastery >= self.MASTERY_THRESHOLD

                results[skill_id] = BKTPrediction(
                    learner_id=learner_id,
                    skill_id=skill_id,
                    mastery_probability=mastery,
                    is_mastered=is_mastered,
                    confidence=0.5,  # 履歴から計算すべきだが簡易実装
                    recommendation="",
                )
        return results

    def recommend_next_skill(
        self,
        learner_id: str,
        available_skills: List[str]
    ) -> Optional[str]:
        """
        次に学習すべきスキルを推薦
        - 最も習熟度が低いが、0でないスキルを優先
        - すべて未着手なら最初のスキル
        - すべて習得済みなら None
        """
        skill_masteries = []

        for skill_id in available_skills:
            mastery = self.get_mastery(learner_id, skill_id)
            skill_masteries.append((skill_id, mastery))

        # 習得済みでないスキルをフィルタ
        not_mastered = [(s, m) for s, m in skill_masteries if m < self.MASTERY_THRESHOLD]

        if not not_mastered:
            return None  # すべて習得済み

        # 最も習熟度が低いスキルを選択（ただし完全に0よりは少し進んだものを優先）
        # これにより、着手したが習得していないスキルを優先
        not_mastered.sort(key=lambda x: (x[1] == 0, -x[1]))

        return not_mastered[0][0]


# シングルトンインスタンス
bkt_service = BKTService()
