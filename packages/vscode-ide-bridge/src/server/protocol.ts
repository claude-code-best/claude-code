import { z } from 'zod/v4'

export type LockfilePayload = {
  workspaceFolders: string[]
  pid: number
  ideName: string
  transport: 'ws'
  runningInWindows: boolean
  authToken: string
}

export const OpenDiffArgumentsSchema = z.object({
  old_file_path: z.string(),
  new_file_path: z.string(),
  new_file_contents: z.string(),
  tab_name: z.string(),
})

export const CloseTabArgumentsSchema = z.object({
  tab_name: z.string(),
})

export const CloseAllDiffTabsArgumentsSchema = z.object({})

export const IdeConnectedNotificationSchema = z.object({
  method: z.literal('ide_connected'),
  params: z.object({
    pid: z.number(),
  }),
})

export type OpenDiffArguments = z.infer<typeof OpenDiffArgumentsSchema>
export type CloseTabArguments = z.infer<typeof CloseTabArgumentsSchema>
