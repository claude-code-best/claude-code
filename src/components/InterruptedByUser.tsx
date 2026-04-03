import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Text } from '../ink.js';
import { t } from '../i18n/index.js';
export function InterruptedByUser() {
  const $ = _c(3);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <><Text dimColor={true}>{t('common.cancelling')} </Text>{false ? <Text dimColor={true}>· [ANT-ONLY] /issue to report a model issue</Text> : <Text dimColor={true}>· {t('ui.whatShouldClaudeDoInstead')}</Text>}</>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
