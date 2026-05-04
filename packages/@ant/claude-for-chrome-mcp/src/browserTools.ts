export const BROWSER_TOOLS = [
  {
    name: 'javascript_tool',
    description:
      '在当前页面上下文中执行 JavaScript 代码。代码将在页面上下文中运行，并可与 DOM、window 对象和页面变量交互。返回最后一个表达式的结果或任何抛出的错误。如果没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用标签页。',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: "Must be set to 'javascript_exec'",
        },
        text: {
          type: 'string',
          description:
            "要执行的 JavaScript 代码。代码将在页面上下文中求值。最后一个表达式的结果将自动返回。请勿使用 'return' 语句——只需编写要计算的表达式（例如，使用 'window.myData.value' 而不是 'return window.myData.value'）。您可以访问和修改 DOM、调用页面函数以及与页面变量交互。",
        },
        tabId: {
          type: 'number',
          description:
            '要在其中执行代码的标签页 ID。必须是当前分组中的一个标签页。如果没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
      },
      required: ['action', 'text', 'tabId'],
    },
  },
  {
    name: 'read_page',
    description:
      '获取页面上元素的可访问性树表示。默认返回所有元素，包括不可见的元素。输出默认限制为 50000 个字符。如果输出超过此限制，您将收到错误提示，要求您指定较小的深度或使用 ref_id 专注于特定元素。可选地仅筛选交互式元素。如果没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用标签页。',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['interactive', 'all'],
          description:
            '筛选元素："interactive" 仅用于按钮/链接/输入框，"all" 用于所有元素包括不可见的元素（默认：所有元素）',
        },
        tabId: {
          type: 'number',
          description:
            '要读取的标签页 ID。必须是当前分组中的一个标签页。如果没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
        depth: {
          type: 'number',
          description:
            'Maximum depth of the tree to traverse (default: 15). Use a smaller depth if output is too large.',
        },
        ref_id: {
          type: 'string',
          description:
            'Reference ID of a parent element to read. Will return the specified element and all its children. Use this to focus on a specific part of the page when output is too large.',
        },
        max_chars: {
          type: 'number',
          description:
            'Maximum characters for output (default: 50000). Set to a higher value if your client can handle large outputs.',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'find',
    description:
      '使用自然语言查找页面上的元素。可以根据元素用途（例如，“搜索栏”、“登录按钮”）或文本内容（例如，“有机芒果产品”）进行搜索。返回最多 20 个匹配元素及其引用，这些引用可用于其他工具。如果存在超过 20 个匹配项，您将收到通知，要求使用更具体的查询。如果没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用标签页。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '要查找内容的自然语言描述（例如，“搜索栏”、“添加到购物车按钮”、“包含有机字样的产品标题”）',
        },
        tabId: {
          type: 'number',
          description:
            '要在其中搜索的标签页 ID。必须是当前分组中的一个标签页。如果没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
      },
      required: ['query', 'tabId'],
    },
  },
  {
    name: 'form_input',
    description:
      '使用来自 read_page 工具的元素引用 ID 设置表单元素的值。如果没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用标签页。',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description:
            '来自 read_page 工具的元素引用 ID（例如，“ref_1”、“ref_2”）',
        },
        value: {
          type: ['string', 'boolean', 'number'],
          description:
            'The value to set. For checkboxes use boolean, for selects use option value or text, for other inputs use appropriate string/number',
        },
        tabId: {
          type: 'number',
          description:
            '要在其中设置表单值的标签页 ID。必须是当前分组中的一个标签页。如果没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
      },
      required: ['ref', 'value', 'tabId'],
    },
  },
  {
    name: 'computer',
    description: `Use a mouse and keyboard to interact with a web browser, and take screenshots. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.\n* Whenever you intend to click on an element like an icon, you should consult a screenshot to determine the coordinates of the element before moving the cursor.\n* If you tried clicking on a program or link but it failed to load, even after waiting, try adjusting your click location so that the tip of the cursor visually falls on the element that you want to click.\n* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'left_click',
            'right_click',
            'type',
            'screenshot',
            'wait',
            'scroll',
            'key',
            'left_click_drag',
            'double_click',
            'triple_click',
            'zoom',
            'scroll_to',
            'hover',
          ],
          description:
            'The action to perform:\n* `left_click`: Click the left mouse button at the specified coordinates.\n* `right_click`: Click the right mouse button at the specified coordinates to open context menus.\n* `double_click`: Double-click the left mouse button at the specified coordinates.\n* `triple_click`: Triple-click the left mouse button at the specified coordinates.\n* `type`: Type a string of text.\n* `screenshot`: Take a screenshot of the screen.\n* `wait`: Wait for a specified number of seconds.\n* `scroll`: Scroll up, down, left, or right at the specified coordinates.\n* `key`: Press a specific keyboard key.\n* `left_click_drag`: Drag from start_coordinate to coordinate.\n* `zoom`: Take a screenshot of a specific region for closer inspection.\n* `scroll_to`: Scroll an element into view using its element reference ID from read_page or find tools.\n* `hover`: Move the mouse cursor to the specified coordinates or element without clicking. Useful for revealing tooltips, dropdown menus, or triggering hover states.',
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description:
            '(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates. Required for `left_click`, `right_click`, `double_click`, `triple_click`, and `scroll`. For `left_click_drag`, this is the end position.',
        },
        text: {
          type: 'string',
          description:
            '要输入的文本（用于 `type` 操作）或要按下的按键（用于 `key` 操作）。对于 `key` 操作：提供以空格分隔的按键（例如，“Backspace Backspace Delete”）。支持使用平台的修饰键进行键盘快捷键（在 Mac 上使用“cmd”，在 Windows/Linux 上使用“ctrl”，例如，“cmd+a”或“ctrl+a”表示全选）。',
        },
        duration: {
          type: 'number',
          minimum: 0,
          maximum: 30,
          description:
            'The number of seconds to wait. Required for `wait`. Maximum 30 seconds.',
        },
        scroll_direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'The direction to scroll. Required for `scroll`.',
        },
        scroll_amount: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          description:
            'The number of scroll wheel ticks. Optional for `scroll`, defaults to 3.',
        },
        start_coordinate: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description:
            '(x, y): The starting coordinates for `left_click_drag`.',
        },
        region: {
          type: 'array',
          items: { type: 'number' },
          minItems: 4,
          maxItems: 4,
          description:
            '(x0, y0, x1, y1): The rectangular region to capture for `zoom`. Coordinates define a rectangle from top-left (x0, y0) to bottom-right (x1, y1) in pixels from the viewport origin. Required for `zoom` action. Useful for inspecting small UI elements like icons, buttons, or text.',
        },
        repeat: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description:
            'Number of times to repeat the key sequence. Only applicable for `key` action. Must be a positive integer between 1 and 100. Default is 1. Useful for navigation tasks like pressing arrow keys multiple times.',
        },
        ref: {
          type: 'string',
          description:
            '来自 read_page 或 find 工具的元素引用 ID（例如，“ref_1”、“ref_2”）。`scroll_to` 操作需要此参数。也可用作点击操作中 `coordinate` 的替代方案。',
        },
        modifiers: {
          type: 'string',
          description:
            '点击操作的修饰键。支持：“ctrl”、“shift”、“alt”、“cmd”（或“meta”）、“win”（或“windows”）。可以使用“+”组合（例如，“ctrl+shift”、“cmd+alt”）。可选。',
        },
        tabId: {
          type: 'number',
          description:
            '要在其上执行操作的标签页 ID。必须是当前分组中的一个标签页。如果没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
      },
      required: ['action', 'tabId'],
    },
  },
  {
    name: 'navigate',
    description:
      '导航到指定 URL，或在浏览器历史记录中前进/后退。如果没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用标签页。',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            '要导航到的 URL。可提供带或不带协议（默认为 https://）。使用 "forward" 在历史记录中前进，或使用 "back" 后退。',
        },
        tabId: {
          type: 'number',
          description:
            '要导航的标签页 ID。必须是当前分组内的标签页。如果没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
      },
      required: ['url', 'tabId'],
    },
  },
  {
    name: 'resize_window',
    description:
      '将当前浏览器窗口调整为指定尺寸。适用于测试响应式设计或设置特定屏幕尺寸。如果没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用标签页。',
    inputSchema: {
      type: 'object',
      properties: {
        width: {
          type: 'number',
          description: 'Target window width in pixels',
        },
        height: {
          type: 'number',
          description: 'Target window height in pixels',
        },
        tabId: {
          type: 'number',
          description:
            '要获取其窗口的标签页 ID。必须是当前分组内的标签页。如果没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
      },
      required: ['width', 'height', 'tabId'],
    },
  },
  {
    name: 'gif_creator',
    description:
      "管理浏览器自动化会话的 GIF 录制和导出。控制何时开始/停止录制浏览器操作（点击、滚动、导航），然后导出为带有视觉叠加层（点击指示器、操作标签、进度条、水印）的动画 GIF。所有操作都限定在标签页分组内。开始录制时，立即截取一张屏幕截图以捕获初始状态作为第一帧。停止录制时，立即截取一张屏幕截图以捕获最终状态作为最后一帧。对于导出，可提供 'coordinate' 以拖放上传到页面元素，或设置 'download: true' 以下载 GIF。",
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start_recording', 'stop_recording', 'export', 'clear'],
          description:
            "要执行的操作：'start_recording'（开始捕获）、'stop_recording'（停止捕获但保留帧）、'export'（生成并导出 GIF）、'clear'（丢弃帧）",
        },
        tabId: {
          type: 'number',
          description:
            'Tab ID to identify which tab group this operation applies to',
        },
        download: {
          type: 'boolean',
          description:
            "仅针对 'export' 操作，请始终将此设置为 true。这将导致 GIF 在浏览器中被下载。",
        },
        filename: {
          type: 'string',
          description:
            "导出 GIF 的可选文件名（默认：'recording-[timestamp].gif'）。仅适用于 'export' 操作。",
        },
        options: {
          type: 'object',
          description:
            "针对 'export' 操作的可选 GIF 增强选项。属性：showClickIndicators (bool)、showDragPaths (bool)、showActionLabels (bool)、showProgressBar (bool)、showWatermark (bool)、quality (number 1-30)。除 quality 外，其余默认均为 true（quality 默认值：10）。",
          properties: {
            showClickIndicators: {
              type: 'boolean',
              description:
                'Show orange circles at click locations (default: true)',
            },
            showDragPaths: {
              type: 'boolean',
              description: 'Show red arrows for drag actions (default: true)',
            },
            showActionLabels: {
              type: 'boolean',
              description:
                'Show black labels describing actions (default: true)',
            },
            showProgressBar: {
              type: 'boolean',
              description: 'Show orange progress bar at bottom (default: true)',
            },
            showWatermark: {
              type: 'boolean',
              description: 'Show Claude logo watermark (default: true)',
            },
            quality: {
              type: 'number',
              description:
                'GIF compression quality, 1-30 (lower = better quality, slower encoding). Default: 10',
            },
          },
        },
      },
      required: ['action', 'tabId'],
    },
  },
  {
    name: 'upload_image',
    description:
      'Upload a previously captured screenshot or user-uploaded image to a file input or drag & drop target. Supports two approaches: (1) ref - for targeting specific elements, especially hidden file inputs, (2) coordinate - for drag & drop to visible locations like Google Docs. Provide either ref or coordinate, not both.',
    inputSchema: {
      type: 'object',
      properties: {
        imageId: {
          type: 'string',
          description:
            '先前捕获的屏幕截图（来自 computer 工具的截图操作）或用户上传图片的 ID',
        },
        ref: {
          type: 'string',
          description:
            '来自 read_page 或 find 工具的元素引用 ID（例如 "ref_1"、"ref_2"）。用于文件输入框（尤其是隐藏的）或特定元素。请提供 ref 或 coordinate 之一，不要同时提供。',
        },
        coordinate: {
          type: 'array',
          items: {
            type: 'number',
          },
          description:
            'Viewport coordinates [x, y] for drag & drop to a visible location. Use this for drag & drop targets like Google Docs. Provide either ref or coordinate, not both.',
        },
        tabId: {
          type: 'number',
          description:
            'Tab ID where the target element is located. This is where the image will be uploaded to.',
        },
        filename: {
          type: 'string',
          description: '上传文件的可选文件名（默认："image.png"）',
        },
      },
      required: ['imageId', 'tabId'],
    },
  },
  {
    name: 'get_page_text',
    description:
      '从页面提取原始文本内容，优先提取文章内容。适用于阅读文章、博客帖子或其他文本密集型页面。返回纯文本，不含 HTML 格式。如果没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用标签页。',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            '要从中提取文本的标签页 ID。必须是当前分组内的标签页。如果没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'tabs_context_mcp',
    title: 'Tabs Context',
    description:
      'Get context information about the current MCP tab group. Returns all tab IDs inside the group if it exists. CRITICAL: You must get the context at least once before using other browser automation tools so you know what tabs exist. Each new conversation should create its own new tab (using tabs_create_mcp) rather than reusing existing tabs, unless the user explicitly asks to use an existing tab.',
    inputSchema: {
      type: 'object',
      properties: {
        createIfEmpty: {
          type: 'boolean',
          description:
            'Creates a new MCP tab group if none exists, creates a new Window with a new tab group containing an empty tab (which can be used for this conversation). If a MCP tab group already exists, this parameter has no effect.',
        },
      },
      required: [],
    },
  },
  {
    name: 'tabs_create_mcp',
    title: 'Tabs Create',
    description:
      'Creates a new empty tab in the MCP tab group. CRITICAL: You must get the context using tabs_context_mcp at least once before using other browser automation tools so you know what tabs exist.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_plan',
    description:
      'Present a plan to the user for approval before taking actions. The user will see the domains you intend to visit and your approach. Once approved, you can proceed with actions on the approved domains without additional permission prompts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        domains: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description:
            "你将访问的域名列表（例如，['github.com', 'stackoverflow.com']）。当用户接受计划时，这些域名将在会话中被批准。",
        },
        approach: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description:
            'High-level description of what you will do. Focus on outcomes and key actions, not implementation details. Be concise - aim for 3-7 items.',
        },
      },
      required: ['domains', 'approach'],
    },
  },
  {
    name: 'read_console_messages',
    description:
      '从特定标签页读取浏览器控制台消息（console.log、console.error、console.warn 等）。用于调试 JavaScript 错误、查看应用程序日志或了解浏览器控制台中发生的情况。仅返回来自当前域的控制台消息。如果你没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用的标签页。重要提示：始终提供一个模式来过滤消息——没有模式，你可能会收到太多不相关的消息。',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            '要从中读取控制台消息的标签页 ID。必须是当前组中的一个标签页。如果你没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
        onlyErrors: {
          type: 'boolean',
          description:
            'If true, only return error and exception messages. Default is false (return all message types).',
        },
        clear: {
          type: 'boolean',
          description:
            'If true, clear the console messages after reading to avoid duplicates on subsequent calls. Default is false.',
        },
        pattern: {
          type: 'string',
          description:
            "用于过滤控制台消息的正则表达式模式。只有匹配此模式的消息才会被返回（例如，'error|warning' 用于查找错误和警告，'MyApp' 用于过滤特定于应用程序的日志）。你应该始终提供一个模式，以避免收到太多不相关的消息。",
        },
        limit: {
          type: 'number',
          description:
            'Maximum number of messages to return. Defaults to 100. Increase only if you need more results.',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'read_network_requests',
    description:
      '从特定标签页读取 HTTP 网络请求（XHR、Fetch、文档、图像等）。用于调试 API 调用、监控网络活动或了解页面正在发出哪些请求。返回当前页面发出的所有网络请求，包括跨域请求。当页面导航到不同域时，请求会自动清除。如果你没有有效的标签页 ID，请先使用 tabs_context_mcp 获取可用的标签页。',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            '要从中读取网络请求的标签页 ID。必须是当前组中的一个标签页。如果你没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
        urlPattern: {
          type: 'string',
          description:
            "用于过滤请求的可选 URL 模式。仅返回 URL 包含此字符串的请求（例如，'/api/' 用于过滤 API 调用，'example.com' 用于按域名过滤）。",
        },
        clear: {
          type: 'boolean',
          description:
            'If true, clear the network requests after reading to avoid duplicates on subsequent calls. Default is false.',
        },
        limit: {
          type: 'number',
          description:
            'Maximum number of requests to return. Defaults to 100. Increase only if you need more results.',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'shortcuts_list',
    description:
      'List all available shortcuts and workflows (shortcuts and workflows are interchangeable). Returns shortcuts with their commands, descriptions, and whether they are workflows. Use shortcuts_execute to run a shortcut or workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            '要从中列出快捷方式的标签页 ID。必须是当前组中的一个标签页。如果你没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'shortcuts_execute',
    description:
      'Execute a shortcut or workflow by running it in a new sidepanel window using the current tab (shortcuts and workflows are interchangeable). Use shortcuts_list first to see available shortcuts. This starts the execution and returns immediately - it does not wait for completion.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            '要在其上执行快捷方式的标签页 ID。必须是当前组中的一个标签页。如果你没有有效的标签页 ID，请先使用 tabs_context_mcp。',
        },
        shortcutId: {
          type: 'string',
          description: 'The ID of the shortcut to execute',
        },
        command: {
          type: 'string',
          description:
            "要执行的快捷方式的命令名称（例如，'debug'、'summarize'）。不要包含前导斜杠。",
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'switch_browser',
    description:
      '切换用于浏览器自动化的 Chrome 浏览器。当用户想要连接到不同的 Chrome 浏览器时调用此功能。向所有安装了扩展程序的 Chrome 浏览器广播连接请求——用户在所需的浏览器中点击“连接”。',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]
