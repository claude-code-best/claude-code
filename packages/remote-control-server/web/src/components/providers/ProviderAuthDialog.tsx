import { useEffect, useMemo, useState } from 'react';
import {
  apiBeginProviderAuth,
  apiBeginProviderSecret,
  apiCancelProviderAuth,
  apiFetchProviderAuthStatus,
  apiRefreshProviderAuth,
  apiSubmitProviderSecret,
  apiSubmitProviderAuthCode,
} from '../../api/client';
import { ProviderAuthModel, type BrowserProviderAuthStatus } from '../../lib/provider-auth-model';
import { encryptProviderSecret, parseProviderSecretChallenge } from '../../lib/provider-secret';
import { generateMessageUuid } from '../../lib/utils';
import type { ProviderCatalogProfile } from '../../types';

export function ProviderAuthDialog({
  environmentId,
  provider,
  onClose,
  onChanged,
}: {
  environmentId: string;
  provider: ProviderCatalogProfile | null;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const model = useMemo(() => new ProviderAuthModel(), []);
  const [status, setStatus] = useState<BrowserProviderAuthStatus | null>(null);
  const [code, setCode] = useState('');
  const [secretMethod, setSecretMethod] = useState<string | null>(null);
  const [credential, setCredential] = useState('');
  const [secretBusy, setSecretBusy] = useState(false);
  const [secretSaved, setSecretSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!provider || !status || !['starting', 'waiting'].includes(status.state)) return;
    const timer = setTimeout(() => {
      void apiFetchProviderAuthStatus(environmentId, status.operationId)
        .then(response => {
          const next = model.apply(response);
          setStatus(next);
          if (next.state === 'succeeded') void onChanged();
        })
        .catch(reason => setError(reason instanceof Error ? reason.message : '认证状态读取失败'));
    }, model.pollDelay());
    return () => clearTimeout(timer);
  }, [environmentId, model, onChanged, provider, status]);
  if (!provider) return null;
  const begin = (method: string) => {
    const operationId = generateMessageUuid();
    setError(null);
    void apiBeginProviderAuth(environmentId, provider.id, { operation_id: operationId, method })
      .then(response => setStatus(model.apply(response)))
      .catch(reason => setError(reason instanceof Error ? reason.message : '认证启动失败'));
  };
  const close = () => {
    if (status && ['starting', 'waiting'].includes(status.state))
      void apiCancelProviderAuth(environmentId, status.operationId);
    setStatus(null);
    setCode('');
    setCredential('');
    setSecretMethod(null);
    setSecretSaved(false);
    onClose();
  };
  const saveSecret = async () => {
    if (!secretMethod) return;
    const value = credential;
    setCredential('');
    setSecretBusy(true);
    setError(null);
    try {
      const operationId = generateMessageUuid();
      const response = await apiBeginProviderSecret(environmentId, provider.id, {
        operation_id: operationId,
        method: secretMethod,
      });
      const challenge = parseProviderSecretChallenge(response.value);
      if (challenge.operationId !== operationId || challenge.expiresAt <= Date.now()) {
        throw new Error('一次性加密通道已失效，请重试');
      }
      const envelope = await encryptProviderSecret(challenge, value);
      await apiSubmitProviderSecret(environmentId, provider.id, {
        operation_id: operationId,
        method: secretMethod,
        envelope,
      });
      setSecretMethod(null);
      setSecretSaved(true);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '凭据保存失败');
    } finally {
      setSecretBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface-2 p-5 shadow-xl">
        <h2 className="text-lg font-medium">认证 {provider.displayName}</h2>
        {!status && !secretMethod && !secretSaved && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {authMethods(provider).map(method => (
              <button
                key={method.id}
                type="button"
                onClick={() =>
                  method.action
                    ? void refresh(environmentId, provider.id, method.action, onChanged, setError)
                    : method.secret
                      ? setSecretMethod(method.id)
                      : begin(method.id)
                }
                className="rounded-lg border border-border p-3 text-left hover:bg-surface-1"
              >
                <span className="block text-xs font-medium">{method.label}</span>
                <span className="mt-1 block text-[10px] text-text-muted">{method.description}</span>
              </button>
            ))}
          </div>
        )}
        {secretMethod && (
          <div className="mt-4 rounded-lg border border-border bg-surface-1 p-4 text-xs">
            <p className="font-medium">{secretMethod === 'bearer-token' ? 'Bearer Token' : 'API Key'}</p>
            <p className="mt-1 text-[10px] text-text-muted">
              浏览器会直接为本地 Worker 加密；远程服务只短暂中转一次性密文，不写入数据库。
            </p>
            <input
              type="password"
              value={credential}
              onChange={event => setCredential(event.target.value)}
              placeholder="输入凭据"
              autoComplete="off"
              spellCheck={false}
              maxLength={16 * 1024}
              className="mt-3 w-full rounded-md border border-border bg-surface-2 px-2 py-2 font-mono"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={secretBusy}
                onClick={() => {
                  setCredential('');
                  setSecretMethod(null);
                }}
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
              >
                返回
              </button>
              <button
                type="button"
                disabled={secretBusy || !credential.trim()}
                onClick={() => void saveSecret()}
                className="rounded-md bg-brand px-3 py-1.5 text-white disabled:opacity-40"
              >
                {secretBusy ? '正在加密并保存…' : '加密并保存'}
              </button>
            </div>
          </div>
        )}
        {secretSaved && (
          <p className="mt-4 rounded-lg border border-border bg-surface-1 p-4 text-xs text-status-success">
            凭据已保存到本地 Worker。
          </p>
        )}
        {status && (
          <div className="mt-4 rounded-lg border border-border bg-surface-1 p-4 text-xs">
            <p>状态：{statusLabel(status.state)}</p>
            {status.authorizationUrl && (
              <p className="mt-2 break-all">
                <a className="text-brand underline" href={status.authorizationUrl} target="_blank" rel="noreferrer">
                  打开本地 Worker 提供的授权页面
                </a>
              </p>
            )}
            {status.userCode && (
              <p className="mt-3">
                用户码：<strong className="font-mono text-base">{status.userCode}</strong>
              </p>
            )}
            {status.authorizationUrl && !status.userCode && status.state === 'waiting' && (
              <div className="mt-3 flex gap-2">
                <input
                  value={code}
                  onChange={event => setCode(event.target.value)}
                  placeholder="粘贴 authorizationCode#state"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5"
                />
                <button
                  type="button"
                  onClick={() =>
                    void apiSubmitProviderAuthCode(environmentId, status.operationId, code)
                      .then(response => setStatus(model.apply(response)))
                      .catch(reason => setError(reason instanceof Error ? reason.message : '提交失败'))
                  }
                  className="rounded-md bg-brand px-3 py-1.5 text-white"
                >
                  提交
                </button>
              </div>
            )}
            {model.errorText() && <p className="mt-3 text-status-error">{model.errorText()}</p>}
          </div>
        )}
        {error && <p className="mt-3 text-xs text-status-error">{error}</p>}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={close} className="rounded-md border border-border px-3 py-2 text-xs">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

