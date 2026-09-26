import {
  Activity,
  CalendarRange,
  ChartNoAxesCombined,
  FolderKanban,
  LayoutDashboard,
  LibraryBig,
  RadioTower,
  Settings2,
} from 'lucide-react'
import type { NavItem } from '../types'

export const navItems: NavItem[] = [
  {
    id: 'today',
    label: '今天',
    description: '今天用 AI 做了什么',
    icon: LayoutDashboard,
  },
  {
    id: 'history',
    label: '历史',
    description: '按天回看真实会话',
    icon: CalendarRange,
  },
  {
    id: 'timeline',
    label: '时间线',
    description: '今天的分时分布',
    icon: Activity,
  },
  {
    id: 'projects',
    label: '项目',
    description: '按工作目录聚合',
    icon: FolderKanban,
  },
  {
    id: 'library',
    label: '成果库',
    description: '产出文件（规划中）',
    icon: LibraryBig,
  },
  {
    id: 'insights',
    label: '洞察',
    description: '软件与 token 趋势',
    icon: ChartNoAxesCombined,
  },
  {
    id: 'sources',
    label: '数据源',
    description: '接入状态与说明',
    icon: RadioTower,
  },
  {
    id: 'settings',
    label: '设置',
    description: '主题、更新与数据',
    icon: Settings2,
  },
]
