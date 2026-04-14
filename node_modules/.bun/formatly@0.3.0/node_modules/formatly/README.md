<h1 align="center">Formatly</h1>

<p align="center">
	Formats your code with whatever formatter your project is already using.
	🧼
</p>

<p align="center">
	<!-- prettier-ignore-start -->
	<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
	<a href="#contributors" target="_blank"><img alt="👪 All Contributors: 5" src="https://img.shields.io/badge/%F0%9F%91%AA_all_contributors-5-21bb42.svg" /></a>
<!-- ALL-CONTRIBUTORS-BADGE:END -->
	<!-- prettier-ignore-end -->
	<a href="https://github.com/JoshuaKGoldberg/formatly/blob/main/.github/CODE_OF_CONDUCT.md" target="_blank"><img alt="🤝 Code of Conduct: Kept" src="https://img.shields.io/badge/%F0%9F%A4%9D_code_of_conduct-kept-21bb42" /></a>
	<a href="https://codecov.io/gh/JoshuaKGoldberg/formatly" target="_blank"><img alt="🧪 Coverage" src="https://img.shields.io/codecov/c/github/JoshuaKGoldberg/formatly?label=%F0%9F%A7%AA%20coverage" /></a>
	<a href="https://github.com/JoshuaKGoldberg/formatly/blob/main/LICENSE.md" target="_blank"><img alt="📝 License: MIT" src="https://img.shields.io/badge/%F0%9F%93%9D_license-MIT-21bb42.svg" /></a>
	<a href="http://npmjs.com/package/formatly" target="_blank"><img alt="📦 npm version" src="https://img.shields.io/npm/v/formatly?color=21bb42&label=%F0%9F%93%A6%20npm" /></a>
	<img alt="💪 TypeScript: Strict" src="https://img.shields.io/badge/%F0%9F%92%AA_typescript-strict-21bb42.svg" />
</p>

## Usage

`formatly` can automatically detect and format with:

