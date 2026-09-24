import type { Confidence, ToolId } from '../types'

export const confidenceLabels: Record<Confidence, string> = {
  confirmed: '已确认',
  likely: '较可信',
  inferred: '疑似',
  duration: '仅时长',
}

export const confidenceClass: Record<Confidence, string> = {
  confirmed: 'confidence-confirmed',
  likely: 'confidence-likely',
  inferred: 'confidence-inferred',
  duration: 'confidence-duration',
}

export const artifactTypeLabels = {
  document: '文档',
  code: '代码',
  image: '图片',
  video: '视频',
  data: '数据',
} as const

export function formatTimeFromMinute(minute: number) {
  const hours = Math.floor(minute / 60)
  const minutes = minute % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function getToolIds(toolIds: ToolId[]) {
  return toolIds.join(',')
}

export function classNames(
  ...values: Array<string | false | null | undefined>
) {
  return values.filter(Boolean).join(' ')
}
