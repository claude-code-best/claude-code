import chalk from 'chalk';
import { randomBytes } from 'crypto';
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { homedir, platform } from 'os';
import { dirname, join } from 'path';
import type { ThemeName } from 'src/utils/theme.js';
import { pathToFileURL } from 'url';
import { supportsHyperlinks } from '@anthropic/ink';
import { color } from '@anthropic/ink';
import { maybeMarkProjectOnboardingComplete } from '../../projectOnboardingState.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import {
  backupTerminalPreferences,
  checkAndRestoreTerminalBackup,
  getTerminalPlistPath,
  markTerminalSetupComplete,
} from '../../utils/appleTerminalBackup.js';
import { setupShellCompletion } from '../../utils/completionCache.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { env } from '../../utils/env.js';
import { isFsInaccessible } from '../../utils/errors.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { addItemToJSONCArray, safeParseJSONC } from '../../utils/json.js';
import { logError } from '../../utils/log.js';
import { getPlatform } from '../../utils/platform.js';
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js';

const EOL = '\n';

// 原生支持 CSI u / Kitty 键盘协议的终端
const NATIVE_CSIU_TERMINALS: Record<string, string> = {
  ghostty: 'Ghostty',
  kitty: 'Kitty',
  'iTerm.app': 'iTerm2',
  WezTerm: 'WezTerm',
  WarpTerminal: 'Warp',
};

/**
 * Detect if we're running in a VSCode Remote SSH session.
 * In this case, keybindings need to be installed on the LOCAL machine,
 * not the remote server where Claude is running.
 */
function isVSCodeRemoteSSH(): boolean {
  const askpassMain = process.env.VSCODE_GIT_ASKPASS_MAIN ?? '';
  const path = process.env.PATH ?? '';

  // 检查两个环境变量 - VSCODE_GIT_ASKPASS_MAIN 在 git 扩
  // 展激活时更可靠，PATH 是备用方案。省略路径分隔符以确保 Windows 兼容性。
  return (
    askpassMain.includes('.vscode-server') ||
    askpassMain.includes('.cursor-server') ||
    askpassMain.includes('.windsurf-server') ||
    path.includes('.vscode-server') ||
    path.includes('.cursor-server') ||
    path.includes('.windsurf-server')
  );
}

export function getNativeCSIuTerminalDisplayName(): string | null {
  if (!env.terminal || !(env.terminal in NATIVE_CSIU_TERMINALS)) {
    return null;
  }
  return NATIVE_CSIU_TERMINALS[env.terminal] ?? null;
}

/** 将文件路径格式化为可点击的超链接。

包含空格的路径（例如 "Application Support"）在大多数终端中不可点击 - 它们会在空格处被分割。OSC 8 超链接通过嵌入一个 file:// URL 来解决此问题，终端可以点击打开，同时向用户显示干净的路径。

与 createHyperlink() 不同，此方法不应用任何颜色样式，因此路径会继承父级的样式（例如 chalk.dim）。 */
function formatPathLink(filePath: string): string {
  if (!supportsHyperlinks()) {
    return filePath;
  }
  const fileUrl = pathToFileURL(filePath).href;
  // OSC 8 hyperlink: \e]8;;URL\a TEXT \e]8;;\a
  return `\x1b]8;;${fileUrl}\x07${filePath}\x1b]8;;\x07`;
}

export function shouldOfferTerminalSetup(): boolean {
  // iTerm2、WezTerm、Ghostty、Kitty 和 Warp 原生支持
  // CSI u / Kitty 键盘协议，Claude Code 已能解析。这些终
  // 端无需额外设置。
  return (
    (platform() === 'darwin' && env.terminal === 'Apple_Terminal') ||
    env.terminal === 'vscode' ||
    env.terminal === 'cursor' ||
    env.terminal === 'windsurf' ||
    env.terminal === 'alacritty' ||
    env.terminal === 'zed'
  );
}

