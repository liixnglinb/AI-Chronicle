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

export async function saveText(
  filename: string,
  content: string,
) {
  if (window.desktopAPI) {
    return window.desktopAPI.saveTextFile(filename, content)
  }

  downloadTextFile(filename, content)
  return { ok: true, message: '浏览器已开始下载文件。' }
}
