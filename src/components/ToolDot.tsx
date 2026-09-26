interface ToolDotProps {
  color: string
  name: string
}

export function ToolDot({ color, name }: ToolDotProps) {
  return (
    <span className="tool-chip">
      <span className="tool-chip-dot" style={{ background: color }} />
      <span className="tool-chip-name">{name}</span>
    </span>
  )
}
