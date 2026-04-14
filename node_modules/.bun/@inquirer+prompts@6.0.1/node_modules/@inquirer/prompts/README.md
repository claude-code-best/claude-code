<img width="75px" height="75px" align="right" alt="Inquirer Logo" src="https://raw.githubusercontent.com/SBoudrias/Inquirer.js/main/assets/inquirer_readme.svg?sanitize=true" title="Inquirer.js"/>

# Inquirer

[![npm](https://badge.fury.io/js/@inquirer%2Fprompts.svg)](https://www.npmjs.com/package/@inquirer/prompts)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FSBoudrias%2FInquirer.js.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FSBoudrias%2FInquirer.js?ref=badge_shield)

A collection of common interactive command line user interfaces.

![List prompt](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/list.svg)

Give it a try in your own terminal!

```sh
npx @inquirer/demo@latest
```

# Installation

<table>
<tr>
  <th>npm</th>
  <th>yarn</th>
</tr>
<tr>
<td>

```sh
npm install @inquirer/prompts
```

</td>
<td>

```sh
yarn add @inquirer/prompts
```

</td>
</tr>
</table>

> [!NOTE]
> Inquirer recently underwent a rewrite from the ground up to reduce the package size and improve performance. The previous version of the package is still maintained (though not actively developed), and offered hundreds of community contributed prompts that might not have been migrated to the latest API. If this is what you're looking for, the [previous package is over here](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/inquirer).

# Usage

```js
import { input } from '@inquirer/prompts';

const answer = await input({ message: 'Enter your name' });
```

# Prompts

## [Input](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/input)

![Input prompt](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/input.svg)

```js
import { input } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/input) for usage example and options documentation.

## [Select](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/select)

![Select prompt](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/list.svg)

```js
import { select } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/select) for usage example and options documentation.

## [Checkbox](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/checkbox)

![Checkbox prompt](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/checkbox.svg)

```js
import { checkbox } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/checkbox) for usage example and options documentation.

## [Confirm](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/confirm)

![Confirm prompt](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/confirm.svg)

```js
import { confirm } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/confirm) for usage example and options documentation.

## [Search](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/search)

![search prompt](https://raw.githubusercontent.com/SBoudrias/Inquirer.js/f459199e679aec7676cecc0fc12ef8a4cd3dda0b/assets/screenshots/search.png)

```js
import { search } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/search) for usage example and options documentation.

## [Password](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/password)

![Password prompt](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/password.svg)

```js
import { password } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/password) for usage example and options documentation.

## [Expand](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/expand)

![Expand prompt closed](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/expand-y.svg)
![Expand prompt expanded](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/expand-d.svg)

```js
import { expand } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/expand) for usage example and options documentation.

## [Editor](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/editor)

Launches an instance of the users preferred editor on a temporary file. Once the user exits their editor, the content of the temporary file is read as the answer. The editor used is determined by reading the $VISUAL or $EDITOR environment variables. If neither of those are present, the OS default is used (notepad on Windows, vim on Mac or Linux.)

```js
import { editor } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/editor) for usage example and options documentation.

## [Number](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/number)

Very similar to the `input` prompt, but with built-in number validation configuration option.

```js
import { number } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/number) for usage example and options documentation.

## [Raw List](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/rawlist)

![Raw list prompt](https://cdn.rawgit.com/SBoudrias/Inquirer.js/28ae8337ba51d93e359ef4f7ee24e79b69898962/assets/screenshots/rawlist.svg)

```js
import { rawlist } from '@inquirer/prompts';
```

[See documentation](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/rawlist) for usage example and options documentation.

# Create your own prompts

The [API documentation is over here](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/core), and our [testing utilities here](https://github.com/SBoudrias/Inquirer.js/tree/main/packages/testing).

# Advanced usage

All inquirer prompts are a function taking 2 arguments. The first argument is the prompt configuration (unique to each prompt). The second is providing contextual or runtime configuration.

The context options are:

| Property          | Type                    | Required | Description                                                  |
| ----------------- | ----------------------- | -------- | ------------------------------------------------------------ |
| input             | `NodeJS.ReadableStream` | no       | The stdin stream (defaults to `process.stdin`)               |
| output            | `NodeJS.WritableStream` | no       | The stdout stream (defaults to `process.stdout`)             |
| clearPromptOnDone | `boolean`               | no       | If true, we'll clear the screen after the prompt is answered |
| signal            | `AbortSignal`           | no       | An AbortSignal to cancel prompts asynchronously              |

Example:

```js
import { confirm } from '@inquirer/prompts';

const allowEmail = await confirm(
  { message: 'Do you allow us to send you email?' },
  {
    output: new Stream.Writable({
      write(chunk, _encoding, next) {
        // Do something
        next();
      },
    }),
    clearPromptOnDone: true,
  },
);
```

## Canceling prompt

This can preferably be done with either an `AbortController` or `AbortSignal`.

```js
// Example 1: using built-in AbortSignal utilities
import { confirm } from '@inquirer/prompts';

const answer = await confirm({ ... }, { signal: AbortSignal.timeout(5000) });
```

```js
// Example 1: implementing custom cancellation logic
import { confirm } from '@inquirer/prompts';

const controller = new AbortController();
setTimeout(() => {
  controller.abort(); // This will reject the promise
}, 5000);

