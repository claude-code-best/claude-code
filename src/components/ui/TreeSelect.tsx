import React from 'react'
import { type KeyboardEvent, Box } from '@anthropic/ink'
import { type OptionWithDescription, Select } from '../CustomSelect/select.js'

export type TreeNode<T> = {
  id: string | number
  value: T
  label: string
  description?: string
  dimDescription?: boolean
  children?: TreeNode<T>[]
  metadata?: Record<string, unknown>
}

type FlattenedNode<T> = {
  node: TreeNode<T>
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  parentId?: string | number
}

export type TreeSelectProps<T> = {
  /**
   * Tree nodes to display.
   */
  readonly nodes: TreeNode<T>[]

  /**
   * Callback when a node is selected.
   */
  readonly onSelect: (node: TreeNode<T>) => void

  /**
   * Callback when cancel is pressed.
   */
  readonly onCancel?: () => void

  /**
   * Callback when focused node changes.
   */
  readonly onFocus?: (node: TreeNode<T>) => void

  /**
   * Node to focus by ID.
   */
  readonly focusNodeId?: string | number

  /**
   * Number of visible options.
   */
  readonly visibleOptionCount?: number

  /**
   * Layout of the options.
   */
  readonly layout?: 'compact' | 'expanded' | 'compact-vertical'

  /**
   * When disabled, user input is ignored.
   */
  readonly isDisabled?: boolean

  /**
   * When true, hides the numeric indexes next to each option.
   */
  readonly hideIndexes?: boolean

  /**
   * Function to determine if a node should be initially expanded.
   * If not provided, all nodes start collapsed.
   */
  readonly isNodeExpanded?: (nodeId: string | number) => boolean

  /**
   * Callback when a node is expanded.
   */
  readonly onExpand?: (nodeId: string | number) => void

  /**
   * Callback when a node is collapsed.
   */
  readonly onCollapse?: (nodeId: string | number) => void

  /**
   * Custom prefix function for parent nodes
   * @param isExpanded - Whether the parent node is currently expanded
   * @returns The prefix string to display (default: '▼ ' when expanded, '▶ ' when collapsed)
   */
  readonly getParentPrefix?: (isExpanded: boolean) => string

  /**
   * Custom prefix function for child nodes
   * @param depth - The depth of the child node in the tree (0-indexed from parent)
   * @returns The prefix string to display (default: '  ▸ ')
   */
  readonly getChildPrefix?: (depth: number) => string

  /**
   * Callback when user presses up from the first item.
   * If provided, navigation will not wrap to the last item.
   */
  readonly onUpFromFirstItem?: () => void
}

/**
 * TreeSelect is a generic component for selecting items from a hierarchical tree structure.
 * It handles expand/collapse state, keyboard navigation, and renders the tree as a flat list
 * using the Select component.
 */
