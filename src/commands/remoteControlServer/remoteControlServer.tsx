import { type ChildProcess } from 'child_process';
import { resolve } from 'path';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { getBridgeDisabledReason, isBridgeEnabled } from '../../bridge/bridgeEnabled.js';
import { getBridgeAccessToken } from '../../bridge/bridgeConfig.js';
import { BRIDGE_LOGIN_INSTRUCTION } from '../../bridge/types.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { ListItem } from '../../components/design-system/ListItem.js';
import { useRegisterOverlay } from '../../context/overlayContext.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { buildCliLaunch, spawnCli } from '../../utils/cliLaunch.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { errorMessage } from '../../utils/errors.js';

type ServerStatus = 'stopped' | 'starting' | 'running' | 'error';

type Props = {
  onDone: LocalJSXCommandOnDone;
};

/**
 * /remote-control-server command — manages the daemon-backed persistent bridge server.
 *
 * When invoked, it starts the daemon supervisor as a child process, which in
 * turn spawns remoteControl workers that run headless bridge loops. The server
 * accepts multiple concurrent remote sessions.
 *
 * If the server is already running, shows a management dialog with status
 * and options to stop or continue.
 */

// Module-level state to track the daemon process across invocations
let daemonProcess: ChildProcess | null = null;
let daemonStatus: ServerStatus = 'stopped';
let daemonLogs: string[] = [];
const MAX_LOG_LINES = 50;

function RemoteControlServer({ onDone }: Props): React.ReactNode {
  const [status, setStatus] = useState<ServerStatus>(daemonStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already running, show management dialog
    if (daemonProcess && !daemonProcess.killed) {
      setStatus('running');
      return;
    }

    let cancelled = false;
    void (async () => {
      // Pre-flight checks
      const checkError = await checkPrerequisites();
      if (cancelled) return;
      if (checkError) {
        onDone(checkError, { display: 'system' });
        return;
      }

      // Start the daemon
      setStatus('starting');
      try {
        startDaemon();
        if (!cancelled) {
          setStatus('running');
          daemonStatus = 'running';
          onDone('Remote Control Server started. Use /remote-control-server to manage.', { display: 'system' });
        }
      } catch (err) {
        if (!cancelled) {
          const msg = errorMessage(err);
          setStatus('error');
          setError(msg);
          daemonStatus = 'error';
          onDone(`Remote Control Server failed to start: ${msg}`, {
            display: 'system',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'running' && daemonProcess && !daemonProcess.killed) {
    return <ServerManagementDialog onDone={onDone} />;
  }

  if (status === 'error' && error) {
    return null;
  }

  return null;
}

/**
 * Dialog shown when /remote-control-server is used while the daemon is running.
 */
function ServerManagementDialog({ onDone }: Props): React.ReactNode {
  useRegisterOverlay('remote-control-server-dialog');
  const [focusIndex, setFocusIndex] = useState(2);

  const logPreview = daemonLogs.slice(-5);

  function handleStop(): void {
    stopDaemon();
    onDone('Remote Control Server stopped.', { display: 'system' });
  }

  function handleRestart(): void {
    stopDaemon();
    try {
      startDaemon();
      onDone('Remote Control Server restarted.', { display: 'system' });
    } catch (err) {
      onDone(`Failed to restart: ${errorMessage(err)}`, { display: 'system' });
    }
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
          handleStop();
        } else if (focusIndex === 1) {
          handleRestart();
        } else {
          handleContinue();
        }
      },
    },
    { context: 'Select' },
  );

  return (
    <Dialog title="Remote Control Server" onCancel={handleContinue} hideInputGuide>
      <Box flexDirection="column" gap={1}>
        <Text>
          Remote Control Server is{' '}
          <Text bold color="success">
            running
          </Text>
          {daemonProcess ? ` (PID: ${daemonProcess.pid})` : ''}
        </Text>
        {logPreview.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor>Recent logs:</Text>
            {logPreview.map((line, i) => (
              <Text key={i} dimColor>
                {line}
              </Text>
            ))}
          </Box>
        )}
        <Box flexDirection="column">
          <ListItem isFocused={focusIndex === 0}>
            <Text>Stop server</Text>
          </ListItem>
          <ListItem isFocused={focusIndex === 1}>
            <Text>Restart server</Text>
          </ListItem>
          <ListItem isFocused={focusIndex === 2}>
            <Text>Continue</Text>
          </ListItem>
        </Box>
        <Text dimColor>Enter to select · Esc to continue</Text>
      </Box>
    </Dialog>
  );
}

/**
 * Check prerequisites for starting the Remote Control Server.
 */
async function checkPrerequisites(): Promise<string | null> {
  const disabledReason = await getBridgeDisabledReason();
  if (disabledReason) {
    return disabledReason;
  }

  if (!getBridgeAccessToken()) {
    return BRIDGE_LOGIN_INSTRUCTION;
  }

  return null;
}

/**
 * Start the daemon supervisor as a child process.
 */
function startDaemon(): void {
  const dir = resolve('.');

  const launch = buildCliLaunch(['daemon', 'start', `--dir=${dir}`]);

  const child = spawnCli(launch, {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  daemonProcess = child;
  daemonLogs = [];

  child.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      daemonLogs.push(line);
      if (daemonLogs.length > MAX_LOG_LINES) {
        daemonLogs.shift();
      }
    }
  });

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      daemonLogs.push(`[err] ${line}`);
      if (daemonLogs.length > MAX_LOG_LINES) {
        daemonLogs.shift();
      }
    }
  });

  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    daemonProcess = null;
    daemonStatus = 'stopped';
    daemonLogs.push(`[daemon] exited (code=${code ?? 'unknown'}, signal=${signal})`);
  });

  child.on('error', (err: Error) => {
    daemonProcess = null;
    daemonStatus = 'error';
    daemonLogs.push(`[daemon] error: ${err.message}`);
  });
}

/**
 * Stop the daemon supervisor.
 */
function stopDaemon(): void {
  if (daemonProcess && !daemonProcess.killed) {
    daemonProcess.kill('SIGTERM');
    // Force kill after 10s grace
    const pid = daemonProcess.pid;
    setTimeout(() => {
      try {
        if (pid) process.kill(pid, 0); // Check if still alive
        if (daemonProcess && !daemonProcess.killed) {
          daemonProcess.kill('SIGKILL');
        }
      } catch {
        // Process already gone
      }
    }, 10_000);
  }
  daemonProcess = null;
  daemonStatus = 'stopped';
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  _args: string,
): Promise<React.ReactNode> {
  return <RemoteControlServer onDone={onDone} />;
}