- [Biome](https://biomejs.dev/formatter)
- [deno fmt](https://docs.deno.com/runtime/reference/cli/fmt)
- [dprint](https://dprint.dev)
- [Prettier](https://prettier.io)

See [Formatter Detection](#formatter-detection) for details on how they are detected.

### CLI

```shell
npx formatly <files>
```

`formatly` takes in any number of glob patterns.
It will then:

1. Detect which [supported formatter](#supported-formatters) is configured in the repository
2. Pass those glob patterns directly to the formatter

For example, to match all directories and folders in the current directory:

```shell
npx formatly *
```

To match only `.ts` files in `src/`:

```shell
npx formatly "src/**/*.ts"
```

### Node.js API

```shell
npm i formatly
```

The `formatly` package exports the functions used by the `formatly` CLI.

#### `formatly`

Runs formatting on any number of glob pattern `string`s.

```ts
import { formatly } from "formatly";

await formatly(["*"]);
```

Parameters:

1. `patterns: string[]` _(required)_: any number of glob patterns
2. `options: FormatlyOptions` _(optional)_:
   - `cwd: string` _(optional)_: working directory, if not `"."`
   - `formatter: FormatterName` _(optional)_: explicit formatter to use instead of detecting one, supports `"biome"`, `"deno"`, `"dprint"`, and `"prettier"`

Resolves with a `FormatlyReport`, which is either:

- `FormatlyReportError` if a formatter could not be determined, which an object containing:
  - `ran: false`
- `FormatlyReportResult` if a formatter could be determined, which is an object containing:
  - `formatter: Formatter`: as resolved by [`resolveFormatter`](#resolveformatter)
  - `ran: true`
  - `result: FormatlyReportChildProcessResult`:
    - `code: number | null`: exit code of the child process
    - `signal: NodeJS.Signal | null`: signal that terminated the child process

For example, to run formatting on TypeScript source files in a child directory and check the result:

```ts
import { formatly } from "formatly";

const report = await formatly(["src/**/*.ts"], { cwd: "path/to/project" });

if (!report.ran) {
	console.error("Could not determine formatter.");
	return;
}

const { formatter, result } = report;

if (result.code) {
	console.error(`Error running ${formatter.runner}:`, result.stderr);
} else {
	console.log(`Formatted with ${formatter.name}! 🧼`);
}
```

#### `resolveFormatter`

Detects which of the [supported formatters](#supported-formatters) to use for a directory.

```ts
import { resolveFormatter } from "formatly";

const formatter = await resolveFormatter();

// {
//   name: "Prettier",
//   runner: "npx prettier --write",
//   testers: { ... }
// }
console.log(formatter);
```

Parameters:

1. `cwd: string` _(optional)_: working directory, if not `"."`

Resolves with either:

- `undefined` if a formatter could not be detected
- `Formatter` if one can be found, which is an object containing:
  - `name: string`: English name of the formatter
  - `runner: string`: the shell command used to run the formatter
  - `testers: object`: strings and regular expressions used to test for the formatter

## Formatter Detection

Formatters are detected based on the first match from, in order:

1. Existence of the formatter's default supported config file name
2. The formatter's name in a `package.json` `fmt` or `format` script
3. Well-known root-level `package.json` key

### Supported Formatters

| Formatter                                                   | Config File                                                                                             | Package Key  | Script     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| [Biome](https://biomejs.dev/formatter)                      | [Configure Biome](https://biomejs.dev/guides/configure-biome)                                           |              | `biome`    |
| [deno fmt](https://docs.deno.com/runtime/reference/cli/fmt) | [Deno Configuration > Formatting](https://docs.deno.com/runtime/fundamentals/configuration/#formatting) |              | `deno`     |
| [dprint](https://dprint.dev)                                | [dprint setup](https://dprint.dev/setup)                                                                |              | `dprint`   |
| [Prettier](https://prettier.io)                             | [Prettier Configuration File](https://prettier.io/docs/en/configuration)                                | `"prettier"` | `prettier` |

> Want support for a formatter not mentioned here?
> Great!
> Please [file a feature request GitHub issue](https://github.com/JoshuaKGoldberg/formatly/issues/new?assignees=&labels=type%3A+feature&projects=&template=03-feature.yml&title=%F0%9F%9A%80+Feature%3A+%3Cshort+description+of+the+feature%3E).
> 🙏

## Why?

Formatly is a tool for any developer tool that creates files for users.
If your tool creates, say, a config file that users are meant to check into their repository, you probably want that file to be formatted per the user's preference.
But there are several popular formatters in use today: it's not enough to just call to `prettier.format`.

Formatly takes away the burden of

- Detecting which formatter -if any- a userland project is using
- Calling to that formatter's API(s) to format the file

### Does Formatly replace Prettier, etc.?

No.
Formatly is a detection + wrapping layer around formatters such as Prettier.
Userland projects still need to configure a formatter themselves.

## Development

See [`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md), then [`.github/DEVELOPMENT.md`](./.github/DEVELOPMENT.md).
Thanks! 🧼

## Contributors

<!-- spellchecker: disable -->
<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://github.com/aleclarson"><img src="https://avatars.githubusercontent.com/u/1925840?v=4?s=100" width="100px;" alt="Alec Larson"/><br /><sub><b>Alec Larson</b></sub></a><br /><a href="#ideas-aleclarson" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/JoshuaKGoldberg/formatly/commits?author=aleclarson" title="Code">💻</a></td>
      <td align="center"><a href="https://bjornlu.com"><img src="https://avatars.githubusercontent.com/u/34116392?v=4?s=100" width="100px;" alt="Bjorn Lu"/><br /><sub><b>Bjorn Lu</b></sub></a><br /><a href="#ideas-bluwy" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/JoshuaKGoldberg/formatly/commits?author=bluwy" title="Code">💻</a> <a href="https://github.com/JoshuaKGoldberg/formatly/issues?q=author%3Abluwy" title="Bug reports">🐛</a></td>
      <td align="center"><a href="http://www.joshuakgoldberg.com/"><img src="https://avatars.githubusercontent.com/u/3335181?v=4?s=100" width="100px;" alt="Josh Goldberg ✨"/><br /><sub><b>Josh Goldberg ✨</b></sub></a><br /><a href="https://github.com/JoshuaKGoldberg/formatly/commits?author=JoshuaKGoldberg" title="Code">💻</a> <a href="#content-JoshuaKGoldberg" title="Content">🖋</a> <a href="#ideas-JoshuaKGoldberg" title="Ideas, Planning, & Feedback">🤔</a> <a href="#infra-JoshuaKGoldberg" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-JoshuaKGoldberg" title="Maintenance">🚧</a> <a href="#projectManagement-JoshuaKGoldberg" title="Project Management">📆</a> <a href="#tool-JoshuaKGoldberg" title="Tools">🔧</a> <a href="https://github.com/JoshuaKGoldberg/formatly/commits?author=JoshuaKGoldberg" title="Documentation">📖</a> <a href="https://github.com/JoshuaKGoldberg/formatly/issues?q=author%3AJoshuaKGoldberg" title="Bug reports">🐛</a></td>
      <td align="center"><a href="https://webpro.nl/"><img src="https://avatars.githubusercontent.com/u/456426?v=4?s=100" width="100px;" alt="Lars Kappert"/><br /><sub><b>Lars Kappert</b></sub></a><br /><a href="https://github.com/JoshuaKGoldberg/formatly/issues?q=author%3Awebpro" title="Bug reports">🐛</a> <a href="https://github.com/JoshuaKGoldberg/formatly/commits?author=webpro" title="Code">💻</a></td>
      <td align="center"><a href="https://github.com/rubiesonthesky"><img src="https://avatars.githubusercontent.com/u/2591240?v=4?s=100" width="100px;" alt="rubiesonthesky"/><br /><sub><b>rubiesonthesky</b></sub></a><br /><a href="https://github.com/JoshuaKGoldberg/formatly/issues?q=author%3Arubiesonthesky" title="Bug reports">🐛</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
<!-- spellchecker: enable -->

> 💝 This package was templated with [`create-typescript-app`](https://github.com/JoshuaKGoldberg/create-typescript-app) using the [Bingo framework](https://create.bingo).
