# fd-package-json

Finds the closest `package.json` and returns the path or the contents.

## Install

```sh
npm i -S fd-package-json
```

## Usage

To retrieve the path of the closest package, you can use `findPackagePath`:

```ts
import {findPackagePath} from 'fd-package-json';

// Closest package path to cwd of the process
await findPackagePath(process.cwd());

// Closest package path to the current file (CJS)
await findPackagePath(__dirname);

// Closest package path to the current file (ESM)
await findPackagePath(fileURLToPath(new URL('.', import.meta.url)));
```

To retrieve the package itself, you may use `findPackage` with the same
parameter:

```ts
await findPackage(process.cwd()); // Returns the JSON of the package if found
```

Synchronous methods also exist:

```ts
findPackageSync(process.cwd()); // returns the package

findPackagePathSync(process.cwd()); // returns the package path
```

## License

MIT
