import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProviderSettingsPage } from '../pages/ProviderSettingsPage';
import { PROVIDER_PRESETS, buildProviderMutation, stateFromPreset } from '../components/providers/providerForm';
import type { Environment } from '../types';

describe('provider settings forms', () => {
  test('offers cloud, domestic, compatible and fully custom presets', () => {
    const labels = PROVIDER_PRESETS.map(preset => preset.label).join(' ');
    for (const label of [
      'Claude / Anthropic',
      'OpenAI Compatible',
      'ChatGPT 订阅',
      'Google Gemini',
      'Amazon Bedrock',
      'Google Vertex AI',
      'Azure AI Foundry',
      'DeepSeek（国内）',
      '完全自定义',
    ]) {
      expect(labels).toContain(label);
    }
  });

  test('builds only non-secret provider profile fields', () => {
    const state = stateFromPreset('deepseek');
    const output = buildProviderMutation({
      ...state,
      id: 'deepseek',
      initialModelId: 'deepseek-reasoner',
    });
    expect(output.base_url).toBe('https://api.deepseek.com/v1');
    expect(JSON.stringify(output)).not.toContain('sk-test-secret');
    expect(() => buildProviderMutation({ ...state, id: 'bad id', baseUrl: 'not-a-url' })).toThrow();
  });
});

describe('ProviderSettingsPage', () => {
  test('renders environment isolation, default scope, models and archived history', () => {
    const environment: Environment = {
      id: 'environment-1',
      device_name: '开发 Mac',
      directory: '/workspace/repo',
      status: 'active',
      capabilities: {
        provider_model_catalog_v1: {
          version: 1,
          revision: 3,
          defaultModel: {
            providerId: 'custom-openai',
            modelProfileId: 'reasoner',
          },
          providers: [
            {
              id: 'custom-openai',
              displayName: '自定义 OpenAI',
              kind: 'openai-compatible',
              baseUrl: 'https://example.test/v1',
              auth: {
                scheme: 'api-key',
                source: 'settings',
                envName: 'CUSTOM_OPENAI_API_KEY',
                configured: true,
              },
              enabled: true,
              archived: false,
              models: [
                {
                  id: 'reasoner',
                  displayName: 'Reasoner',
                  remoteModelId: 'reasoner-v3',
                  enabled: true,
                  archived: false,
                  validation: { status: 'valid' },
                },
                {
                  id: 'old-model',
                  displayName: '历史模型',
                  remoteModelId: 'old-v1',
                  enabled: false,
                  archived: true,
                  validation: { status: 'valid' },
                },
              ],
            },
          ],
          features: {
            catalogWrite: true,
            sessionPersistence: true,
            runtimeSwitch: true,
            secretControl: false,
          },
        },
      },
    };
    const markup = renderToStaticMarkup(
      createElement(ProviderSettingsPage, {
        environments: [environment],
        onRefresh: () => {},
      }),
    );
    expect(markup).toContain('开发 Mac');
    expect(markup).toContain('只影响之后新建的对话');
    expect(markup).toContain('自定义 OpenAI / Reasoner');
    expect(markup).toContain('reasoner-v3');
    expect(markup).toContain('历史模型');
    expect(markup).not.toContain('sk-test-secret');
  });
});
