export type SelectionPoint = {
  line: number
  character: number
}

export type SelectionChangedParams = {
  selection: {
    start: SelectionPoint
    end: SelectionPoint
  } | null
  text?: string
  filePath?: string
}

type BuildSelectionChangedParamsInput = {
  filePath?: string
  text?: string
  start?: SelectionPoint
  end?: SelectionPoint
}

export function buildSelectionChangedParams(
  input: BuildSelectionChangedParamsInput,
): SelectionChangedParams {
  if (!input.start || !input.end) {
    return {
      selection: null,
      text: input.text,
      filePath: input.filePath,
    }
  }

  return {
    selection: {
      start: input.start,
      end: input.end,
    },
    text: input.text,
    filePath: input.filePath,
  }
}
