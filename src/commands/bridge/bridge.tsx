import { feature } from 'bun:bundle';
import { toString as qrToString } from 'qrcode';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { getBridgeAccessToken } from '../../bridge/bridgeConfig.js';
import { checkBridgeMinVersion, getBridgeDisabledReason, isEnvLessBridgeEnabled } from '../../bridge/bridgeEnabled.js';
import { checkEnvLessBridgeMinVersion } from '../../bridge/envLessBridgeConfig.js';
import { BRIDGE_LOGIN_INSTRUCTION, REMOTE_CONTROL_DISCONNECTED_MSG } from '../../bridge/types.js';
import { Dialog, ListItem } from '@anthropic/ink';
import { shouldShowRemoteCallout } from '../../components/RemoteCallout.js';
import { useRegisterOverlay } from '../../context/overlayContext.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { logForDebugging } from '../../utils/debug.js';

type Props = {
  onDone: LocalJSXCommandOnDone;
  name?: string;
};

/** * /remote-control 命令 — 管理双向桥接连接。
 *
 * 启用时，会在 AppState 中设置 replBridgeEnabled，从而触发 REPL.tsx 中的 useReplBridge 初始化桥接连接。
 * 桥接会注册一个环境，使用当前对话创建一个会话，轮询工作，并连接一个入口 WebSocket，
 * 用于 CLI 与 claude.ai 之间的双向消息传递。
 *
 * 在已连接状态下运行 /remote-control 会显示一个对话框，其中包含会话 URL 以及断开连接或继续的选项。 */
