import axios from 'axios'
import z from 'zod/v4'
import { getOauthConfig } from '../../constants/oauth.js'
import { logForDebugging } from '../../utils/debug.js'
import { getOAuthHeaders, prepareApiRequest } from '../../utils/teleport/api.js'

/**
 * Zod schema for the /v1/ultrareview/preflight response.
 * Based on binary-extracted schema: vq.object({action: vq.enum([...]), billing_note: ...})
 */
const UltrareviewPreflightSchema = z.object({
  action: z.enum(['proceed', 'confirm', 'blocked']),
  billing_note: z.string().nullable().optional(),
})

export type UltrareviewPreflightResponse = z.infer<
  typeof UltrareviewPreflightSchema
>

export type UltrareviewPreflightArgs = {
  repo: string
  pr_number?: number
  pr_url?: string
  confirm?: boolean
}

/**
 * POST /v1/ultrareview/preflight — server-side gate before launch.
 *
 * Returns the preflight result (proceed / confirm / blocked) or null on any
 * failure (network error, auth error, schema mismatch). Callers must treat
 * null as "fallback to direct launch" to preserve existing behavior.
 *
 * The `confirm` flag should be set to true when the user has already
 * acknowledged the billing dialog (or passed --confirm on the CLI), which
 * skips the server-side confirm prompt and gets a direct proceed/blocked.
 */
export async function fetchUltrareviewPreflight(
  args: UltrareviewPreflightArgs,
): Promise<UltrareviewPreflightResponse | null> {
  try {
    const { accessToken, orgUUID } = await prepareApiRequest()

    const body: Record<string, unknown> = {
      repo: args.repo,
    }
    if (args.pr_number !== undefined) {
      body.pr_number = args.pr_number
    }
    if (args.pr_url !== undefined) {
      body.pr_url = args.pr_url
    }
    if (args.confirm !== undefined) {
      body.confirm = args.confirm
    }

    const response = await axios.post(
      `${getOauthConfig().BASE_API_URL}/v1/ultrareview/preflight`,
      body,
      {
        headers: {
          ...getOAuthHeaders(accessToken),
          'x-organization-uuid': orgUUID,
        },
        timeout: 10000,
      },
    )

    const parsed = UltrareviewPreflightSchema.safeParse(response.data)
    if (!parsed.success) {
      logForDebugging(
        `fetchUltrareviewPreflight: schema mismatch — ${parsed.error.message}`,
      )
      return null
    }
    return parsed.data
  } catch (error) {
    logForDebugging(`fetchUltrareviewPreflight failed: ${error}`)
    return null
  }
}