export async function setupTerminal(theme: ThemeName): Promise<string> {
  let result = '';

  switch (env.terminal) {
    case 'Apple_Terminal':
      result = await enableOptionAsMetaForTerminal(theme);
      break;
    case 'vscode':
      result = await installBindingsForVSCodeTerminal('VSCode', theme);
      break;
    case 'cursor':
      result = await installBindingsForVSCodeTerminal('Cursor', theme);
      break;
    case 'windsurf':
      result = await installBindingsForVSCodeTerminal('Windsurf', theme);
      break;
    case 'alacritty':
      result = await installBindingsForAlacritty(theme);
      break;
    case 'zed':
      result = await installBindingsForZed(theme);
      break;
    case null:
      break;
  }

  saveGlobalConfig(current => {
    if (['vscode', 'cursor', 'windsurf', 'alacritty', 'zed'].includes(env.terminal ?? '')) {
      if (current.shiftEnterKeyBindingInstalled === true) return current;
      return { ...current, shiftEnterKeyBindingInstalled: true };
    } else if (env.terminal === 'Apple_Terminal') {
      if (current.optionAsMetaKeyInstalled === true) return current;
      return { ...current, optionAsMetaKeyInstalled: true };
    }
    return current;
  });

  maybeMarkProjectOnboardingComplete();

  // 安装 shell 补全（仅限 ant，因为补全命令仅限 ant）
  if (process.env.USER_TYPE === 'ant') {
    result += await setupShellCompletion(theme);
  }

  return result;
}

export function isShiftEnterKeyBindingInstalled(): boolean {
  return getGlobalConfig().shiftEnterKeyBindingInstalled === true;
}

export function hasUsedBackslashReturn(): boolean {
  return getGlobalConfig().hasUsedBackslashReturn === true;
}

export function markBackslashReturnUsed(): void {
  const config = getGlobalConfig();
  if (!config.hasUsedBackslashReturn) {
    saveGlobalConfig(current => ({
      ...current,
      hasUsedBackslashReturn: true,
    }));
  }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  _args: string,
): Promise<null> {
  if (env.terminal && env.terminal in NATIVE_CSIU_TERMINALS) {
    const message = `Shift+Enter 在 ${NATIVE_CSIU_TERMINALS[env.terminal]} 中原生支持。

No configuration needed. Just use Shift+Enter to add newlines.`;
    onDone(message);
    return null;
  }

  // 检查终端是否受支持
  if (!shouldOfferTerminalSetup()) {
    const terminalName = env.terminal || 'your current terminal';
    const currentPlatform = getPlatform();

    // Build platform-specific terminal suggestions
    let platformTerminals = '';
    if (currentPlatform === 'macos') {
      platformTerminals = '   • macOS: Apple Terminal\n';
    } else if (currentPlatform === 'windows') {
      platformTerminals = '   • Windows: Windows Terminal\n';
    }
    // 对于 Linux 和其他平台，我们不显示原生终端
    // 选项，因为它们目前不受支持

    const message = `无法从 ${terminalName} 运行终端设置。

此命令为多行提示配置便捷的 Shift+Enter 快捷键。
${chalk.dim('Note: You can already use backslash (\\\\) + return to add newlines.')}

要设置快捷键（可选）：
1. 暂时退出 tmux/screen
2. 直接在以下任一终端中运行 /terminal-setup：
${platformTerminals}   • IDE: VSCode, Cursor, Windsurf, Zed
   • 其他: Alacritty
3. 返回 tmux/screen - 设置将持久保存

${chalk.dim('Note: iTerm2, WezTerm, Ghostty, Kitty, and Warp support Shift+Enter natively.')}`;
    onDone(message);
    return null;
  }

  const result = await setupTerminal(context.options.theme);
  onDone(result);
  return null;
}

type VSCodeKeybinding = {
  key: string;
  command: string;
  args: { text: string };
  when: string;
};

