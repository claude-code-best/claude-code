import chalk from 'chalk'
import * as path from 'path'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import type {
  CommandResultDisplay,
  LocalJSXCommandContext,
} from '../../commands.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '@anthropic/ink'
import {
  IdeAutoConnectDialog,
  IdeDisableAutoConnectDialog,
  shouldShowAutoConnectDialog,
  shouldShowDisableAutoConnectDialog,
} from '../../components/IdeAutoConnectDialog.js'
import { Box, Text } from '@anthropic/ink'
import { clearServerCache } from '../../services/mcp/client.js'
import type { ScopedMcpServerConfig } from '../../services/mcp/types.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import { getCwd } from '../../utils/cwd.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import {
  type DetectedIDEInfo,
  detectIDEs,
  detectRunningIDEs,
  type IdeType,
  isJetBrainsIde,
  isSupportedJetBrainsTerminal,
  isSupportedTerminal,
  toIDEDisplayName,
} from '../../utils/ide.js'
import { getCurrentWorktreeSession } from '../../utils/worktree.js'

type IDEScreenProps = {
  availableIDEs: DetectedIDEInfo[]
  unavailableIDEs: DetectedIDEInfo[]
  selectedIDE?: DetectedIDEInfo | null
  onClose: () => void
  onSelect: (ide?: DetectedIDEInfo) => void
}

