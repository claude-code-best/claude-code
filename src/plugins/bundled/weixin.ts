import { registerBuiltinPlugin } from '../builtinPlugins.js'
import { buildCliLaunch } from '../../utils/cliLaunch.js'

export function registerWeixinBuiltinPlugin(): void {
  const launch = buildCliLaunch(['weixin', 'serve'])

  registerBuiltinPlugin({
    name: 'weixin',
    description:
      'WeChat channel integration. Enables inbound WeChat messages via channels and provides reply/send_typing MCP tools. Configure with `ccb weixin login` and enable for a session with `--channels plugin:weixin@builtin`.',
    version: MACRO.VERSION,
    defaultEnabled: true,
    mcpServers: {
      weixin: {
        type: 'stdio',
        command: launch.execPath,
        args: launch.args,
      },
    },
  })
}
