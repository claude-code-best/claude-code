import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { Credential, Vault } from './vaultsApi.js';

type Props =
  | { mode: 'list'; vaults: Vault[] }
  | { mode: 'detail'; vault: Vault }
  | { mode: 'created'; vault: Vault }
  | { mode: 'archived'; vault: Vault }
  | { mode: 'credential-list'; vaultId: string; credentials: Credential[] }
  | { mode: 'credential-added'; vaultId: string; credentialId: string }
  | { mode: 'credential-archived'; vaultId: string; credentialId: string }
  | { mode: 'error'; message: string };

function VaultRow({ vault }: { vault: Vault }): React.ReactNode {
  const isArchived = !!vault.archived_at;
  const createdAt = vault.created_at ? new Date(vault.created_at).toLocaleString() : '—';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold>{vault.vault_id}</Text>
        <Text dimColor> · </Text>
        <Text color={(isArchived ? 'warning' : 'success') as keyof Theme}>{isArchived ? 'archived' : 'active'}</Text>
      </Box>
      <Text>Name: {vault.name}</Text>
      <Text dimColor>Created: {createdAt}</Text>
    </Box>
  );
}

export function VaultView(props: Props): React.ReactNode {
  if (props.mode === 'list') {
    if (props.vaults.length === 0) {
      return (
        <Box>
          <Text dimColor>No vaults found. Use /vault create &lt;name&gt; to create one.</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Vaults ({props.vaults.length})</Text>
        </Box>
        {props.vaults.map(vault => (
          <VaultRow key={vault.vault_id} vault={vault} />
        ))}
      </Box>
    );
  }

  if (props.mode === 'detail') {
    const { vault } = props;
    const isArchived = !!vault.archived_at;
    const createdAt = vault.created_at ? new Date(vault.created_at).toLocaleString() : '—';
    const archivedAt = vault.archived_at ? new Date(vault.archived_at).toLocaleString() : null;
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Vault: {vault.vault_id}</Text>
        </Box>
        <Text>Name: {vault.name}</Text>
        <Text>
          Status:{' '}
          <Text color={(isArchived ? 'warning' : 'success') as keyof Theme}>{isArchived ? 'archived' : 'active'}</Text>
        </Text>
        <Text dimColor>Created: {createdAt}</Text>
        {archivedAt ? <Text dimColor>Archived: {archivedAt}</Text> : null}
      </Box>
    );
  }

  if (props.mode === 'created') {
    const { vault } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            Vault created
          </Text>
        </Box>
        <Text>ID: {vault.vault_id}</Text>
        <Text>Name: {vault.name}</Text>
      </Box>
    );
  }

  if (props.mode === 'archived') {
    const { vault } = props;
    const archivedAt = vault.archived_at ? new Date(vault.archived_at).toLocaleString() : '—';
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'warning' as keyof Theme}>
            Vault archived
          </Text>
        </Box>
        <Text>ID: {vault.vault_id}</Text>
        <Text dimColor>Archived at: {archivedAt}</Text>
      </Box>
    );
  }

  if (props.mode === 'credential-list') {
    const { vaultId, credentials } = props;
    if (credentials.length === 0) {
      return (
        <Box>
          <Text dimColor>
            No credentials in vault {vaultId}. Use /vault add-credential {vaultId} &lt;key&gt; &lt;value&gt; to add one.
          </Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>
            Credentials in {vaultId} ({credentials.length})
          </Text>
        </Box>
        {credentials.map(cred => {
          const isArchived = !!cred.archived_at;
          return (
            <Box key={cred.credential_id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text bold>{cred.credential_id}</Text>
                <Text dimColor> · </Text>
                {cred.kind ? <Text dimColor>{cred.kind}</Text> : null}
                {isArchived ? (
                  <>
                    <Text dimColor> · </Text>
                    <Text color={'warning' as keyof Theme}>archived</Text>
                  </>
                ) : null}
              </Box>
              {/* SECURITY: credential value is never displayed */}
              <Text dimColor>Value: ***mask***</Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  if (props.mode === 'credential-added') {
    const { vaultId, credentialId } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'success' as keyof Theme}>
            Credential added
          </Text>
        </Box>
        <Text>ID: {credentialId}</Text>
        <Text>Vault: {vaultId}</Text>
        {/* SECURITY: credential value is never echoed back */}
        <Text dimColor>Value: ***mask***</Text>
      </Box>
    );
  }

  if (props.mode === 'credential-archived') {
    const { vaultId, credentialId } = props;
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={'warning' as keyof Theme}>
            Credential archived
          </Text>
        </Box>
        <Text>ID: {credentialId}</Text>
        <Text>Vault: {vaultId}</Text>
      </Box>
    );
  }

  // error mode
  return (
    <Box>
      <Text color={'error' as keyof Theme}>{props.message}</Text>
    </Box>
  );
}
