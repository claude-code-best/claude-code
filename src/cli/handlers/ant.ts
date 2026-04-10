// Auto-generated stub — replace with real implementation
import type { Command } from '@commander-js/extra-typings'

export {}
export const logHandler: (logId: string | number | undefined) => Promise<void> =
  (async () => {}) as (logId: string | number | undefined) => Promise<void>
export const errorHandler: (num: number | undefined) => Promise<void> =
  (async () => {}) as (num: number | undefined) => Promise<void>
export const exportHandler: (
  source: string,
  outputFile: string,
) => Promise<void> = (async () => {}) as (
  source: string,
  outputFile: string,
) => Promise<void>
export const taskCreateHandler: (
  subject: string,
  opts: { description?: string; list?: string },
) => Promise<void> = (async () => {}) as (
  subject: string,
  opts: { description?: string; list?: string },
) => Promise<void>
export const taskListHandler: (opts: {
  list?: string
  pending?: boolean
  json?: boolean
}) => Promise<void> = (async () => {}) as (opts: {
  list?: string
  pending?: boolean
  json?: boolean
}) => Promise<void>
export const taskGetHandler: (
  id: string,
  opts: { list?: string },
) => Promise<void> = (async () => {}) as (
  id: string,
  opts: { list?: string },
) => Promise<void>
export const taskUpdateHandler: (
  id: string,
  opts: {
    list?: string
    status?: string
    subject?: string
    description?: string
    owner?: string
    clearOwner?: boolean
  },
) => Promise<void> = (async () => {}) as (
  id: string,
  opts: {
    list?: string
    status?: string
    subject?: string
    description?: string
    owner?: string
    clearOwner?: boolean
  },
) => Promise<void>
export const taskDirHandler: (opts: { list?: string }) => Promise<void> =
  (async () => {}) as (opts: { list?: string }) => Promise<void>
export const completionHandler: (
  shell: string,
  opts: { output?: string },
  program: Command,
) => Promise<void> = (async () => {}) as (
  shell: string,
  opts: { output?: string },
  program: Command,
) => Promise<void>