function IDEScreen({
  availableIDEs,
  unavailableIDEs,
  selectedIDE,
  onClose,
  onSelect,
}: IDEScreenProps): React.ReactNode {
  const [selectedValue, setSelectedValue] = useState(
    selectedIDE?.port?.toString() ?? 'None',
  )
  const [showAutoConnectDialog, setShowAutoConnectDialog] = useState(false)
  const [showDisableAutoConnectDialog, setShowDisableAutoConnectDialog] =
    useState(false)

  const handleSelectIDE = useCallback(
    (value: string) => {
      if (value !== 'None' && shouldShowAutoConnectDialog()) {
        setShowAutoConnectDialog(true)
      } else if (value === 'None' && shouldShowDisableAutoConnectDialog()) {
        setShowDisableAutoConnectDialog(true)
      } else {
        onSelect(availableIDEs.find(ide => ide.port === parseInt(value, 10)))
      }
    },
    [availableIDEs, onSelect],
  )

  const ideCounts = availableIDEs.reduce<Record<string, number>>((acc, ide) => {
    acc[ide.name] = (acc[ide.name] || 0) + 1
    return acc
  }, {})

  const options = availableIDEs
    .map(ide => {
      const hasMultipleInstances = (ideCounts[ide.name] || 0) > 1
      const showWorkspace =
        hasMultipleInstances && ide.workspaceFolders.length > 0

      return {
        label: ide.name,
        value: ide.port.toString(),
        description: showWorkspace
          ? formatWorkspaceFolders(ide.workspaceFolders)
          : undefined,
      }
    })
    .concat([{ label: 'None', value: 'None', description: undefined }])

  if (showAutoConnectDialog) {
    return (
      <IdeAutoConnectDialog onComplete={() => handleSelectIDE(selectedValue)} />
    )
  }

  if (showDisableAutoConnectDialog) {
    return (
      <IdeDisableAutoConnectDialog
        onComplete={() => {
          // 当用户选择“无”时，始终断开连接，无论其关
          // 于禁用自动连接的选择如何
          onSelect(undefined)
        }}
      />
    )
  }

  return (
    <Dialog
      title="选择 IDE"
      subtitle="连接到 IDE 以使用集成开发功能。"
      onCancel={onClose}
      color="ide"
    >
      <Box flexDirection="column">
        {availableIDEs.length === 0 && (
          <Text dimColor>
            {isSupportedJetBrainsTerminal()
              ? '未检测到可用的 IDE。请安装插件并重启你的 IDE：\n' +
                'https://docs.claude.com/s/claude-code-jetbrains'
              : '未检测到可用的 IDE。请确保你的 IDE 已安装 Claude Code 扩展或插件并且正在运行。'}
          </Text>
        )}

        {availableIDEs.length !== 0 && (
          <Select
            defaultValue={selectedValue}
            defaultFocusValue={selectedValue}
            options={options}
            onChange={value => {
              setSelectedValue(value)
              handleSelectIDE(value)
            }}
          />
        )}
        {availableIDEs.length !== 0 &&
          availableIDEs.some(
            ide => ide.name === 'VS Code' || ide.name === 'Visual Studio Code',
          ) && (
            <Box marginTop={1}>
              <Text color="warning">
                注意：一次只能有一个 Claude Code 实例连接到 VS Code。</Text>
            </Box>
          )}
        {availableIDEs.length !== 0 && !isSupportedTerminal() && (
          <Box marginTop={1}>
            <Text dimColor>
              提示：你可以在 /config 中或使用 --ide 标志启用 IDE 自动连接</Text>
          </Box>
        )}

        {unavailableIDEs.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              Found {unavailableIDEs.length} 其他正在运行的 IDE。但是，它们的工作区/项目目录与当前 cwd 不匹配。</Text>
            <Box marginTop={1} flexDirection="column">
              {unavailableIDEs.map((ide, index) => (
                <Box key={index} paddingLeft={3}>
                  <Text dimColor>
                    • {ide.name}: {formatWorkspaceFolders(ide.workspaceFolders)}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Dialog>
  )
}

async function findCurrentIDE(
  availableIDEs: DetectedIDEInfo[],
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>,
): Promise<DetectedIDEInfo | null> {
  const currentConfig = dynamicMcpConfig?.ide
  if (
    !currentConfig ||
    (currentConfig.type !== 'sse-ide' && currentConfig.type !== 'ws-ide')
  ) {
    return null
  }
  for (const ide of availableIDEs) {
    if (ide.url === currentConfig.url) {
      return ide
    }
  }
  return null
}

type IDEOpenSelectionProps = {
  availableIDEs: DetectedIDEInfo[]
  onSelectIDE: (ide?: DetectedIDEInfo) => void
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

function IDEOpenSelection({
  availableIDEs,
  onSelectIDE,
  onDone,
}: IDEOpenSelectionProps): React.ReactNode {
  const [selectedValue, setSelectedValue] = useState(
    availableIDEs[0]?.port?.toString() ?? '',
  )

  const handleSelectIDE = useCallback(
    (value: string) => {
      const selectedIDE = availableIDEs.find(
        ide => ide.port === parseInt(value, 10),
      )
      onSelectIDE(selectedIDE)
    },
    [availableIDEs, onSelectIDE],
  )

  const options = availableIDEs.map(ide => ({
    label: ide.name,
    value: ide.port.toString(),
  }))

  function handleCancel(): void {
    onDone('IDE 选择已取消', { display: 'system' })
  }

  return (
    <Dialog
      title="选择一个 IDE 来打开项目"
      onCancel={handleCancel}
      color="ide"
    >
      <Select
        defaultValue={selectedValue}
        defaultFocusValue={selectedValue}
        options={options}
        onChange={value => {
          setSelectedValue(value)
          handleSelectIDE(value)
        }}
      />
    </Dialog>
  )
}

function RunningIDESelector({
  runningIDEs,
  onSelectIDE,
  onDone,
}: {
  runningIDEs: IdeType[]
  onSelectIDE: (ide: IdeType) => void
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}): React.ReactNode {
  const [selectedValue, setSelectedValue] = useState(runningIDEs[0] ?? '')

  const handleSelectIDE = useCallback(
    (value: string) => {
      onSelectIDE(value as IdeType)
    },
    [onSelectIDE],
  )

  const options = runningIDEs.map(ide => ({
    label: toIDEDisplayName(ide),
    value: ide,
  }))

  function handleCancel(): void {
    onDone('IDE 选择已取消', { display: 'system' })
  }

  return (
    <Dialog
      title="选择 IDE 以安装扩展"
      onCancel={handleCancel}
      color="ide"
    >
      <Select
        defaultFocusValue={selectedValue}
        options={options}
        onChange={value => {
          setSelectedValue(value)
          handleSelectIDE(value)
        }}
      />
    </Dialog>
  )
}

function InstallOnMount({
  ide,
  onInstall,
}: {
  ide: IdeType
  onInstall: (ide: IdeType) => void
}): React.ReactNode {
  useEffect(() => {
    onInstall(ide)
  }, [ide, onInstall])
  return null
}

export async function call(
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode | null> {
  logEvent('tengu_ext_ide_command', {})
  const {
    options: { dynamicMcpConfig },
    onChangeDynamicMcpConfig,
  } = context

  // 处理 'open' 参数
  if (args?.trim() === 'open') {
    const worktreeSession = getCurrentWorktreeSession()
    const targetPath = worktreeSession ? worktreeSession.worktreePath : getCwd()

    // 检测可用的 IDE
    const detectedIDEs = await detectIDEs(true)
    const availableIDEs = detectedIDEs.filter(ide => ide.isValid)

    if (availableIDEs.length === 0) {
      onDone('未检测到安装 Claude Code 扩展的 IDE。')
      return null
    }

    // 返回 IDE 选择组件
    return (
      <IDEOpenSelection
        availableIDEs={availableIDEs}
        onSelectIDE={async (selectedIDE?: DetectedIDEInfo) => {
          if (!selectedIDE) {
            onDone('未选择 IDE。')
            return
          }

          // 尝试在选定的 IDE 中打开项目
          if (
            selectedIDE.name.toLowerCase().includes('vscode') ||
            selectedIDE.name.toLowerCase().includes('cursor') ||
            selectedIDE.name.toLowerCase().includes('windsurf')
          ) {
            // 基于 VS Code 的 IDE
            const { code } = await execFileNoThrow('code', [targetPath])
            if (code === 0) {
              onDone(
                `已在 ${chalk.bold(selectedIDE.name)} 中打开 ${worktreeSession ? 'worktree' : 'project'}`,
              )
            } else {
              onDone(
                `在 ${selectedIDE.name} 中打开失败。请尝试手动打开：${targetPath}`,
              )
            }
          } else if (isSupportedJetBrainsTerminal()) {
            // JetBrains IDE - 它们通常通过其 CLI 工具打开
            onDone(
              `请在 ${chalk.bold(selectedIDE.name)} 中手动打开 ${worktreeSession ? 'worktree' : 'project'}：${targetPath}`,
            )
          } else {
            onDone(
              `请在 ${chalk.bold(selectedIDE.name)} 中手动打开 ${worktreeSession ? 'worktree' : 'project'}：${targetPath}`,
            )
          }
        }}
        onDone={() => {
          onDone('未打开 IDE 即退出', { display: 'system' })
        }}
      />
    )
  }

  const detectedIDEs = await detectIDEs(true)

  // 如果未检测到安装扩展的 IDE，则检查正在运行的 IDE 并提供安装选项
  if (
    detectedIDEs.length === 0 &&
    context.onInstallIDEExtension &&
    !isSupportedTerminal()
  ) {
    const runningIDEs = await detectRunningIDEs()

    const onInstall = (ide: IdeType) => {
      if (context.onInstallIDEExtension) {
        context.onInstallIDEExtension(ide)
        // 安装完成后将显示完成消息
        if (isJetBrainsIde(ide)) {
          onDone(
            `已将插件安装到 ${chalk.bold(toIDEDisplayName(ide))}
` +
              `请完全${chalk.bold('restart your IDE')}以使其生效`,
          )
        } else {
          onDone(`已安装扩展至${chalk.bold(toIDEDisplayName(ide))}`)
        }
      }
    }

    if (runningIDEs.length > 1) {
      // 当多个IDE运行时显示选择器
      return (
        <RunningIDESelector
          runningIDEs={runningIDEs}
          onSelectIDE={onInstall}
          onDone={() => {
            onDone('未选择IDE。', { display: 'system' })
          }}
        />
      )
    } else if (runningIDEs.length === 1) {
      return <InstallOnMount ide={runningIDEs[0]!} onInstall={onInstall} />
    }
  }

  const availableIDEs = detectedIDEs.filter(ide => ide.isValid)
  const unavailableIDEs = detectedIDEs.filter(ide => !ide.isValid)

  const currentIDE = await findCurrentIDE(availableIDEs, dynamicMcpConfig)

  return (
    <IDECommandFlow
      availableIDEs={availableIDEs}
      unavailableIDEs={unavailableIDEs}
      currentIDE={currentIDE}
      dynamicMcpConfig={dynamicMcpConfig}
      onChangeDynamicMcpConfig={onChangeDynamicMcpConfig}
      onDone={onDone}
    />
  )
}

// 连接超时时间略长于30秒的MCP连接超时
const IDE_CONNECTION_TIMEOUT_MS = 35000

type IDECommandFlowProps = {
  availableIDEs: DetectedIDEInfo[]
  unavailableIDEs: DetectedIDEInfo[]
  currentIDE: DetectedIDEInfo | null
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
  onChangeDynamicMcpConfig?: (
    config: Record<string, ScopedMcpServerConfig>,
  ) => void
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

function IDECommandFlow({
  availableIDEs,
  unavailableIDEs,
  currentIDE,
  dynamicMcpConfig,
  onChangeDynamicMcpConfig,
  onDone,
}: IDECommandFlowProps): React.ReactNode {
  const [connectingIDE, setConnectingIDE] = useState<DetectedIDEInfo | null>(
    null,
  )
  const ideClient = useAppState(s => s.mcp.clients.find(c => c.name === 'ide'))
  const setAppState = useSetAppState()
  const isFirstCheckRef = useRef(true)

  // 监听连接结果
  useEffect(() => {
    if (!connectingIDE) return
    // 跳过首次检查——它反映的是配置变更
    // 分发前的陈旧状态
    if (isFirstCheckRef.current) {
      isFirstCheckRef.current = false
      return
    }
    if (!ideClient || ideClient.type === 'pending') return
    if (ideClient.type === 'connected') {
      onDone(`已连接到${connectingIDE.name}。`)
    } else if (ideClient.type === 'failed') {
      onDone(`连接到${connectingIDE.name}失败。`)
    }
  }, [ideClient, connectingIDE, onDone])

  // 超时回退
  useEffect(() => {
    if (!connectingIDE) return
    const timer = setTimeout(
      onDone,
      IDE_CONNECTION_TIMEOUT_MS,
      `连接到${connectingIDE.name}超时。`,
    )
    return () => clearTimeout(timer)
  }, [connectingIDE, onDone])

  const handleSelectIDE = useCallback(
    (selectedIDE?: DetectedIDEInfo) => {
      if (!onChangeDynamicMcpConfig) {
        onDone('连接IDE时出错。')
        return
      }
      const newConfig = { ...(dynamicMcpConfig || {}) }
      if (currentIDE) {
        delete newConfig.ide
      }
      if (!selectedIDE) {
        // 关闭MCP传输并从状态中移除客户端
        if (ideClient && ideClient.type === 'connected' && currentIDE) {
          // 将onclose设为null以防止自动重连
          ideClient.client.onclose = () => {}
          void clearServerCache('ide', ideClient.config)
          setAppState(prev => ({
            ...prev,
            mcp: {
              ...prev.mcp,
              clients: prev.mcp.clients.filter(c => c.name !== 'ide'),
              tools: prev.mcp.tools.filter(
                t => !t.name?.startsWith('mcp__ide__'),
              ),
              commands: prev.mcp.commands.filter(
                c => !c.name?.startsWith('mcp__ide__'),
              ),
            },
          }))
        }
        onChangeDynamicMcpConfig(newConfig)
        onDone(
          currentIDE
            ? `已断开与${currentIDE.name}的连接。`
            : '未选择IDE。',
        )
        return
      }
      const url = selectedIDE.url
      newConfig.ide = {
        type: url.startsWith('ws:') ? 'ws-ide' : 'sse-ide',
        url: url,
        ideName: selectedIDE.name,
        authToken: selectedIDE.authToken,
        ideRunningInWindows: selectedIDE.ideRunningInWindows,
        scope: 'dynamic' as const,
      } as ScopedMcpServerConfig
      isFirstCheckRef.current = true
      setConnectingIDE(selectedIDE)
      onChangeDynamicMcpConfig(newConfig)
    },
    [
      dynamicMcpConfig,
      currentIDE,
      ideClient,
      setAppState,
      onChangeDynamicMcpConfig,
      onDone,
    ],
  )

  if (connectingIDE) {
    return <Text dimColor>正在连接到{connectingIDE.name}…</Text>
  }

  return (
    <IDEScreen
      availableIDEs={availableIDEs}
      unavailableIDEs={unavailableIDEs}
      selectedIDE={currentIDE}
      onClose={() => onDone('IDE选择已取消', { display: 'system' })}
      onSelect={handleSelectIDE}
    />
  )
}

/** 格式化工作区文件夹以供显示，去除当前工作目录并显示路径末尾部分
@param folders 文件夹路径数组
@param maxLength 格式化字符串的最大总长度
@returns 包含文件夹路径的格式化字符串 */
export function formatWorkspaceFolders(
  folders: string[],
  maxLength: number = 100,
): string {
  if (folders.length === 0) return ''

  const cwd = getCwd()

  // 仅显示前2个工作区
  const foldersToShow = folders.slice(0, 2)
  const hasMore = folders.length > 2

  // 如果存在更多文件夹，需考虑", …"的长度
  const ellipsisOverhead = hasMore ? 3 : 0 // ", …"

  // 考虑路径间的逗号和空格长度（", " = 每个分隔符2个字符）
  const separatorOverhead = (foldersToShow.length - 1) * 2
  const availableLength = maxLength - separatorOverhead - ellipsisOverhead

  const maxLengthPerPath = Math.floor(availableLength / foldersToShow.length)

  const cwdNFC = cwd.normalize('NFC')
  const formattedFolders = foldersToShow.map(folder => {
    // 如果存在，从开头去除当前工作目录。
    // 将两者标准化为NFC以进行一致比较（macOS使用NFD路径）
    const folderNFC = folder.normalize('NFC')
    if (folderNFC.startsWith(cwdNFC + path.sep)) {
      folder = folderNFC.slice(cwdNFC.length + 1)
    }

    if (folder.length <= maxLengthPerPath) {
      return folder
    }
    return '…' + folder.slice(-(maxLengthPerPath - 1))
  })

  let result = formattedFolders.join(', ')
  if (hasMore) {
    result += ', …'
  }

  return result
}
