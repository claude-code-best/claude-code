import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Text } from '../ink.js';
import { t, useLocale } from '../i18n/index.js';
export function InterruptedByUser() {
  const $ = _c(3);
  const locale = useLocale();
  let t0;
  if ($[0] !== locale) {
    t0 = <><Text dimColor={true}>{t('common.cancelling')} </Text>{false ? <Text dimColor={true}>· [ANT-ONLY] /issue to report a model issue</Text> : <Text dimColor={true}>· {t('ui.whatShouldClaudeDoInstead')}</Text>}</>;
    $[0] = locale;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}
