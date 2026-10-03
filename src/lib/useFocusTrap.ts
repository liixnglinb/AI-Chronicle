import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 记录「弹层外最后聚焦的元素」。
//
// 为什么不能只在 effect 里读 document.activeElement：弹层内的 autoFocus 会在
// commit 阶段就把焦点抢走，等 effect 执行时 activeElement 已经是弹层里的元素了，
// 关闭后自然无法归还。这里用 focusin 全局记录容器外的落点，绕开时序问题。
const activeTraps = new Set<HTMLElement>()
let lastOutsideFocus: HTMLElement | null = null
let listening = false

function ensureFocusListener() {
  if (listening) return
  listening = true
  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      for (const trap of activeTraps) {
        if (trap.contains(target)) return
      }
      lastOutsideFocus = target
    },
    true,
  )
}

/**
 * 焦点陷阱：弹层打开时把键盘焦点限制在容器内，关闭后归还给触发元素。
 *
 * 不做这件事的后果很具体：Tab 会跑到遮罩后面的页面上，键盘用户失去上下文；
 * Esc 关闭后焦点回到 body，下一次 Tab 又从页首开始。
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
) {
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!active) return undefined
    const node = containerRef.current
    if (!node) return undefined

    ensureFocusListener()
    activeTraps.add(node)

    // 优先用全局记录的「弹层外最后落点」；没有则退回当前焦点（且必须不在容器内）
    const fallback = document.activeElement as HTMLElement | null
    const restoreTarget =
      lastOutsideFocus && !node.contains(lastOutsideFocus) ? lastOutsideFocus : fallback

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )

    // 打开后把焦点移进弹层，屏幕阅读器才会读到弹层内容
    const initial = focusables()[0]
    if (initial) initial.focus()
    else node.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const list = focusables()
      if (list.length === 0) {
        event.preventDefault()
        node!.focus()
        return
      }

      const first = list[0]
      const last = list[list.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !node!.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      activeTraps.delete(node)
      // 焦点归还：关闭弹层后回到打开它的那个按钮，Tab 顺序不中断
      if (restoreTarget && document.contains(restoreTarget)) {
        restoreTarget.focus?.()
      }
    }
  }, [active, containerRef])
}
