/**
 * Education API Routes
 * Python FastAPI (BKT, FSRS, Quiz) へのプロキシエンドポイント
 */

import { Router, Request, Response } from 'express';
import educationApi, {
  type BKTUpdateRequest,
  type QuizGenerationRequest,
  type AgeGroup,
} from '../services/educationApiClient.js';

const router = Router();

// ==================== Health Check ====================

router.get('/education/health', async (req: Request, res: Response) => {
  try {
    const health = await educationApi.checkHealth();
    res.json({
      node_server: 'ok',
      python_server: health.status,
      services: health.services,
    });
  } catch (error) {
    res.json({
      node_server: 'ok',
      python_server: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== BKT Endpoints ====================

router.post('/bkt/update', async (req: Request, res: Response) => {
  try {
    const { learner_id, skill_id, correct } = req.body as BKTUpdateRequest;

    if (!learner_id || !skill_id || correct === undefined) {
      res.status(400).json({ error: 'Missing required fields: learner_id, skill_id, correct' });
      return;
    }

    const result = await educationApi.updateBKT({ learner_id, skill_id, correct });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/bkt/mastery/:learnerId/:skillId', async (req: Request, res: Response) => {
  try {
    const { learnerId, skillId } = req.params;
    const result = await educationApi.getMastery(learnerId, skillId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/bkt/learner/:learnerId', async (req: Request, res: Response) => {
  try {
    const { learnerId } = req.params;
    const result = await educationApi.getLearnerState(learnerId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/bkt/recommend/:learnerId', async (req: Request, res: Response) => {
  try {
    const { learnerId } = req.params;
    const availableSkills = req.body as string[];

    if (!Array.isArray(availableSkills)) {
      res.status(400).json({ error: 'Request body must be an array of skill IDs' });
      return;
    }

    const result = await educationApi.recommendSkill(learnerId, availableSkills);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ==================== FSRS Endpoints ====================

router.post('/fsrs/cards', async (req: Request, res: Response) => {
  try {
    const { learner_id, content_id, content_type = 'quiz' } = req.body;

    if (!learner_id || !content_id) {
      res.status(400).json({ error: 'Missing required fields: learner_id, content_id' });
      return;
    }

    const result = await educationApi.createCard(learner_id, content_id, content_type);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/fsrs/cards/:cardId', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const result = await educationApi.getCard(cardId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/fsrs/review/:cardId', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { rating } = req.body;

    if (!rating || ![1, 2, 3, 4].includes(rating)) {
      res.status(400).json({ error: 'Rating must be 1, 2, 3, or 4' });
      return;
    }

    const result = await educationApi.reviewCard(cardId, rating);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/fsrs/due/:learnerId', async (req: Request, res: Response) => {
  try {
    const { learnerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await educationApi.getDueCards(learnerId, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/fsrs/learner/:learnerId/cards', async (req: Request, res: Response) => {
  try {
    const { learnerId } = req.params;
    const result = await educationApi.getLearnerCards(learnerId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/fsrs/learner/:learnerId/stats', async (req: Request, res: Response) => {
  try {
    const { learnerId } = req.params;
    const result = await educationApi.getLearnerStats(learnerId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ==================== Quiz Endpoints ====================

router.post('/quiz/generate', async (req: Request, res: Response) => {
  try {
    const request = req.body as QuizGenerationRequest;

    if (!request.content) {
      res.status(400).json({ error: 'Missing required field: content' });
      return;
    }

    const result = await educationApi.generateQuiz(request);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/quiz/hints', async (req: Request, res: Response) => {
  try {
    const { question, correct_answer, age_group = 'preschool' } = req.body;

    if (!question || !correct_answer) {
      res.status(400).json({ error: 'Missing required fields: question, correct_answer' });
      return;
    }

    const result = await educationApi.generateHints(question, correct_answer, age_group as AgeGroup);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/quiz/answer', async (req: Request, res: Response) => {
  try {
    const { learner_id, question_id, skill_id, is_correct } = req.body;

    if (!learner_id || !question_id || !skill_id || is_correct === undefined) {
      res.status(400).json({
        error: 'Missing required fields: learner_id, question_id, skill_id, is_correct',
      });
      return;
    }

    const result = await educationApi.submitAnswer(learner_id, question_id, skill_id, is_correct);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ==================== Combined Learning State ====================

router.get('/learning/:learnerId', async (req: Request, res: Response) => {
  try {
    const { learnerId } = req.params;
    const result = await educationApi.getLearningState(learnerId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ==================== Convenience Endpoints ====================

/**
 * 学習セッション開始
 * 学習者の現在の状態を取得し、復習が必要なカードと推奨スキルを返す
 */
router.post('/learning/session/start', async (req: Request, res: Response) => {
  try {
    const { learner_id, available_skills = [] } = req.body;

    if (!learner_id) {
      res.status(400).json({ error: 'Missing required field: learner_id' });
      return;
    }

    // 並列でデータ取得
    const [learningState, dueCards, recommendation] = await Promise.all([
      educationApi.getLearningState(learner_id).catch(() => null),
      educationApi.getDueCards(learner_id, 10).catch(() => ({ due_cards: [], total_due: 0 })),
      available_skills.length > 0
        ? educationApi.recommendSkill(learner_id, available_skills).catch(() => null)
        : Promise.resolve(null),
    ]);

    res.json({
      learner_id,
      learning_state: learningState,
      due_cards: dueCards,
      recommended_skill: recommendation?.recommended_skill || null,
      session_started_at: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * クイズ完了処理
 * クイズの回答を一括送信し、BKTを更新、FSRSカードをレビュー
 */
router.post('/learning/quiz/complete', async (req: Request, res: Response) => {
  try {
    const { learner_id, quiz_id, answers } = req.body as {
      learner_id: string;
      quiz_id: string;
      answers: Array<{
        question_id: string;
        skill_id: string;
        is_correct: boolean;
        rating?: 1 | 2 | 3 | 4;
      }>;
    };

    if (!learner_id || !quiz_id || !answers) {
      res.status(400).json({ error: 'Missing required fields: learner_id, quiz_id, answers' });
      return;
    }

    // 各回答を処理
    const results = await Promise.all(
      answers.map(async (answer) => {
        const bktResult = await educationApi.submitAnswer(
          learner_id,
          answer.question_id,
          answer.skill_id,
          answer.is_correct
        );

        return {
          question_id: answer.question_id,
          is_correct: answer.is_correct,
          new_mastery: bktResult.new_mastery,
          is_mastered: bktResult.is_mastered,
        };
      })
    );

    // 統計を計算
    const correctCount = results.filter((r) => r.is_correct).length;
    const totalCount = results.length;
    const masteredCount = results.filter((r) => r.is_mastered).length;

    res.json({
      learner_id,
      quiz_id,
      results,
      summary: {
        correct: correctCount,
        total: totalCount,
        percentage: Math.round((correctCount / totalCount) * 100),
        skills_mastered: masteredCount,
      },
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
