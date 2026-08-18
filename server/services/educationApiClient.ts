/**
 * Education API Client
 * Python FastAPI サーバー (BKT, FSRS, Quiz) との通信クライアント
 */

const PYTHON_API_BASE = process.env.PYTHON_API_URL || 'http://localhost:8000';

// ==================== Types ====================

export type AgeGroup = 'preschool' | 'elementary_lower' | 'elementary_upper' | 'adult';

export interface BKTUpdateRequest {
  learner_id: string;
  skill_id: string;
  correct: boolean;
}

export interface BKTPrediction {
  learner_id: string;
  skill_id: string;
  mastery_probability: number;
  is_mastered: boolean;
  prior_mastery: number;
}

export interface FSRSCard {
  card_id: string;
  learner_id: string;
  content_id: string;
  content_type: string;
  difficulty: number;
  stability: number;
  retrievability: number;
  due_date: string;
  last_review: string | null;
  review_count: number;
  lapses: number;
}

export interface FSRSScheduleResult {
  card_id: string;
  next_review: string;
  interval_days: number;
  new_difficulty: number;
  new_stability: number;
  estimated_retrievability: number;
  recommendation: string;
}

export interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'fill_blank' | 'true_false';
  question: string;
  options?: string[];
  correct_answer: string | number;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  skill_id?: string;
  hints?: string[];
}

export interface QuizSet {
  title: string;
  description: string;
  questions: QuizQuestion[];
  target_skills: string[];
}

export interface QuizGenerationRequest {
  content: string;
  learner_id?: string;
  age_group?: AgeGroup;
  interests?: string[];
  count?: number;
  types?: string[];
  include_hints?: boolean;
  adapt_difficulty?: boolean;
}

export interface QuizGenerationResponse {
  quiz: QuizSet;
  generation_time: string;
  adapted_for_learner: boolean;
  difficulty_distribution: Record<string, number>;
}

export interface LearningState {
  learner_id: string;
  skill_masteries: Record<string, BKTPrediction>;
  overall_mastery: number;
  due_reviews: number;
  next_review: string | null;
}

export interface HealthResponse {
  status: string;
  version: string;
  services: Record<string, boolean>;
}

// ==================== API Client ====================

class EducationApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = PYTHON_API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Education API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // ==================== Health ====================

  async checkHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  // ==================== BKT ====================

  async updateBKT(request: BKTUpdateRequest): Promise<BKTPrediction> {
    return this.request<BKTPrediction>('/api/v1/bkt/update', {
      method: 'POST',
      body: JSON.stringify({
        response: {
          learner_id: request.learner_id,
          skill_id: request.skill_id,
          correct: request.correct,
        },
      }),
    });
  }

  async getMastery(learnerId: string, skillId: string): Promise<{
    learner_id: string;
    skill_id: string;
    mastery_probability: number;
    is_mastered: boolean;
  }> {
    return this.request(`/api/v1/bkt/mastery/${learnerId}/${skillId}`);
  }

  async getLearnerState(learnerId: string): Promise<{
    learner_id: string;
    skills: Record<string, BKTPrediction>;
    total_skills: number;
    mastered_skills: number;
  }> {
    return this.request(`/api/v1/bkt/learner/${learnerId}`);
  }

  async recommendSkill(learnerId: string, availableSkills: string[]): Promise<{
    learner_id: string;
    recommended_skill: string | null;
    all_mastered: boolean;
  }> {
    return this.request(`/api/v1/bkt/recommend/${learnerId}`, {
      method: 'POST',
      body: JSON.stringify(availableSkills),
    });
  }

  // ==================== FSRS ====================

  async createCard(
    learnerId: string,
    contentId: string,
    contentType: string = 'quiz'
  ): Promise<FSRSCard> {
    return this.request(
      `/api/v1/fsrs/cards?learner_id=${learnerId}&content_id=${contentId}&content_type=${contentType}`,
      { method: 'POST' }
    );
  }

  async getCard(cardId: string): Promise<FSRSCard> {
    return this.request(`/api/v1/fsrs/cards/${cardId}`);
  }

  async reviewCard(cardId: string, rating: 1 | 2 | 3 | 4): Promise<FSRSScheduleResult> {
    return this.request(`/api/v1/fsrs/review/${cardId}?rating=${rating}`, {
      method: 'POST',
    });
  }

  async getDueCards(learnerId: string, limit: number = 20): Promise<{
    learner_id: string;
    due_cards: FSRSCard[];
    total_due: number;
    next_review_time: string | null;
  }> {
    return this.request(`/api/v1/fsrs/due/${learnerId}?limit=${limit}`);
  }

  async getLearnerCards(learnerId: string): Promise<{
    learner_id: string;
    cards: FSRSCard[];
    total: number;
  }> {
    return this.request(`/api/v1/fsrs/learner/${learnerId}/cards`);
  }

  async getLearnerStats(learnerId: string): Promise<{
    learner_id: string;
    total_cards: number;
    reviewed_cards: number;
    average_difficulty: number;
    average_stability: number;
    total_reviews: number;
    total_lapses: number;
  }> {
    return this.request(`/api/v1/fsrs/learner/${learnerId}/stats`);
  }

  // ==================== Quiz Generation ====================

  async generateQuiz(request: QuizGenerationRequest): Promise<QuizGenerationResponse> {
    return this.request('/api/v1/quiz/generate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async generateHints(
    question: string,
    correctAnswer: string,
    ageGroup: AgeGroup = 'preschool'
  ): Promise<{ hints: string[] }> {
    const params = new URLSearchParams({
      question,
      correct_answer: correctAnswer,
      age_group: ageGroup,
    });
    return this.request(`/api/v1/quiz/hints?${params}`, { method: 'POST' });
  }

  async submitAnswer(
    learnerId: string,
    questionId: string,
    skillId: string,
    isCorrect: boolean
  ): Promise<{
    question_id: string;
    is_correct: boolean;
    new_mastery: number;
    is_mastered: boolean;
    message: string;
  }> {
    const params = new URLSearchParams({
      learner_id: learnerId,
      question_id: questionId,
      skill_id: skillId,
      is_correct: String(isCorrect),
    });
    return this.request(`/api/v1/quiz/answer?${params}`, { method: 'POST' });
  }

  // ==================== Combined Learning State ====================

  async getLearningState(learnerId: string): Promise<LearningState> {
    return this.request(`/api/v1/learning/${learnerId}`);
  }
}

// シングルトンインスタンス
export const educationApi = new EducationApiClient();

export default educationApi;
