import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from '@anthropic/ink';
import { Dialog } from '@anthropic/ink';
import { useRegisterOverlay } from '../../context/overlayContext.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { isSkillLearningEnabled } from '../../services/skillLearning/featureCheck.js';

type SkillAction = {
  label: string;
  description: string;
  run: () => Promise<string>;
};

const ACTION_LABEL_COLUMN_WIDTH = 28;

const ABOUT_TEXT = `# Skill Learning (自动学习)

Skill Learning 是一个闭环学习系统，通过观察用户的操作模式自动提取直觉(instinct)，
并在达到阈值后生成可复用的 skill 文件、agent 和 command。

## 工作流程
1. **Observe** — 记录每轮对话中的工具调用、用户纠正、错误解决模式
2. **Analyze** — 使用启发式或 LLM 后端分析观察数据，提取 instinct candidate
3. **Evolve** — 将高置信度 instinct 聚类，生成 skill/agent/command 候选
4. **Lifecycle** — 对生成的 skill 进行去重、版本比较、归档或替换

## 子命令
- /skill-learning status       — 查看当前项目的观察和直觉数量
- /skill-learning ingest       — 从 transcript 导入观察数据
- /skill-learning evolve       — 生成 skill 候选 (--generate 写入磁盘)
- /skill-learning export       — 导出 instinct 为 JSON
- /skill-learning import       — 导入 instinct JSON
- /skill-learning prune        — 清理过期的 pending instinct
- /skill-learning promote      — 将 instinct/gap 提升为全局范围
- /skill-learning projects     — 列出所有已知的项目范围

## 启用方式
- SKILL_LEARNING_ENABLED=1 或 FEATURE_SKILL_LEARNING=1
- 状态: ${isSkillLearningEnabled() ? '已启用' : '未启用'}
`;

async function getStatusText(): Promise<string> {
  const { readObservations, loadInstincts, resolveProjectContext } = await import(
    '../../services/skillLearning/index.js'
  );
  const project = resolveProjectContext(process.cwd());
  const [observations, instincts] = await Promise.all([readObservations({ project }), loadInstincts({ project })]);
  return [
    `Skill Learning status for ${project.projectName} (${project.projectId})`,
    `Observations: ${observations.length}`,
    `Instincts: ${instincts.length}`,
    '',
    `Skill Learning: ${isSkillLearningEnabled() ? 'enabled' : 'disabled'}`,
  ].join('\n');
}

async function startSkillLearning(): Promise<string> {
  const lines: string[] = [];

  if (!isSkillLearningEnabled()) {
    process.env.SKILL_LEARNING_ENABLED = '1';
    lines.push('Skill Learning: enabled (SKILL_LEARNING_ENABLED=1)');
  } else {
    lines.push('Skill Learning: already enabled');
  }

  try {
    const { initSkillLearning } = await import('../../services/skillLearning/runtimeObserver.js');
    initSkillLearning();
    lines.push('Runtime observer: initialized');
  } catch {
    lines.push('Runtime observer: init skipped (not available)');
  }

  return lines.join('\n');
}

async function stopSkillLearning(): Promise<string> {
  const lines: string[] = [];

  if (isSkillLearningEnabled()) {
    process.env.SKILL_LEARNING_ENABLED = '0';
    process.env.CLAUDE_SKILL_LEARNING_DISABLE = '1';
    lines.push('Skill Learning: disabled (SKILL_LEARNING_ENABLED=0)');
  } else {
    lines.push('Skill Learning: already disabled');
  }

  return lines.join('\n');
}

function SkillPanel({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  useRegisterOverlay('skill-panel');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions = useMemo<SkillAction[]>(
    () => [
      {
        label: 'Status',
        description: 'Show skill learning status for current project',
        run: getStatusText,
      },
      {
        label: 'Start',
        description: 'Enable skill learning for this session',
        run: startSkillLearning,
      },
      {
        label: 'Stop',
        description: 'Disable skill learning for this session',
        run: stopSkillLearning,
      },
      {
        label: 'About',
        description: 'Detailed description of skill learning features',
        run: () => Promise.resolve(ABOUT_TEXT),
      },
    ],
    [],
  );

  const selectCurrent = () => {
    const action = actions[selectedIndex];
    if (!action) return;
    void action.run().then(result => {
      onDone(result, { display: 'system' });
    });
  };

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(index => Math.max(0, index - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(index => Math.min(actions.length - 1, index + 1));
      return;
    }
    if (key.return) {
      selectCurrent();
    }
  });

  return (
    <Dialog
      title="Skill Learning"
      subtitle={`${actions.length} actions`}
      onCancel={() => onDone('Skill panel dismissed', { display: 'system' })}
      color="background"
      hideInputGuide
    >
      <Box flexDirection="column">
        {actions.map((action, index) => (
          <Box key={action.label} flexDirection="row">
            <Text>{`${index === selectedIndex ? '›' : ' '} ${action.label}`.padEnd(ACTION_LABEL_COLUMN_WIDTH)}</Text>
            <Text dimColor>{action.description}</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>↑/↓ select · Enter run · Esc close</Text>
        </Box>
      </Box>
    </Dialog>
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  const trimmed = args?.trim() ?? '';

  if (trimmed === 'start') {
    onDone(await startSkillLearning(), { display: 'system' });
    return null;
  }
  if (trimmed === 'stop') {
    onDone(await stopSkillLearning(), { display: 'system' });
    return null;
  }
  if (trimmed === 'about') {
    onDone(ABOUT_TEXT, { display: 'system' });
    return null;
  }
  if (trimmed === 'status') {
    onDone(await getStatusText(), { display: 'system' });
    return null;
  }

  if (trimmed) {
    const { call: textCall } = await import('./skill-learning.js');
    const result = await textCall(trimmed, {} as any);
    if (result && typeof result === 'object' && 'value' in result) {
      onDone((result as { value: string }).value, { display: 'system' });
    }
    return null;
  }

  return <SkillPanel onDone={onDone} />;
}