async function installBindingsForVSCodeTerminal(
  editor: 'VSCode' | 'Cursor' | 'Windsurf' = 'VSCode',
  theme: ThemeName,
): Promise<string> {
  // 检查是否在 VSCode Remote SS
  // H 会话中运行 在这种情况下，快捷键需要安装在本地机器上
  if (isVSCodeRemoteSSH()) {
    return `${color(
      'warning',
      theme,
    )(
      `Cannot install keybindings from a remote ${editor} session.`,
    )}${EOL}${EOL}${editor} 快捷键必须安装在您的本地机器上，而不是远程服务器上。${EOL}${EOL}要安装 Shift+Enter 快捷键：${EOL}1. 在您的本地机器上打开 ${editor}（未连接到远程）${EOL}2. 打开命令面板 (Cmd/Ctrl+Shift+P) → "Preferences: Open Keyboard Shortcuts (JSON)"${EOL}3. 添加此快捷键（文件必须是 JSON 数组）：${EOL}${EOL}${chalk.dim(`[
  {
    "key": "shift+enter",
    "command": "workbench.action.terminal.sendSequence",
    "args": { "text": "\\u001b\\r" },
    "when": "terminalFocus"
  }
]`)}${EOL}`;
  }

  const editorDir = editor === 'VSCode' ? 'Code' : editor;
  const userDirPath = join(
    homedir(),
    platform() === 'win32'
      ? join('AppData', 'Roaming', editorDir, 'User')
      : platform() === 'darwin'
        ? join('Library', 'Application Support', editorDir, 'User')
        : join('.config', editorDir, 'User'),
  );
  const keybindingsPath = join(userDirPath, 'keybindings.json');

  try {
    // Ensure user directory exists (idempotent with recursive)
    await mkdir(userDirPath, { recursive: true });

    // Read existing keybindings file, or default to empty array if it doesn't exist
    let content = '[]';
    let keybindings: VSCodeKeybinding[] = [];
    let fileExists = false;
    try {
      content = await readFile(keybindingsPath, { encoding: 'utf-8' });
      fileExists = true;
      keybindings = (safeParseJSONC(content) as VSCodeKeybinding[]) ?? [];
    } catch (e: unknown) {
      if (!isFsInaccessible(e)) throw e;
    }

    // 在修改前备份现有文件
    if (fileExists) {
      const randomSha = randomBytes(4).toString('hex');
      const backupPath = `${keybindingsPath}.${randomSha}.bak`;
      try {
        await copyFile(keybindingsPath, backupPath);
      } catch {
        return `${color(
          'warning',
          theme,
        )(
          `Error backing up existing ${editor} terminal keybindings. Bailing out.`,
        )}${EOL}${chalk.dim(`See ${formatPathLink(keybindingsPath)}`)}${EOL}${chalk.dim(`Backup path: ${formatPathLink(backupPath)}`)}${EOL}`;
      }
    }

    // 检查快捷键是否已存在
    const existingBinding = keybindings.find(
      binding =>
        binding.key === 'shift+enter' &&
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.when === 'terminalFocus',
    );
    if (existingBinding) {
      return `${color(
        'warning',
        theme,
      )(
        `Found existing ${editor} terminal Shift+Enter key binding. Remove it to continue.`,
      )}${EOL}${chalk.dim(`See ${formatPathLink(keybindingsPath)}`)}${EOL}`;
    }

    // 创建新的快捷键
    const newKeybinding: VSCodeKeybinding = {
      key: 'shift+enter',
      command: 'workbench.action.terminal.sendSequence',
      args: { text: '\u001b\r' },
      when: 'terminalFocus',
    };

    // Modify the content by adding the new keybinding while preserving comments and formatting
    const updatedContent = addItemToJSONCArray(content, newKeybinding);

    // Write the updated content back to the file
    await writeFile(keybindingsPath, updatedContent, { encoding: 'utf-8' });

    return `${color(
      'success',
      theme,
    )(
      `Installed ${editor} terminal Shift+Enter key binding`,
    )}${EOL}${chalk.dim(`See ${formatPathLink(keybindingsPath)}`)}${EOL}`;
  } catch (error) {
    logError(error);
    throw new Error(`Failed to install ${editor} terminal Shift+Enter key binding`);
  }
}

async function enableOptionAsMetaForProfile(profileName: string): Promise<boolean> {
  // First try to add the property (in case it doesn't exist)
  // Quote the profile name to handle names with spaces (e.g., "Man Page", "Red Sands")
  const { code: addCode } = await execFileNoThrow('/usr/libexec/PlistBuddy', [
    '-c',
    `添加 :'Window Settings':'${profileName}':useOptionAsMetaKey bool true`,
    getTerminalPlistPath(),
  ]);

  // 如果添加失败（很可能是因为它已存在），请尝试设置它
  if (addCode !== 0) {
    const { code: setCode } = await execFileNoThrow('/usr/libexec/PlistBuddy', [
      '-c',
      `设置 :'Window Settings':'${profileName}':useOptionAsMetaKey true`,
      getTerminalPlistPath(),
    ]);

    if (setCode !== 0) {
      logError(new Error(`Failed to enable Option as Meta key for Terminal.app profile: ${profileName}`));
      return false;
    }
  }

  return true;
}

async function disableAudioBellForProfile(profileName: string): Promise<boolean> {
  // First try to add the property (in case it doesn't exist)
  // Quote the profile name to handle names with spaces (e.g., "Man Page", "Red Sands")
  const { code: addCode } = await execFileNoThrow('/usr/libexec/PlistBuddy', [
    '-c',
    `添加 :'Window Settings':'${profileName}':Bell bool false`,
    getTerminalPlistPath(),
  ]);

  // 如果添加失败（很可能是因为它已存在），请尝试设置它
  if (addCode !== 0) {
    const { code: setCode } = await execFileNoThrow('/usr/libexec/PlistBuddy', [
      '-c',
      `设置 :'Window Settings':'${profileName}':Bell false`,
      getTerminalPlistPath(),
    ]);

    if (setCode !== 0) {
      logError(new Error(`Failed to disable audio bell for Terminal.app profile: ${profileName}`));
      return false;
    }
  }

  return true;
}

