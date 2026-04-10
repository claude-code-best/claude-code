import setWith from 'lodash-es/setWith.js';
import * as React from 'react';
import { Box, Text, useTheme } from '@anthropic/ink';
import type { ValidationError } from '../utils/settings/validation.js';
import { type TreeNode, treeify } from '../utils/treeify.js';

/**
 * Builds a nested tree structure from dot-notation paths
 * Uses lodash setWith to avoid automatic array creation
 */
function buildNestedTree(errors: ValidationError[]): TreeNode {
  const tree: TreeNode = {};

  errors.forEach(error => {
    if (!error.path) {
      // Root level error - use empty string as key
      tree[''] = error.message;
      return;
    }

    // Try to enhance the path with meaningful values
    const pathParts = error.path.split('.');
    let modifiedPath = error.path;

    // If we have an invalid value, try to make the path more readable
    if (error.invalidValue !== null && error.invalidValue !== undefined && pathParts.length > 0) {
      const newPathParts: string[] = [];

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (!part) continue;

        const numericPart = parseInt(part, 10);

        // If this is a numeric index and it's the last part where we have the invalid value
        if (!isNaN(numericPart) && i === pathParts.length - 1) {
          // Format the value for display
          let displayValue: string;
          if (typeof error.invalidValue === 'string') {
            displayValue = `"${error.invalidValue}"`;
          } else if (error.invalidValue === null) {
            displayValue = 'null';
          } else if (error.invalidValue === undefined) {
            displayValue = 'undefined';
          } else {
            displayValue = String(error.invalidValue);
          }

          newPathParts.push(displayValue);
        } else {
          // Keep other parts as-is
          newPathParts.push(part);
        }
      }

      modifiedPath = newPathParts.join('.');
    }

    setWith(tree, modifiedPath, error.message, Object);
  });

  return tree;
}

/**
 * Groups and displays validation errors using treeify with deduplication
 */
export function ValidationErrorsList({ errors }: { errors: ValidationError[] }): React.ReactNode {
  const [themeName] = useTheme();

  if (errors.length === 0) {
    return null;
  }

  // Group errors by file
  const errorsByFile = errors.reduce<Record<string, ValidationError[]>>((acc, error) => {
    const file = error.file || '(file not specified)';
    if (!acc[file]) {
      acc[file] = [];
    }
    acc[file]!.push(error);
    return acc;
  }, {});

  // Sort files alphabetically
  const sortedFiles = Object.keys(errorsByFile).sort();

  return (
    <Box flexDirection="column">
      {sortedFiles.map(file => {
        const fileErrors = errorsByFile[file] || [];

        // Sort errors by path
        fileErrors.sort((a, b) => {
          if (!a.path && b.path) return -1;
          if (a.path && !b.path) return 1;
          return (a.path || '').localeCompare(b.path || '');
        });

        // Build nested tree structure from error paths
        const errorTree = buildNestedTree(fileErrors);

        // Collect unique suggestion+docLink pairs
        const suggestionPairs = new Map<string, { suggestion?: string; docLink?: string }>();

        fileErrors.forEach(error => {
          if (error.suggestion || error.docLink) {
            // Create a key from suggestion+docLink combination
            const key = `${error.suggestion || ''}|${error.docLink || ''}`;
            if (!suggestionPairs.has(key)) {
              suggestionPairs.set(key, {
                suggestion: error.suggestion,
                docLink: error.docLink,
              });
            }
          }
        });

        // Render the tree
        const treeOutput = treeify(errorTree, {
          showValues: true,
          themeName,
          treeCharColors: {
            treeChar: 'inactive',
            key: 'text',
            value: 'inactive',
          },
        });

        return (
          <Box key={file} flexDirection="column">
            <Text>{file}</Text>
            <Box marginLeft={1}>
              <Text dimColor>{treeOutput}</Text>
            </Box>
            {/* Display unique suggestion+docLink pairs */}
            {suggestionPairs.size > 0 && (
              <Box flexDirection="column" marginTop={1}>
                {Array.from(suggestionPairs.values()).map((pair, index) => (
                  <Box key={`suggestion-pair-${index}`} flexDirection="column" marginBottom={1}>
                    {pair.suggestion && (
                      <Text dimColor wrap="wrap">
                        {pair.suggestion}
                      </Text>
                    )}
                    {pair.docLink && (
                      <Text dimColor wrap="wrap">
                        Learn more: {pair.docLink}
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
