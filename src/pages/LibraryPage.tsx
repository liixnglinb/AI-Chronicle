import { Hammer } from 'lucide-react'
import { useChronicle } from '../lib/store'

export function LibraryPage() {
  const { data } = useChronicle()
  const connected = data?.sources.filter((s) => s.status === 'connected').length ?? 0

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">产出与溯源</span>
          <strong>成果库</strong>
        </div>
      </div>
      <div className="empty-state">
        <span className="empty-icon">
          <Hammer size={22} />
        </span>
        <strong>成果提取在下一版本接入</strong>
        <span>
          计划从会话中提取产出文件（代码、文档、图片），并关联到产生它的会话与软件。
          目前已接入 {connected} 个软件的真实会话，数据基础已经就绪。
        </span>
      </div>
    </div>
  )
}