type AuthMethodOption = {
  id: string;
  label: string;
  description: string;
  action?: string;
  secret?: boolean;
};

function authMethods(provider: ProviderCatalogProfile): AuthMethodOption[] {
  if (provider.auth.scheme === 'oauth' && (provider.kind === 'anthropic' || provider.kind === 'anthropic-compatible'))
    return [
      { id: 'claude-subscription-oauth', label: 'Claude 订阅 OAuth', description: 'Claude Pro / Max 账号' },
      { id: 'anthropic-console-oauth', label: 'Anthropic Console OAuth', description: 'API 用量计费账号' },
    ];
  if (provider.kind === 'chatgpt')
    return [
      {
        id: 'chatgpt-import',
        label: '从 Codex 导入',
        description: '复用本机已有的 ChatGPT 订阅登录',
      },
      { id: 'chatgpt-device-oauth', label: 'ChatGPT Device Flow', description: '显示验证网址和用户码' },
    ];
  if (provider.auth.scheme === 'aws-iam')
    return [{ id: 'aws-iam', action: 'aws-refresh', label: '刷新 AWS IAM', description: '重新检测本地凭据链' }];
  if (provider.auth.scheme === 'gcp-adc')
    return [
      {
        id: 'gcp-adc',
        action: 'gcp-refresh',
        label: '刷新 GCP ADC',
        description: '重新检测 Application Default Credentials',
      },
    ];
  if (provider.auth.scheme === 'azure-ad')
    return [
      {
        id: 'azure-ad',
        action: 'azure-refresh',
        label: '刷新 Azure AD',
        description: '重新检测 DefaultAzureCredential',
      },
    ];
  if (provider.auth.scheme === 'proxy')
    return [
      {
        id: 'proxy',
        action: 'proxy-probe',
        label: '检测本地代理',
        description: '重新检测 Worker 上的代理认证配置',
      },
    ];
  return [
    {
      id: provider.auth.scheme === 'bearer' ? 'bearer-token' : 'api-key',
      label: provider.auth.scheme === 'bearer' ? '配置 Bearer Token' : '配置 API Key',
      description: '使用端到端加密的一次性凭据通道',
      secret: true,
    },
  ];
}

async function refresh(
  environmentId: string,
  providerId: string,
  action: string,
  onChanged: () => void | Promise<void>,
  setError: (value: string | null) => void,
) {
  try {
    await apiRefreshProviderAuth(environmentId, providerId, { operation_id: generateMessageUuid(), action });
    await onChanged();
  } catch (error) {
    setError(error instanceof Error ? error.message : '凭据刷新失败');
  }
}

function statusLabel(state: BrowserProviderAuthStatus['state']): string {
  return {
    starting: '正在启动',
    waiting: '等待用户完成',
    succeeded: '认证成功',
    failed: '认证失败',
    cancelled: '已取消',
    expired: '已过期',
  }[state];
}