// Enable Option as Meta key for Terminal.app
async function enableOptionAsMetaForTerminal(theme: ThemeName): Promise<string> {
  try {
    // Create a backup of the current plist file
    const backupPath = await backupTerminalPreferences();
    if (!backupPath) {
      throw new Error('Failed to create backup of Terminal.app preferences, bailing out');
    }

    // Read the current default profile from the plist
    const { stdout: defaultProfile, code: readCode } = await execFileNoThrow('defaults', [
      'read',
      'com.apple.Terminal',
      'Default Window Settings',
    ]);

    if (readCode !== 0 || !defaultProfile.trim()) {
      throw new Error('Failed to read default Terminal.app profile');
    }

    const { stdout: startupProfile, code: startupCode } = await execFileNoThrow('defaults', [
      'read',
      'com.apple.Terminal',
      'Startup Window Settings',
    ]);
    if (startupCode !== 0 || !startupProfile.trim()) {
      throw new Error('Failed to read startup Terminal.app profile');
    }

    let wasAnyProfileUpdated = false;

    const defaultProfileName = defaultProfile.trim();
    const optionAsMetaEnabled = await enableOptionAsMetaForProfile(defaultProfileName);
    const audioBellDisabled = await disableAudioBellForProfile(defaultProfileName);

    if (optionAsMetaEnabled || audioBellDisabled) {
      wasAnyProfileUpdated = true;
    }

    const startupProfileName = startupProfile.trim();

    // 仅当启动配置文件与默认配置文件不同时才继续
    if (startupProfileName !== defaultProfileName) {
      const startupOptionAsMetaEnabled = await enableOptionAsMetaForProfile(startupProfileName);
      const startupAudioBellDisabled = await disableAudioBellForProfile(startupProfileName);

      if (startupOptionAsMetaEnabled || startupAudioBellDisabled) {
        wasAnyProfileUpdated = true;
      }
    }

    if (!wasAnyProfileUpdated) {
      throw new Error('Failed to enable Option as Meta key or disable audio bell for any Terminal.app profile');
    }

    // Flush the preferences cache
    await execFileNoThrow('killall', ['cfprefsd']);

    markTerminalSetupComplete();

    return `${color(
      'success',
      theme,
    )(
      `Configured Terminal.app settings:`,
    )}${EOL}${color('success', theme)('- Enabled "Use Option as Meta key"')}${EOL}${color('success', theme)('- Switched to visual bell')}${EOL}${chalk.dim('Option+Enter will now enter a newline.')}${EOL}${chalk.dim('You must restart Terminal.app for changes to take effect.', theme)}${EOL}`;
  } catch (error) {
    logError(error);

    // Attempt to restore from backup
    const restoreResult = await checkAndRestoreTerminalBackup();

    const errorMessage = 'Failed to enable Option as Meta key for Terminal.app.';
    if (restoreResult.status === 'restored') {
      throw new Error(`${errorMessage} Your settings have been restored from backup.`);
    } else if (restoreResult.status === 'failed') {
      throw new Error(
        `${errorMessage} Restoring from backup failed, try manually with: defaults import com.apple.Terminal ${restoreResult.backupPath}`,
      );
    } else {
      throw new Error(`${errorMessage} No backup was available to restore from.`);
    }
  }
}

