import React, { useMemo } from 'react';
import { getMcpConfigsByScope } from 'src/services/mcp/config.js';
import type { ConfigScope } from 'src/services/mcp/types.js';
import { describeMcpConfigFilePath, getScopeLabel } from 'src/services/mcp/utils.js';
import type { ValidationError } from 'src/utils/settings/validation.js';
import { Box, Link, Text } from '@anthropic/ink';

function McpConfigErrorSection({
  scope,
  parsingErrors,
  warnings,
}: {
  scope: ConfigScope;
  parsingErrors: ValidationError[];
  warnings: ValidationError[];
}): React.ReactNode {
  const hasErrors = parsingErrors.length > 0;
  const hasWarnings = warnings.length > 0;

  if (!hasErrors && !hasWarnings) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        {(hasErrors || hasWarnings) && (
          <Text color={hasErrors ? 'error' : 'warning'}>[{hasErrors ? 'Failed to parse' : 'Contains warnings'}] </Text>
        )}
        <Text>{getScopeLabel(scope)}</Text>
      </Box>
      <Box>
        <Text dimColor>Location: </Text>
        <Text dimColor>{describeMcpConfigFilePath(scope)}</Text>
      </Box>
      <Box marginLeft={1} flexDirection="column">
        {parsingErrors.map((error, i) => {
          const serverName = error.mcpErrorMetadata?.serverName;
          return (
            <Box key={`error-${i}`}>
              <Text>
                <Text dimColor>└ </Text>
                <Text color="error">[Error]</Text>
                <Text dimColor>
                  {' '}
                  {serverName && `[${serverName}] `}
                  {error.path && error.path !== '' ? `${error.path}: ` : ''}
                  {error.message}
                </Text>
              </Text>
            </Box>
          );
        })}
        {warnings.map((warning, i) => {
          const serverName = warning.mcpErrorMetadata?.serverName;

          return (
            <Box key={`warning-${i}`}>
              <Text>
                <Text dimColor>└ </Text>
                <Text color="warning">[Warning]</Text>
                <Text dimColor>
                  {' '}
                  {serverName && `[${serverName}] `}
                  {warning.path && warning.path !== '' ? `${warning.path}: ` : ''}
                  {warning.message}
                </Text>
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export function McpParsingWarnings(): React.ReactNode {
  // Config files don't change during dialog lifetime; read once on mount
  // to avoid blocking file IO on every re-render.
  const scopes = useMemo(
    () =>
      [
        { scope: 'user', config: getMcpConfigsByScope('user') },
        { scope: 'project', config: getMcpConfigsByScope('project') },
        { scope: 'local', config: getMcpConfigsByScope('local') },
        { scope: 'enterprise', config: getMcpConfigsByScope('enterprise') },
      ] satisfies Array<{
        scope: ConfigScope;
        config: { errors: ValidationError[] };
      }>,
    [],
  );

  const hasParsingErrors = scopes.some(({ config }) => filterErrors(config.errors, 'fatal').length > 0);
  const hasWarnings = scopes.some(({ config }) => filterErrors(config.errors, 'warning').length > 0);

  if (!hasParsingErrors && !hasWarnings) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text bold>MCP Config Diagnostics</Text>
      <Box marginTop={1}>
        <Text dimColor>
          For help configuring MCP servers, see:{' '}
          <Link url="https://code.claude.com/docs/en/mcp">https://code.claude.com/docs/en/mcp</Link>
        </Text>
      </Box>
      {scopes.map(({ scope, config }) => (
        <McpConfigErrorSection
          key={scope}
          scope={scope}
          parsingErrors={filterErrors(config.errors, 'fatal')}
          warnings={filterErrors(config.errors, 'warning')}
        />
      ))}
      {/* TODO: Add additional diagnostic sections:
       * - Duplicate Server Names (check for servers with same name across scopes)
       * This section should include:
       * - File paths where each server is defined
       * - More detailed location info for user/local scopes
       * - Approved / disabled status of servers
       */}
    </Box>
  );
}

function filterErrors(errors: ValidationError[], severity: 'fatal' | 'warning'): ValidationError[] {
  return errors.filter(e => e.mcpErrorMetadata?.severity === severity);
}
