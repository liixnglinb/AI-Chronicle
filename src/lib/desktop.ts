import { callDesktop, type ToastPusher } from './main-call'

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function openLocalPath(path: string) {
  if (window.desktopAPI) {
    return window.desktopAPI.openPath(path)
  }

  try {
    await navigator.clipboard.writeText(path)
    return { ok: true, message: '浏览器预览环境无法直接打开，已复制路径。' }
  } catch {
    return { ok: false, message: '当前环境无法打开文件路径。' }
  }
}

export async function saveText(filename: string, content: string) {
  if (window.desktopAPI) {
    return window.desktopAPI.saveTextFile(filename, content)
  }

  downloadTextFile(filename, content)
  return { ok: true, message: '浏览器已开始下载文件。' }
}

/**
 * 「在资源管理器中打开」这类按钮原来直接丢弃返回值：目录被移动或删除时，
 * 用户点了没有任何反馈，看起来就是按钮坏了。这里统一把失败说出来。
 * 成功不需要提示 —— 资源管理器窗口本身就是反馈。
 */
export async function openLocalWithToast(onToast: ToastPusher | undefined, path: string) {
  const result = await callDesktop(onToast, '打开本地目录', () => openLocalPath(path))
  if (!result || result.ok) return
  onToast?.({
    tone: 'warning',
    title: '未能打开该目录',
    message: result.message || '目录可能已被移动或删除。',
  })
}
