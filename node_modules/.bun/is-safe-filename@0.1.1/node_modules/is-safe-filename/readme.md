# is-safe-filename

> Check if a filename is safe to use in a path join operation

A safe filename is one that won't escape the intended directory via path traversal.

This is a purely lexical check. It does not account for symlinks that may exist on the filesystem.

## Install

```sh
npm install is-safe-filename
```

## Usage

```js
import isSafeFilename from 'is-safe-filename';

isSafeFilename('foo');
//=> true

isSafeFilename('../foo');
//=> false

isSafeFilename('foo/bar');
//=> false
```

## API

### isSafeFilename(filename)

Returns `true` if the filename is safe.

### assertSafeFilename(filename)

Throws an error if the filename is not safe.

```js
import {assertSafeFilename} from 'is-safe-filename';

assertSafeFilename('foo');
// No error

assertSafeFilename('../foo');
//=> Error: Unsafe filename: "../foo"
```

### unsafeFilenameFixtures

A list of common unsafe filename fixtures for testing path traversal vulnerabilities.

Useful for testing that your code properly rejects unsafe filenames.

```js
import {unsafeFilenameFixtures} from 'is-safe-filename';

for (const filename of unsafeFilenameFixtures) {
	assert.throws(() => myFunction(filename));
}
```