export function TreeSelect<T>({
  nodes,
  onSelect,
  onCancel,
  onFocus,
  focusNodeId,
  visibleOptionCount,
  layout = 'expanded',
  isDisabled = false,
  hideIndexes = false,
  isNodeExpanded,
  onExpand,
  onCollapse,
  getParentPrefix,
  getChildPrefix,
  onUpFromFirstItem,
}: TreeSelectProps<T>): React.ReactNode {
  // Track which nodes are expanded (internal state if not controlled externally)
  const [internalExpandedIds, setInternalExpandedIds] = React.useState<
    Set<string | number>
  >(new Set())

  // Track if we're programmatically setting focus to avoid infinite loops
  const isProgrammaticFocusRef = React.useRef(false)

  // Track last focused ID to prevent duplicate focus calls
  const lastFocusedIdRef = React.useRef<string | number | null>(null)

  // Determine if a node is expanded (use external function if provided, otherwise use internal state)
  const isExpanded = React.useCallback(
    (nodeId: string | number): boolean => {
      if (isNodeExpanded) {
        return isNodeExpanded(nodeId)
      }
      return internalExpandedIds.has(nodeId)
    },
    [isNodeExpanded, internalExpandedIds],
  )

  // Flatten the tree into a linear list for the Select component
  const flattenedNodes = React.useMemo((): FlattenedNode<T>[] => {
    const result: FlattenedNode<T>[] = []

    function traverse(
      node: TreeNode<T>,
      depth: number,
      parentId?: string | number,
    ): void {
      const hasChildren = !!node.children && node.children.length > 0
      const nodeIsExpanded = isExpanded(node.id)

      result.push({
        node,
        depth,
        isExpanded: nodeIsExpanded,
        hasChildren,
        parentId,
      })

      // Only traverse children if this node is expanded
      if (hasChildren && nodeIsExpanded && node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1, node.id)
        }
      }
    }

    for (const node of nodes) {
      traverse(node, 0)
    }

    return result
  }, [nodes, isExpanded])

  // Default prefix functions
  const defaultGetParentPrefix = React.useCallback(
    (isExpanded: boolean): string => (isExpanded ? '▼ ' : '▶ '),
    [],
  )
  const defaultGetChildPrefix = React.useCallback(
    (_depth: number): string => '  ▸ ',
    [],
  )

  const parentPrefixFn = getParentPrefix ?? defaultGetParentPrefix
  const childPrefixFn = getChildPrefix ?? defaultGetChildPrefix

  // Build the label with appropriate prefixes based on tree position
  const buildLabel = React.useCallback(
    (flatNode: FlattenedNode<T>): string => {
      let prefix = ''

      if (flatNode.hasChildren) {
        // Parent node with children
        prefix = parentPrefixFn(flatNode.isExpanded)
      } else if (flatNode.depth > 0) {
        // Child node
        prefix = childPrefixFn(flatNode.depth)
      }

      return prefix + flatNode.node.label
    },
    [parentPrefixFn, childPrefixFn],
  )

  // Convert flattened nodes to Select options
  const options = React.useMemo((): OptionWithDescription<
    string | number
  >[] => {
    return flattenedNodes.map(flatNode => ({
      label: buildLabel(flatNode),
      description: flatNode.node.description,
      dimDescription: flatNode.node.dimDescription ?? true,
      value: flatNode.node.id,
    }))
  }, [flattenedNodes, buildLabel])

  // Map from node ID to the actual node for quick lookup
  const nodeMap = React.useMemo(() => {
    const map = new Map<string | number, TreeNode<T>>()
    flattenedNodes.forEach(fn => map.set(fn.node.id, fn.node))
    return map
  }, [flattenedNodes])

  // Find the flattened node by ID
  const findFlattenedNode = React.useCallback(
    (nodeId: string | number): FlattenedNode<T> | undefined => {
      return flattenedNodes.find(fn => fn.node.id === nodeId)
    },
    [flattenedNodes],
  )

  // Handle expand/collapse
  const toggleExpand = React.useCallback(
    (nodeId: string | number, shouldExpand: boolean) => {
      const flatNode = findFlattenedNode(nodeId)
      if (!flatNode || !flatNode.hasChildren) return

      if (shouldExpand) {
        if (onExpand) {
          onExpand(nodeId)
        } else {
          setInternalExpandedIds(prev => new Set(prev).add(nodeId))
        }
      } else {
        if (onCollapse) {
          onCollapse(nodeId)
        } else {
          setInternalExpandedIds(prev => {
            const newSet = new Set(prev)
            newSet.delete(nodeId)
            return newSet
          })
        }
      }
    },
    [findFlattenedNode, onExpand, onCollapse],
  )

  // Handle left/right arrow keys for expand/collapse
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!focusNodeId || isDisabled) return

    const flatNode = findFlattenedNode(focusNodeId)
    if (!flatNode) return

    if (e.key === 'right' && flatNode.hasChildren) {
      // Expand the focused node (only if it has children)
      e.preventDefault()
      toggleExpand(focusNodeId, true)
    } else if (e.key === 'left') {
      if (flatNode.hasChildren && flatNode.isExpanded) {
        // Collapse the focused parent node
        e.preventDefault()
        toggleExpand(focusNodeId, false)
      } else if (flatNode.parentId !== undefined) {
        // If this is a child node OR a collapsed parent with a parent,
        // collapse the parent and focus it
        e.preventDefault()
        isProgrammaticFocusRef.current = true
        toggleExpand(flatNode.parentId, false)
        if (onFocus) {
          const parentNode = nodeMap.get(flatNode.parentId)
          if (parentNode) {
            onFocus(parentNode)
          }
        }
      }
    }
  }

  // Handle selection
  const handleChange = React.useCallback(
    (nodeId: string | number) => {
      const node = nodeMap.get(nodeId)
      if (!node) return

      // Always select the node - expand/collapse is handled by arrow keys
      onSelect(node)
    },
    [nodeMap, onSelect],
  )

  // Handle focus changes
  const handleFocus = React.useCallback(
    (nodeId: string | number) => {
      // Skip if this is a programmatic focus change
      if (isProgrammaticFocusRef.current) {
        isProgrammaticFocusRef.current = false
        return
      }

      // Skip if same node already focused
      if (lastFocusedIdRef.current === nodeId) {
        return
      }
      lastFocusedIdRef.current = nodeId

      if (onFocus) {
        const node = nodeMap.get(nodeId)
        if (node) {
          onFocus(node)
        }
      }
    },
    [onFocus, nodeMap],
  )

  return (
    <Box tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Select
        options={options}
        onChange={handleChange}
        onFocus={handleFocus}
        onCancel={onCancel}
        defaultFocusValue={focusNodeId}
        visibleOptionCount={visibleOptionCount}
        layout={layout}
        isDisabled={isDisabled}
        hideIndexes={hideIndexes}
        onUpFromFirstItem={onUpFromFirstItem}
      />
    </Box>
  )
}
