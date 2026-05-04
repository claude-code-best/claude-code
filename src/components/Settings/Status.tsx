import figures from 'figures';
import * as React from 'react';
import { Suspense, use } from 'react';
import { getSessionId } from '../../bootstrap/state.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { useIsInsideModal } from '../../context/modalContext.js';
import { Box, Text, useTheme } from '@anthropic/ink';
import { type AppState, useAppState } from '../../state/AppState.js';
import { getCwd } from '../../utils/cwd.js';
import { getCurrentSessionTitle } from '../../utils/sessionStorage.js';
import {
  buildAccountProperties,
  buildAPIProviderProperties,
  buildIDEProperties,
  buildInstallationDiagnostics,
  buildInstallationHealthDiagnostics,
  buildMcpProperties,
  buildMemoryDiagnostics,
  buildSandboxProperties,
  buildSettingSourcesProperties,
  type Diagnostic,
  getModelDisplayLabel,
  type Property,
} from '../../utils/status.js';
import type { ThemeName } from '../../utils/theme.js';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';

type Props = {
  context: LocalJSXCommandContext;
  diagnosticsPromise: Promise<Diagnostic[]>;
};

function buildPrimarySection(): Property[] {
  const sessionId = getSessionId();
  const customTitle = getCurrentSessionTitle(sessionId);
  const nameValue = customTitle ?? <Text dimColor>/rename to add a name</Text>;

  return [
    { label: 'Version', value: MACRO.VERSION },
    { label: 'Session name', value: nameValue },
    { label: 'Session ID', value: sessionId },
    { label: 'cwd', value: getCwd() },
    ...buildAccountProperties(),
    ...buildAPIProviderProperties(),
  ];
}

function buildSecondarySection({
  mainLoopModel,
  mcp,
  theme,
  context,
}: {
  mainLoopModel: AppState['mainLoopModel'];
  mcp: AppState['mcp'];
  theme: ThemeName;
  context: LocalJSXCommandContext;
}): Property[] {
  const modelLabel = getModelDisplayLabel(mainLoopModel);

  return [
    { label: 'Model', value: modelLabel },
    ...buildIDEProperties(mcp.clients, context.options.ideInstallationStatus, theme),
    ...buildMcpProperties(mcp.clients, theme),
    ...buildSandboxProperties(),
    ...buildSettingSourcesProperties(),
  ];
}

export async function buildDiagnostics(): Promise<Diagnostic[]> {
  return [
    ...(await buildInstallationDiagnostics()),
    ...(await buildInstallationHealthDiagnostics()),
    ...(await buildMemoryDiagnostics()),
  ];
}

function PropertyValue({ value }: { value: Property['value'] }): React.ReactNode {
  if (Array.isArray(value)) {
    return (
      <Box flexWrap="wrap" columnGap={1} flexShrink={99}>
        {value.map((item, i) => {
          return (
            <Text key={i}>
              {item}
              {i < value.length - 1 ? ',' : ''}
            </Text>
          );
        })}
      </Box>
    );
  }

  if (typeof value === 'string') {
    return <Text>{value}</Text>;
  }

  return value;
}

export function Status({ context, diagnosticsPromise }: Props): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel);
  const mcp = useAppState(s => s.mcp);
  const [theme] = useTheme();

  // Sections are synchronous — compute in render so they're never empty.
  // diagnosticsPromise is created once in Settings.tsx so it resolves once
  // per pane invocation instead of re-fetching on every tab switch (Tab
  // unmounts children when not selected, which was causing the flash).
  const sections = React.useMemo(
    () => [buildPrimarySection(), buildSecondarySection({ mainLoopModel, mcp, theme, context })],
    [mainLoopModel, mcp, theme, context],
  );

  // flexGrow so the "Esc to cancel" footer pins to the bottom of the
  // Modal's inner ScrollBox when content is short. The ScrollBox content
  // wrapper has flexGrow:1 (fills at least the viewport), so this stretches
  // to match. Without it, short Status content floats at the top and the
  // footer sits mid-modal with 2-3 trailing blank rows below. Outside a
  // Modal (non-fullscreen), leave layout alone — no ScrollBox to fill.
  const grow = useIsInsideModal() ? 1 : undefined;

  return (
    <Box flexDirection="column" flexGrow={grow}>
      <Box flexDirection="column" gap={1} flexGrow={grow}>
        {sections.map(
          (properties, i) =>
            properties.length > 0 && (
              <Box key={i} flexDirection="column">
                {properties.map(({ label, value }, j) => (
                  <Box key={j} flexDirection="row" gap={1} flexShrink={0}>
                    {label !== undefined && <Text bold>{label}:</Text>}
                    <PropertyValue value={value} />
                  </Box>
                ))}
              </Box>
            ),
        )}

        <Suspense fallback={null}>
          <Diagnostics promise={diagnosticsPromise} />
        </Suspense>
      </Box>
      <Text dimColor>
        <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="cancel" />
      </Text>
    </Box>
  );
}

function Diagnostics({ promise }: { promise: Promise<Diagnostic[]> }): React.ReactNode {
  const diagnostics = use(promise);
  if (diagnostics.length === 0) return null;
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text bold>System Diagnostics</Text>
      {diagnostics.map((diagnostic, i) => (
        <Box key={i} flexDirection="row" gap={1} paddingX={1}>
          <Text color="error">{figures.warning}</Text>
          {typeof diagnostic === 'string' ? <Text wrap="wrap">{diagnostic}</Text> : diagnostic}
        </Box>
      ))}
    </Box>
  );
}