function BridgeToggle({ onDone, name }: Props): React.ReactNode {
  const setAppState = useSetAppState();
  const replBridgeConnected = useAppState(s => s.replBridgeConnected);
  const replBridgeEnabled = useAppState(s => s.replBridgeEnabled);
  const replBridgeOutboundOnly = useAppState(s => s.replBridgeOutboundOnly);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  useEffect(() => {
    // 如果已连接或在完全双向模式下启用，则显示
    // 断开连接确认。仅出站（CCR 镜像）不计入 —
    // /remote-control 会将其升级为完整的远程控制。
    if ((replBridgeConnected || replBridgeEnabled) && !replBridgeOutboundOnly) {
      setShowDisconnectDialog(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      // Pre-flight checks before enabling (awaits GrowthBook init if disk
      // cache is stale — so Max users don't get a false "not enabled" error)
      const error = await checkBridgePrerequisites();
      if (cancelled) return;
      if (error) {
        logEvent('tengu_bridge_command', {
          action: 'preflight_failed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
        onDone(error, { display: 'system' });
        return;
      }

      // 如果尚未看过，则显示首次远程控制对话框。
      // 现在存储名称，以便稍后标注处理程序启用桥接时它已在 AppState 中
      // （该处理程序仅设置 replBridgeEnabled，不设置名称）。
      if (shouldShowRemoteCallout()) {
        setAppState(prev => {
          if (prev.showRemoteCallout) return prev;
          return {
            ...prev,
            showRemoteCallout: true,
            replBridgeInitialName: name,
          };
        });
        onDone('', { display: 'system' });
        return;
      }

      // 启用桥接 — REPL.tsx 中的 useReplBridge 处理其余部分：
      // 注册环境，使用对话创建会话，连接 WebSocket
      logEvent('tengu_bridge_command', {
        action: 'connect' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      setAppState(prev => {
        if (prev.replBridgeEnabled && !prev.replBridgeOutboundOnly) return prev;
        return {
          ...prev,
          replBridgeEnabled: true,
          replBridgeExplicit: true,
          replBridgeOutboundOnly: false,
          replBridgeInitialName: name,
        };
      });
      onDone('Remote Control connecting\u2026', {
        display: 'system',
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  if (showDisconnectDialog) {
    return <BridgeDisconnectDialog onDone={onDone} />;
  }

  return null;
}

/** * 当桥接已连接时使用 /remote-control 命令显示的对话框。
 * 显示会话 URL 并允许用户断开连接或继续。 */
function BridgeDisconnectDialog({ onDone }: Props): React.ReactNode {
  useRegisterOverlay('bridge-disconnect-dialog');
  const setAppState = useSetAppState();
  const sessionUrl = useAppState(s => s.replBridgeSessionUrl);
  const connectUrl = useAppState(s => s.replBridgeConnectUrl);
  const sessionActive = useAppState(s => s.replBridgeSessionActive);
  const [focusIndex, setFocusIndex] = useState(2);
  const [showQR, setShowQR] = useState(false);
  const [qrText, setQrText] = useState('');

  const displayUrl = sessionActive ? sessionUrl : connectUrl;

  // 当 URL 更改或二维码开关打开时生成二维码
  useEffect(() => {
    if (!showQR || !displayUrl) {
      setQrText('');
      return;
    }
    qrToString(displayUrl, {
      type: 'utf8',
      errorCorrectionLevel: 'L',
      small: true,
    } as Parameters<typeof qrToString>[1])
      .then(setQrText)
      .catch(() => setQrText(''));
  }, [showQR, displayUrl]);

  function handleDisconnect(): void {
    setAppState(prev => {
      if (!prev.replBridgeEnabled) return prev;
      return {
        ...prev,
        replBridgeEnabled: false,
        replBridgeExplicit: false,
        replBridgeOutboundOnly: false,
      };
    });
    logEvent('tengu_bridge_command', {
      action: 'disconnect' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    onDone(REMOTE_CONTROL_DISCONNECTED_MSG, { display: 'system' });
  }

  function handleShowQR(): void {
    setShowQR(prev => !prev);
  }

  function handleContinue(): void {
    onDone(undefined, { display: 'skip' });
  }

  const ITEM_COUNT = 3;

  useKeybindings(
    {
      'select:next': () => setFocusIndex(i => (i + 1) % ITEM_COUNT),
      'select:previous': () => setFocusIndex(i => (i - 1 + ITEM_COUNT) % ITEM_COUNT),
      'select:accept': () => {
        if (focusIndex === 0) {
          handleDisconnect();
        } else if (focusIndex === 1) {
          handleShowQR();
        } else {
          handleContinue();
        }
      },
    },
    { context: 'Select' },
  );

  const qrLines = qrText ? qrText.split('\n').filter(l => l.length > 0) : [];

  return (
    <Dialog title="远程控制" onCancel={handleContinue} hideInputGuide>
      <Box flexDirection="column" gap={1}>
        <Text>此会话可通过远程控制访问{displayUrl ? ` 位于 ${displayUrl}` : ''}.</Text>
        {showQR && qrLines.length > 0 && (
          <Box flexDirection="column">
            {qrLines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        )}
        <Box flexDirection="column">
          <ListItem isFocused={focusIndex === 0}>
            <Text>断开此会话</Text>
          </ListItem>
          <ListItem isFocused={focusIndex === 1}>
            <Text>{showQR ? '隐藏二维码' : '显示二维码'}</Text>
          </ListItem>
          <ListItem isFocused={focusIndex === 2}>
            <Text>Continue</Text>
          </ListItem>
        </Box>
        <Text dimColor>按 Enter 键选择 · 按 Esc 键继续</Text>
      </Box>
    </Dialog>
  );
}

/** * 检查桥接先决条件。如果前提条件失败，则返回错误消息；
 * 如果所有检查通过，则返回 null。如果磁盘缓存过期，则等待 GrowthBook 初始化，
 * 以便刚刚获得资格的用户（例如升级到 Max，或功能刚上线）在第一次尝试时获得准确的结果。 */
async function checkBridgePrerequisites(): Promise<string | null> {
  // Check organization policy — remote control may be disabled
  const { waitForPolicyLimitsToLoad, isPolicyAllowed } = await import('../../services/policyLimits/index.js');
  await waitForPolicyLimitsToLoad();
  if (!isPolicyAllowed('allow_remote_control')) {
    return "Remote Control is disabled by your organization's policy.";
  }

  const disabledReason = await getBridgeDisabledReason();
  if (disabledReason) {
    return disabledReason;
  }

  // Mirror the v1/v2 branching logic in initReplBridge: env-less (v2) is used
  // only when the flag is on AND the session is not perpetual.  In assistant
  // mode (KAIROS) useReplBridge sets perpetual=true, which forces
  // initReplBridge onto the v1 path — so the prerequisite check must match.
  let useV2 = isEnvLessBridgeEnabled();
  if (feature('KAIROS') && useV2) {
    const { isAssistantMode } = await import('../../assistant/index.js');
    if (isAssistantMode()) {
      useV2 = false;
    }
  }
  const versionError = useV2 ? await checkEnvLessBridgeMinVersion() : checkBridgeMinVersion();
  if (versionError) {
    return versionError;
  }

  if (!getBridgeAccessToken()) {
    return BRIDGE_LOGIN_INSTRUCTION;
  }

  logForDebugging('[bridge] Prerequisites passed, enabling bridge');
  return null;
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const name = args.trim() || undefined;
  return <BridgeToggle onDone={onDone} name={name} />;
}
