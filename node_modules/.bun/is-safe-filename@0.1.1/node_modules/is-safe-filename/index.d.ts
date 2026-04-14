/**
A list of common unsafe filename fixtures for testing path traversal vulnerabilities.

Useful for testing that your code properly rejects unsafe filenames.

@example
```
import {unsafeFilenameFixtures} from 'is-safe-filename';

for (const filename of unsafeFilenameFixtures) {
	assert.throws(() => myFunction(filename));
}
```
*/
export const unsafeFilenameFixtures: readonly string[];

/**
Checks if a filename is safe to use in a path join operation.

A safe filename is one that won't escape the intended directory via path traversal.

This is a purely lexical check. It does not account for symlinks that may exist on the filesystem.

@param filename - The filename to check.
@returns `true` if the filename is safe.

@example
```
import isSafeFilename from 'is-safe-filename';

isSafeFilename('foo');
//=> true

isSafeFilename('../foo');
//=> false

isSafeFilename('foo/bar');
//=> false
```
*/
export default function isSafeFilename(filename: string): boolean;

/**
Throws an error if the filename is not safe to use in a path join operation.

@param filename - The filename to check.
@throws If the filename is unsafe.

@example
```
import {assertSafeFilename} from 'is-safe-filename';

assertSafeFilename('foo'); // No error

assertSafeFilename('../foo');
//=> Error: Unsafe filename: "../foo"
```
*/
export function assertSafeFilename(filename: string): void;
