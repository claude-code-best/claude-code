import { basename, relative } from 'path'
import React, { Suspense, use, useMemo } from 'react'
import { FileEditToolDiff } from 'src/components/FileEditToolDiff.js'
import { getCwd } from 'src/utils/cwd.js'
import { isENOENT } from 'src/utils/errors.js'
import { detectEncodingForResolvedPath } from 'src/utils/fileRead.js'
import { getFsImplementation } from 'src/utils/fsOperations.js'
import { Text } from '../../../ink.js'
import { BashTool } from '../../../tools/BashTool/BashTool.js'
import {
  applySedSubstitution,
  type SedEditInfo,
} from '../../../tools/BashTool/sedEditParser.js'
import { FilePermissionDialog } from '../FilePermissionDialog/FilePermissionDialog.js'
import type { PermissionRequestProps } from '../PermissionRequest.js'

type SedEditPermissionRequestProps = PermissionRequestProps & {
  sedInfo: SedEditInfo
}

type FileReadResult = { oldContent: string; fileExists: boolean }

export function SedEditPermissionRequest({
  sedInfo,
  ...props
}: SedEditPermissionRequestProps): React.ReactNode {
  const { filePath } = sedInfo

  // Read file content async so mount doesn't block React commit on disk I/O.
  // Large files would otherwise hang the dialog before it renders.
  // Memoized on filePath so we don't re-read on every render.
  const contentPromise = useMemo(
    () =>
      (async (): Promise<FileReadResult> => {
        // Detect encoding first (sync 4KB read — negligible) so UTF-16LE BOMs
        // render correctly. This matches what readFileSync did before the
        // async conversion.
        const encoding = detectEncodingForResolvedPath(filePath)
        const raw = await getFsImplementation().readFile(filePath, { encoding })
        return {
          oldContent: raw.replaceAll('\r\n', '\n'),
          fileExists: true,
        }
      })().catch((e: unknown): FileReadResult => {
        if (!isENOENT(e)) throw e
        return { oldContent: '', fileExists: false }
      }),
    [filePath],
  )

  return (
    <Suspense fallback={null}>
      <SedEditPermissionRequestInner
        sedInfo={sedInfo}
        contentPromise={contentPromise}
        {...props}
      />
    </Suspense>
  )
}

function SedEditPermissionRequestInner({
  sedInfo,
  contentPromise,
  ...props
}: SedEditPermissionRequestProps & {
  contentPromise: Promise<FileReadResult>
}): React.ReactNode {
  const { filePath } = sedInfo
  const { oldContent, fileExists } = use(contentPromise)

  // Compute the new content by applying the sed substitution
  const newContent = useMemo(() => {
    return applySedSubstitution(oldContent, sedInfo)
  }, [oldContent, sedInfo])

  // Create the edit representation for the diff
  const edits = useMemo(() => {
    if (oldContent === newContent) {
      return []
    }
    return [
      {
        old_string: oldContent,
        new_string: newContent,
        replace_all: false,
      },
    ]
  }, [oldContent, newContent])

  // Determine appropriate message when no changes
  const noChangesMessage = useMemo(() => {
    if (!fileExists) {
      return 'File does not exist'
    }
    return 'Pattern did not match any content'
  }, [fileExists])

  // Parse input and add _simulatedSedEdit to ensure what user previewed
  // is exactly what gets written (prevents sed/JS regex differences)
  const parseInput = (input: unknown) => {
    const parsed = BashTool.inputSchema.parse(input)
    return {
      ...parsed,
      _simulatedSedEdit: {
        filePath,
        newContent,
      },
    }
  }

  return (
    <FilePermissionDialog
      toolUseConfirm={props.toolUseConfirm}
      toolUseContext={props.toolUseContext}
      onDone={props.onDone}
      onReject={props.onReject}
      title="Edit file"
      subtitle={relative(getCwd(), filePath)}
      question={
        <Text>
          Do you want to make this edit to{' '}
          <Text bold>{basename(filePath)}</Text>?
        </Text>
      }
      content={
        edits.length > 0 ? (
          <FileEditToolDiff file_path={filePath} edits={edits} />
        ) : (
          <Text dimColor>{noChangesMessage}</Text>
        )
      }
      path={filePath}
      completionType="str_replace_single"
      parseInput={parseInput}
      workerBadge={props.workerBadge}
    />
  )
}
