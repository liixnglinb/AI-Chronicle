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
    label: '今日工作台',
    description: '今日结论、产出与续接',
    icon: LayoutDashboard,
  },
  {
    id: 'history',
    label: '会话档案',
    description: '筛选、检索全部真实会话',
    icon: CalendarRange,
  },
  {
    id: 'timeline',
    label: '时间轴',
    description: '今天的分时工作节奏',
    icon: Activity,
  },
  {
    id: 'projects',
    label: '项目集',
    description: '按目录归组并可直达项目',
    icon: FolderKanban,
  },
  {
    id: 'library',
    label: '成果集',
    description: '筛选并打开真实产出文件',
    icon: LibraryBig,
  },
  {
    id: 'insights',
    label: '分析',
    description: '投入、节奏与重点项目',
    icon: ChartNoAxesCombined,
  },
  {
    id: 'sources',
    label: '接入中心',
    description: '采集来源、状态与健康度',
    icon: RadioTower,
  },
  {
    id: 'settings',
    label: '设置中心',
    description: '偏好、更新、数据与诊断',
    icon: Settings2,
  },
]