const answer = await confirm({ ... }, { signal: controller.signal });
```

Alternatively, all prompt functions are returning a cancelable promise. This special promise type has a `cancel` method that'll cancel and cleanup the prompt.

On calling `cancel`, the answer promise will become rejected.

```js
import { confirm } from '@inquirer/prompts';

const promise = confirm(...); // Warning: for this pattern to work, `await` cannot be used.

promise.cancel();
```

# Recipes

## Get answers in an object

When asking many questions, you might not want to keep one variable per answer everywhere. In which case, you can put the answer inside an object.

```js
import { input, confirm } from '@inquirer/prompts';

const answers = {
  firstName: await input({ message: "What's your first name?" }),
  allowEmail: await confirm({ message: 'Do you allow us to send you email?' }),
};

console.log(answers.firstName);
```

## Ask a question conditionally

Maybe some questions depend on some other question's answer.

```js
import { input, confirm } from '@inquirer/prompts';

const allowEmail = await confirm({ message: 'Do you allow us to send you email?' });

let email;
if (allowEmail) {
  email = await input({ message: 'What is your email address' });
}
```

## Get default value after timeout

```js
import { input } from '@inquirer/prompts';

const answer = await input(
  { message: 'Enter a value (timing out in 5 seconds)' },
  { signal: AbortSignal.timeout(5000) },
).catch((error) => {
  if (error.name === 'AbortPromptError') {
    return 'Default value';
  }

  throw error;
});
```

## Using as pre-commit/git hooks, or scripts

By default scripts ran from tools like `husky`/`lint-staged` might not run inside an interactive shell. In non-interactive shell, Inquirer cannot run, and users cannot send keypress events to the process.

For it to work, you must make sure you start a `tty` (or "interactive" input stream.)

If those scripts are set within your `package.json`, you can define the stream like so:

```json
  "precommit": "my-script < /dev/tty"
```

Or if in a shell script file, you'll do it like so: (on Windows that's likely your only option)

```sh
#!/bin/sh
exec < /dev/tty

node my-script.js
```

## Wait for config

Maybe some question configuration require to await a value.

```js
import { confirm } from '@inquirer/prompts';

const answer = await confirm({ message: await getMessage() });
```

# Community prompts

If you created a cool prompt, [send us a PR adding it](https://github.com/SBoudrias/Inquirer.js/edit/main/README.md) to the list below!

[**Interactive List Prompt**](https://github.com/pgibler/inquirer-interactive-list-prompt)<br/>
Select a choice either with arrow keys + Enter or by pressing a key associated with a choice.

```
? Choose an option:
>   Run command (D)
    Quit (Q)
```

[**Action Select Prompt**](https://github.com/zenithlight/inquirer-action-select)<br/>
Choose an item from a list and choose an action to take by pressing a key.

```
? Choose a file Open <O> Edit <E> Delete <X>
❯ image.png
  audio.mp3
  code.py
```

[**Table Multiple Prompt**](https://github.com/Bartheleway/inquirer-table-multiple)<br/>
Select multiple answer from a table display.

```sh
Choose between choices? (Press <space> to select, <Up and Down> to move rows,
<Left and Right> to move columns)

┌──────────┬───────┬───────┐
│ 1-2 of 2 │ Yes?  │ No?   |
├──────────┼───────┼───────┤
│ Choice 1 │ [ ◯ ] │   ◯   |
├──────────┼───────┼───────┤
│ Choice 2 │   ◯   │   ◯   |
└──────────┴───────┴───────┘

```

[**Toggle Prompt**](https://github.com/skarahoda/inquirer-toggle)<br/>
Confirm with a toggle. Select a choice with arrow keys + Enter.

```
? Do you want to continue? no / yes
```

[**Sortable Checkbox Prompt**](https://github.com/th0r/inquirer-sortable-checkbox)<br/>
The same as built-in checkbox prompt, but also allowing to reorder choices using ctrl+up/down.

```
? Which PRs and in what order would you like to merge? (Press <space> to select, <a> to toggle all, <i> to invert selection, <ctrl+up> to move item up, <ctrl+down> to move item down, and <enter> to proceed)
❯ ◯ PR 1
  ◯ PR 2
  ◯ PR 3
```

[**Multi Select Prompt**](https://github.com/jeffwcx/inquirer-select-pro)

An inquirer select that supports multiple selections and filtering/searching.

```
? Choose your OS, IDE, PL, etc. (Press <tab> to select/deselect, <backspace> to remove selected
option, <enter> to select option)
>>  vue
>[ ] vue
 [ ] vuejs
 [ ] fuelphp
 [ ] venv
 [ ] vercel
 (Use arrow keys to reveal more options)
```

[**File Selector Prompt**](https://github.com/br14n-sol/inquirer-file-selector)<br/>
A file selector, you can navigate freely between directories, choose what type of files you want to allow and it is fully customizable.

```sh
? Select a file:
/main/path/
├── folder1/
├── folder2/
├── folder3/
├── file1.txt
├── file2.pdf
└── file3.jpg (not allowed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use ↑↓ to navigate through the list
Press <esc> to navigate to the parent directory
Press <enter> to select a file or navigate to a directory
```

# License

Copyright (c) 2023 Simon Boudrias (twitter: [@vaxilart](https://twitter.com/Vaxilart))<br/>
Licensed under the MIT license.
