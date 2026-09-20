/** `question` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'error.incomplete': '请先完成这道问题。',
  'error.unanswered': '请选择一个选项或填写自定义答案。',
  'nav.prev': '上一题',
  'nav.next': '下一题',
  'nav.minimize': '收起问题卡片',
  'nav.maximize': '展开问题卡片',
  'nav.cancel': '放弃整组问题',
  'option.recommended': '推荐',
  'custom.placeholder': '输入你的答案',
  'action.skip': '跳过本题',
  'action.next': '下一题',
  'plan.header': '计划待审',
  'plan.approve': '确认执行',
  'plan.approve.execute': '清空并执行',
  'plan.approve.compact': '压缩后执行',
  'plan.approve.keep': '保留上下文',
  'plan.refine': '继续规划',
  'plan.discuss': '去聊天里说',
  'plan.execution.start': '开始执行',
  'plan.execution.back': '返回',
  'plan.execution.freshNote': '该预设只用于本次新建的执行会话。',
  'plan.execution.rejected': '模型没能切换成功，计划尚未提交。',
} satisfies Record<string, string>

/** The question namespace key union. */
export type QuestionKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'error.incomplete': 'Please complete this question first.',
  'error.unanswered': 'Please select an option or enter a custom answer.',
  'nav.prev': 'Previous question',
  'nav.next': 'Next question',
  'nav.minimize': 'Collapse the question card',
  'nav.maximize': 'Expand the question card',
  'nav.cancel': 'Dismiss all questions',
  'option.recommended': 'Recommended',
  'custom.placeholder': 'Type your answer',
  'action.skip': 'Skip this question',
  'action.next': 'Next',
  'plan.header': 'Plan review',
  'plan.approve': 'Approve',
  'plan.approve.execute': 'Execute',
  'plan.approve.compact': 'Compact and execute',
  'plan.approve.keep': 'Keep context',
  'plan.refine': 'Refine plan',
  'plan.discuss': 'Chat about it',
  'plan.execution.start': 'Start execution',
  'plan.execution.back': 'Back',
  'plan.execution.freshNote': 'This preset applies only to the execution session this approval starts.',
  'plan.execution.rejected': 'The model could not be switched, so the plan was not submitted.',
} satisfies Record<QuestionKey, string>
