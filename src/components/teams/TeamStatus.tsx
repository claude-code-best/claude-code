import * as React from 'react'
import { Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'

type Props = {
  teamsSelected: boolean
  showHint: boolean
}

/**
 * Footer status indicator showing teammate count
 * Similar to BackgroundTaskStatus but for teammates
 */
export function TeamStatus({
  teamsSelected,
  showHint,
}: Props): React.ReactNode {
  const teamContext = useAppState(s => s.teamContext)

  // Derive teammate count from teamContext (no filesystem I/O needed)
  const totalTeammates = teamContext
    ? Object.values(teamContext.teammates).filter(t => t.name !== 'team-lead')
        .length
    : 0

  if (totalTeammates === 0) {
    return null
  }

  const hint =
    showHint && teamsSelected ? (
      <>
        <Text dimColor>· </Text>
        <Text dimColor>Enter to view</Text>
      </>
    ) : null

  const statusText = `${totalTeammates} ${totalTeammates === 1 ? 'teammate' : 'teammates'}`

  return (
    <>
      <Text
        key={teamsSelected ? 'selected' : 'normal'}
        color="background"
        inverse={teamsSelected}
      >
        {statusText}
      </Text>
      {hint ? <Text> {hint}</Text> : null}
    </>
  )
}
