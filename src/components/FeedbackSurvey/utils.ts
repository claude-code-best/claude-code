/** 会话内满意度调查的选项（与数字键 0–3 映射一致）。 */
export type FeedbackSurveyResponse =
  | 'dismissed' // 0：关闭不反馈
  | 'bad' // 1：不满意
  | 'fine' // 2：一般
  | 'good' // 3：满意

/** 调查场景；当前仅实现会话级提示。 */
export type FeedbackSurveyType = 'session' // 主会话 Spinner/流程内触发
