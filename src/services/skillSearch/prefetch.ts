import type { Attachment } from '../../utils/attachments.js'
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../Tool.js'
import { getSkillIndex, searchSkills } from './localSearch.js'
import { isSkillSearchEnabled } from './featureCheck.js'
import { readFileSync } from 'node:fs'

const AUTO_LOAD_SCORE_THRESHOLD = 0.3
const MAX_RESULTS = 5

async function buildSkillDiscovery(
  input: string,
  cwd: string,
): Promise<Attachment | null> {
  if (!isSkillSearchEnabled()) return null

  const index = await getSkillIndex(cwd)
  const results = searchSkills(input, index, MAX_RESULTS)

  // Load content for high-confidence matches
  const skills = results
    .filter(r => r.score >= AUTO_LOAD_SCORE_THRESHOLD)
    .map(r => {
      let content: string | undefined
      if (r.entry.loadedFrom) {
        try {
          content = readFileSync(r.entry.loadedFrom, 'utf8')
        } catch {
          // ignore
        }
      }
      return {
        name: r.name,
        description: r.description,
        score: r.score,
        autoLoaded: true,
        content,
        path: r.entry.loadedFrom,
      }
    })

  // Record a gap if no skills matched
  type GapStatus = 'pending' | 'draft' | 'active'
  type AttachmentGap = {
    key: string
    status: GapStatus
    draftName?: string
    draftPath?: string
    activeName?: string
    activePath?: string
  }
  let gap: AttachmentGap | undefined
  if (skills.length === 0) {
    try {
      const { recordSkillGap } = await import('../../services/skillLearning/skillGapStore.js')
      const gapRecord = await recordSkillGap({
        prompt: input,
        cwd,
        recommendations: results,
      })
      const status = gapRecord.status
      if (status === 'pending' || status === 'draft' || status === 'active') {
        gap = {
          key: gapRecord.key,
          status,
          draftName: gapRecord.draft?.name,
          draftPath: gapRecord.draft?.skillPath,
          activeName: gapRecord.active?.name,
          activePath: gapRecord.active?.skillPath,
        }
      }
    } catch {
      // gap tracking is best-effort
    }
  }

  return {
    type: 'skill_discovery',
    skills,
    signal: null,
    source: 'native',
    gap,
  } as Attachment
}

export const startSkillDiscoveryPrefetch: (
  input: string | null,
  messages: Message[],
  toolUseContext: ToolUseContext,
) => Promise<Attachment[]> = async (input, _messages, _context) => {
  if (!input) return []
  const cwd = process.cwd()
  const attachment = await buildSkillDiscovery(input, cwd)
  return attachment ? [attachment] : []
}

export const collectSkillDiscoveryPrefetch: (
  pending: Promise<Attachment[]>,
) => Promise<Attachment[]> = async (pending) => pending

export const getTurnZeroSkillDiscovery: (
  input: string,
  messages: Message[],
  context: ToolUseContext,
) => Promise<Attachment | null> = async (input, _messages, _context) => {
  const cwd = process.cwd()
  return buildSkillDiscovery(input, cwd)
}
