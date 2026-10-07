import { useCallback, useEffect, useState } from 'react'
import { callDesktop, type ToastPusher } from './main-call'
import { useChronicle } from './store'
import type { ScanSourceResult } from '../types'

/** 数据源校验只 stat 本机若干目录，正常几百毫秒；30 秒还没回来说明磁盘/路径卡住了 */
const SOURCE_SCAN_TIMEOUT_MS = 30_000

/**
 * 「校验数据源」与「立即重新采集」。
 *
 * 接入中心和设置中心各有一份同名实现，差异只有文案 —— 结果就是设置页那版带 30 秒超时，
 * 接入中心那版没有（挂住就一直转圈），两边 badge 与措辞也不一致。收敛到这里。
 * 校验期间把文案写进共享 busyHint，让右上角心跳替中间横幅说话。
 */
export function useSourceScan(
  onToast: ToastPusher,
  refresh: (force?: boolean) => Promise<boolean>,
) {
  const { setBusyHint } = useChronicle()
  const [scanResult, setScanResult] = useState<ScanSourceResult[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [rescanning, setRescanning] = useState(false)

  useEffect(() => {
    if (!scanning) return
    setBusyHint('正在校验数据源')
    return () => setBusyHint(null)
  }, [scanning, setBusyHint])

  const runScan = useCallback(async () => {
    if (!window.desktopAPI) return
    setScanning(true)
    const result = await callDesktop(
      onToast,
      '校验数据源',
      () => window.desktopAPI!.scanSources(),
      SOURCE_SCAN_TIMEOUT_MS,
    )
    setScanning(false)
    if (!result) return
    if (!result.ok) {
      setScanResult(null)
      onToast({
        tone: 'warning',
        title: '数据源校验未完成',
        message: '本机路径读取异常，请稍后重试。',
      })
      return
    }
    setScanResult(result.sources)
    onToast({
      tone: 'success',
      title: '数据源校验完成',
      message: `已检查 ${result.sources.length} 个接入目录的存在性与今日写入。`,
    })
  }, [onToast])

  const runRescan = useCallback(async () => {
    setRescanning(true)
    const ok = await refresh(true)
    setRescanning(false)
    if (!ok) {
      // 采集失败的具体原因（超时 / 某个源解析异常）由数据状态条承载，这里不重复编造
      onToast({
        tone: 'warning',
        title: '重新采集未完成',
        message: '页面顶部数据状态条已给出具体原因，可据此排查对应来源。',
      })
      return false
    }
    onToast({ tone: 'success', title: '已重新采集', message: '采集结果已更新。' })
    return true
  }, [onToast, refresh])

  return { scanResult, setScanResult, scanning, rescanning, runScan, runRescan }
}
