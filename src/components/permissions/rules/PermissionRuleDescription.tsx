import * as React from 'react';
import { Text } from '@anthropic/ink';
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js';
import type { PermissionRuleValue } from '../../../utils/permissions/PermissionRule.js';

type RuleSubtitleProps = {
  ruleValue: PermissionRuleValue;
};

export function PermissionRuleDescription({ ruleValue }: RuleSubtitleProps): React.ReactNode {
  switch (ruleValue.toolName) {
    case BashTool.name: {
      if (ruleValue.ruleContent) {
        if (ruleValue.ruleContent.endsWith(':*')) {
          return (
            <Text dimColor>
              Any Bash command starting with <Text bold>{ruleValue.ruleContent.slice(0, -2)}</Text>
            </Text>
          );
        } else {
          return (
            <Text dimColor>
              The Bash command <Text bold>{ruleValue.ruleContent}</Text>
            </Text>
          );
        }
      } else {
        return <Text dimColor>Any Bash command</Text>;
      }
    }
    default: {
      if (!ruleValue.ruleContent) {
        return (
          <Text dimColor>
            Any use of the <Text bold>{ruleValue.toolName}</Text> tool
          </Text>
        );
      } else {
        return null;
      }
    }
  }
}
