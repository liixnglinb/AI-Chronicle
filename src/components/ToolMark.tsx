import { toolIconUrl } from '../data/tools'
import { classNames } from '../lib/utils'

interface ToolMarkProps {
  tool: string
  name: string
  color: string
  /** 图标边长（CSS px） */
  size?: number
  className?: string
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(rgb: [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

/** 首字母色块上的字色：品牌色有亮有暗（CatPaw 的 #F2B33D 上白字只有 1.98:1），挑对比度更高的那端 */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const lum = luminance(rgb)
  const withWhite = 1.05 / (lum + 0.05)
  const withBlack = (lum + 0.05) / 0.05
  return withBlack >= withWhite ? '#111418' : '#ffffff'
}

/**
 * 软件标识 = 品牌图 + 名字，两者一起出现。
 * 只显图标在这一款软件上不成立：WorkBuddy 与 WorkBuddy AI 共用同一张官方图，
 * Agnes / CatPaw 没有图标资产（退回首字母色块），而各家图标彼此也像——
 * 用户反馈过"这两个没有显示名称"，所以不再按图标可辨识度决定要不要名字。
 */
export function ToolMark({ tool, name, color, size = 16, className }: ToolMarkProps) {
  const src = toolIconUrl(tool)

  return (
    <span className={classNames('desk-tool-mark', className)} title={name}>
      {src ? (
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          className="desk-tool-mark-img"
          draggable={false}
        />
      ) : (
        <span
          className="desk-tool-mark-mono"
          aria-hidden
          style={{
            width: size,
            height: size,
            background: color,
            color: inkOn(color),
            fontSize: Math.round(size * 0.62),
          }}
        >
          {(name.charAt(0) || '?').toUpperCase()}
        </span>
      )}
      <span className="desk-tool-mark-name">{name}</span>
    </span>
  )
}
