import { useMemo } from 'react';
import { Box, Text } from '@anthropic/ink';
import { Select } from '../../components/CustomSelect/select.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { getCurrentModeSlug, listModes, setCurrentMode } from '../../modes/store.js';

function ModePicker({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const modes = listModes();
  const currentSlug = getCurrentModeSlug();

  const options = useMemo(
    () =>
      modes.map(m => ({
        label: (
          <Text>
            {m.icon} {m.name}{' '}
            <Text dimColor>
              ({m.slug}) — {m.description}
            </Text>
          </Text>
        ),
        value: m.slug,
      })),
    [modes],
  );

  function handleSelect(slug: string) {
    setCurrentMode(slug);
    const target = modes.find(m => m.slug === slug);
    onDone(`${target?.icon} Mode switched to: ${target?.name} (${target?.slug}) — ${target?.description}`, {
      display: 'system',
    });
  }

  function handleCancel() {
    onDone('Mode selection cancelled.', { display: 'system' });
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text color="remember" bold>
          Select mode
        </Text>
        <Text dimColor>Arrow keys to navigate, Enter to select, Esc to cancel.</Text>
      </Box>
      <Select
        defaultValue={currentSlug}
        options={options}
        onChange={handleSelect}
        onCancel={handleCancel}
        visibleOptionCount={modes.length}
      />
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const slug = args?.trim().toLowerCase();

  if (slug) {
    const modes = listModes();
    const target = modes.find(m => m.slug === slug);
    if (!target) {
      const available = modes.map(m => `${m.icon} ${m.slug} — ${m.description}`).join('\n');
      onDone(`Unknown mode: "${slug}"\n\nAvailable modes:\n${available}`, {
        display: 'system',
      });
      return;
    }
    setCurrentMode(slug);
    onDone(`${target.icon} Mode switched to: ${target.name} (${target.slug}) — ${target.description}`, {
      display: 'system',
    });
    return;
  }

  return <ModePicker onDone={onDone} />;
};
