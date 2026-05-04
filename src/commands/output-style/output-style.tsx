import type { LocalJSXCommandOnDone } from '../../types/command.js';

export async function call(onDone: LocalJSXCommandOnDone): Promise<undefined> {
  onDone(
    '/output-style 参数已弃用。请使用 /config 命令更改输出样式，或在设置文件中进行配置。更改将在下次会话时生效。',
    { display: 'system' },
  );
}
