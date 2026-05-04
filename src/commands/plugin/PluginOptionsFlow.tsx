/** 安装后/启用后配置提示。

给定一个 LoadedPlugin，检查顶层清单的 userConfig 和特定频道的 userConfig。引导 PluginOptionsDialog 遍历每个未配置项，通过相应的存储函数保存。如果无需填写任何内容，则立即调用 onDone('skipped')。 */

import * as React from 'react';
import type { LoadedPlugin } from '../../types/plugin.js';
import { errorMessage } from '../../utils/errors.js';
import { loadMcpServerUserConfig, saveMcpServerUserConfig } from '../../utils/plugins/mcpbHandler.js';
import { getUnconfiguredChannels, type UnconfiguredChannel } from '../../utils/plugins/mcpPluginIntegration.js';
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js';
import {
  getUnconfiguredOptions,
  loadPluginOptions,
  type PluginOptionSchema,
  type PluginOptionValues,
  savePluginOptions,
} from '../../utils/plugins/pluginOptionsStorage.js';
import { PluginOptionsDialog } from './PluginOptionsDialog.js';

/**
 * Post-install lookup: return the LoadedPlugin for the just-installed
 * pluginId so the caller can divert to PluginOptionsFlow. Returns undefined
 * if the plugin somehow didn't make it into the fresh load — callers treat
 * undefined as "carry on closing."
 *
 * Install should have cleared caches already; loadAllPlugins reads fresh.
 */
export async function findPluginOptionsTarget(pluginId: string): Promise<LoadedPlugin | undefined> {
  const { enabled, disabled } = await loadAllPlugins();
  return [...enabled, ...disabled].find(p => p.repository === pluginId || p.source === pluginId);
}

/** 遍历过程中的单个对话框步骤。顶层选项和频道配置都归结为此结构 —— 唯一的区别在于运行哪个保存函数。 */
type ConfigStep = {
  key: string;
  title: string;
  subtitle: string;
  schema: PluginOptionSchema;
  /** Returns any already-saved values so PluginOptionsDialog can pre-fill and
   *  skip unchanged sensitive fields on reconfigure. */
  load: () => PluginOptionValues | undefined;
  save: (values: PluginOptionValues) => void;
};

type Props = {
  plugin: LoadedPlugin;
  /** `name@marketplace` — the savePluginOptions / saveMcpServerUserConfig key. */
  pluginId: string;
  /**
   * `configured` = user filled all fields. `skipped` = nothing needed
   * configuring, or user hit cancel. `error` = save threw.
   */
  onDone: (outcome: 'configured' | 'skipped' | 'error', detail?: string) => void;
};

export function PluginOptionsFlow({ plugin, pluginId, onDone }: Props): React.ReactNode {
  // Build the step list once at mount. Re-calling after a save would drop the
  // item we just configured.
  const [steps] = React.useState<ConfigStep[]>(() => {
    const result: ConfigStep[] = [];

    // Top-level manifest.userConfig
    const unconfigured = getUnconfiguredOptions(plugin);
    if (Object.keys(unconfigured).length > 0) {
      result.push({
        key: 'top-level',
        title: `Configure ${plugin.name}`,
        subtitle: '插件选项',
        schema: unconfigured,
        load: () => loadPluginOptions(pluginId),
        save: values => savePluginOptions(pluginId, values, plugin.manifest.userConfig!),
      });
    }

    // Per-channel userConfig (assistant-mode channels)
    const channels: UnconfiguredChannel[] = getUnconfiguredChannels(plugin);
    for (const channel of channels) {
      result.push({
        key: `channel:${channel.server}`,
        title: `Configure ${channel.displayName}`,
        subtitle: `Plugin: ${plugin.name}`,
        schema: channel.configSchema,
        load: () => loadMcpServerUserConfig(pluginId, channel.server) ?? undefined,
        save: values => saveMcpServerUserConfig(pluginId, channel.server, values, channel.configSchema),
      });
    }

    return result;
  });

  const [index, setIndex] = React.useState(0);

  // Latest-ref: lets the effect close over the current onDone without
  // re-running when the parent re-renders.
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;

  // 无需配置 → 通知调用方且不渲染任何内容。使用 effect 而
  // 非内联调用：在渲染期间调用父组件的 setState 违反了
  // React 的 Hooks 规则。
  React.useEffect(() => {
    if (steps.length === 0) {
      onDoneRef.current('skipped');
    }
  }, [steps.length]);

  if (steps.length === 0) {
    return null;
  }

  const current = steps[index]!;

  function handleSave(values: PluginOptionValues): void {
    try {
      current.save(values);
    } catch (err) {
      onDone('error', errorMessage(err));
      return;
    }
    const next = index + 1;
    if (next < steps.length) {
      setIndex(next);
    } else {
      onDone('configured');
    }
  }

  // key 在前进到下一步时强制重新挂载 —— 否则 React
  // 会复用实例并保留 PluginOptionsDialog
  // 内部的 useState（字段索引、输入值）。
  return (
    <PluginOptionsDialog
      key={current.key}
      title={current.title}
      subtitle={current.subtitle}
      configSchema={current.schema}
      initialValues={current.load()}
      onSave={handleSave}
      onCancel={() => onDone('skipped')}
    />
  );
}