async function installBindingsForAlacritty(theme: ThemeName): Promise<string> {
  const ALACRITTY_KEYBINDING = `[[keyboard.bindings]]
key = "Return"
mods = "Shift"
chars = "\\u001B\\r"`;

  // Get Alacritty config file paths in order of preference
  const configPaths: string[] = [];

  // XDG config path (Linux and macOS)
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome) {
    configPaths.push(join(xdgConfigHome, 'alacritty', 'alacritty.toml'));
  } else {
    configPaths.push(join(homedir(), '.config', 'alacritty', 'alacritty.toml'));
  }

  // Windows 特定路径
  if (platform() === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) {
      configPaths.push(join(appData, 'alacritty', 'alacritty.toml'));
    }
  }

  // Find existing config file by attempting to read it, or use first preferred path
  let configPath: string | null = null;
  let configContent = '';
  let configExists = false;

  for (const path of configPaths) {
    try {
      configContent = await readFile(path, { encoding: 'utf-8' });
      configPath = path;
      configExists = true;
      break;
    } catch (e: unknown) {
      if (!isFsInaccessible(e)) throw e;
      // File missing or inaccessible — try next config path
    }
  }

  // 如果不存在配置文件，则使用第一个路径（XDG/默认位置）
  if (!configPath) {
    configPath = configPaths[0] ?? null;
  }

  if (!configPath) {
    throw new Error('No valid config path found for Alacritty');
  }

  try {
    if (configExists) {
      // Check if keybinding already exists (look for Shift+Return binding)
      if (configContent.includes('mods = "Shift"') && configContent.includes('key = "Return"')) {
        return `${color(
          'warning',
          theme,
        )(
          'Found existing Alacritty Shift+Enter key binding. Remove it to continue.',
        )}${EOL}${chalk.dim(`See ${formatPathLink(configPath)}`)}${EOL}`;
      }

      // Create backup
      const randomSha = randomBytes(4).toString('hex');
      const backupPath = `${configPath}.${randomSha}.bak`;
      try {
        await copyFile(configPath, backupPath);
      } catch {
        return `${color(
          'warning',
          theme,
        )(
          'Error backing up existing Alacritty config. Bailing out.',
        )}${EOL}${chalk.dim(`See ${formatPathLink(configPath)}`)}${EOL}${chalk.dim(`Backup path: ${formatPathLink(backupPath)}`)}${EOL}`;
      }
    } else {
      // Ensure config directory exists (idempotent with recursive)
      await mkdir(dirname(configPath), { recursive: true });
    }

    // Add the keybinding to the config
    let updatedContent = configContent;
    if (configContent && !configContent.endsWith('\n')) {
      updatedContent += '\n';
    }
    updatedContent += '\n' + ALACRITTY_KEYBINDING + '\n';

    // Write the updated config
    await writeFile(configPath, updatedContent, { encoding: 'utf-8' });

    return `${color('success', theme)('Installed Alacritty Shift+Enter key binding')}${EOL}${color(
      'success',
      theme,
    )(
      'You may need to restart Alacritty for changes to take effect',
    )}${EOL}${chalk.dim(`See ${formatPathLink(configPath)}`)}${EOL}`;
  } catch (error) {
    logError(error);
    throw new Error('Failed to install Alacritty Shift+Enter key binding');
  }
}

async function installBindingsForZed(theme: ThemeName): Promise<string> {
  // Zed uses JSON keybindings similar to VSCode
  const zedDir = join(homedir(), '.config', 'zed');
  const keymapPath = join(zedDir, 'keymap.json');

  try {
    // Ensure zed directory exists (idempotent with recursive)
    await mkdir(zedDir, { recursive: true });

    // Read existing keymap file, or default to empty array if it doesn't exist
    let keymapContent = '[]';
    let fileExists = false;
    try {
      keymapContent = await readFile(keymapPath, { encoding: 'utf-8' });
      fileExists = true;
    } catch (e: unknown) {
      if (!isFsInaccessible(e)) throw e;
    }

    if (fileExists) {
      // 检查按键绑定是否已存在
      if (keymapContent.includes('shift-enter')) {
        return `${color(
          'warning',
          theme,
        )(
          'Found existing Zed Shift+Enter key binding. Remove it to continue.',
        )}${EOL}${chalk.dim(`See ${formatPathLink(keymapPath)}`)}${EOL}`;
      }

      // Create backup
      const randomSha = randomBytes(4).toString('hex');
      const backupPath = `${keymapPath}.${randomSha}.bak`;
      try {
        await copyFile(keymapPath, backupPath);
      } catch {
        return `${color(
          'warning',
          theme,
        )(
          'Error backing up existing Zed keymap. Bailing out.',
        )}${EOL}${chalk.dim(`See ${formatPathLink(keymapPath)}`)}${EOL}${chalk.dim(`Backup path: ${formatPathLink(backupPath)}`)}${EOL}`;
      }
    }

    // 解析并修改键位映射
    let keymap: Array<{
      context?: string;
      bindings: Record<string, string | string[]>;
    }>;
    try {
      keymap = jsonParse(keymapContent);
      if (!Array.isArray(keymap)) {
        keymap = [];
      }
    } catch {
      keymap = [];
    }

    // 为终端上下文添加新的按键绑定
    keymap.push({
      context: 'Terminal',
      bindings: {
        'shift-enter': ['terminal::SendText', '\u001b\r'],
      },
    });

    // 写入更新后的键位映射
    await writeFile(keymapPath, jsonStringify(keymap, null, 2) + '\n', {
      encoding: 'utf-8',
    });

    return `${color(
      'success',
      theme,
    )('Installed Zed Shift+Enter key binding')}${EOL}${chalk.dim(`See ${formatPathLink(keymapPath)}`)}${EOL}`;
  } catch (error) {
    logError(error);
    throw new Error('Failed to install Zed Shift+Enter key binding');
  }
}
