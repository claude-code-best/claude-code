import type { Dispatch, ReactNode, SetStateAction } from 'react'

/** 向导中每一步的组件（无 props 或由 Wizard 包裹后注入上下文）。 */
export type WizardStepComponent = (() => ReactNode) | React.ComponentType

/** `WizardProvider` 的声明 props（与实现处交叉类型合并）。 */
export type WizardProviderProps = {
  steps: WizardStepComponent[] // 步骤组件序列
  children?: ReactNode // 可选：自定义包裹层；缺省时渲染当前步组件
  title: string // 标题栏文案
  showStepCounter?: boolean // 是否显示「第 n / 共 m 步」
}

/** 向导上下文：当前步骤索引、累积数据与导航。 */
export type WizardContextValue<T extends Record<string, unknown>> = {
  currentStepIndex: number // 当前步骤下标
  totalSteps: number // 步骤总数
  wizardData: T // 各步写入的聚合数据
  setWizardData: Dispatch<SetStateAction<T>> // 整体替换向导数据
  updateWizardData: (updates: Partial<T>) => void // 局部合并更新
  goNext: () => void // 下一步；末步则标记完成
  goBack: () => void // 上一步或退出
  goToStep: (index: number) => void // 非线性跳步（写入历史栈）
  cancel: () => void // 放弃并清空历史
  title: string // 与 Provider 同步的标题
  showStepCounter: boolean // 是否展示步数计数
}
