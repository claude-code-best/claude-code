# Installation
> `npm install --save @types/proper-lockfile`

# Summary
This package contains type definitions for proper-lockfile (https://github.com/moxystudio/node-proper-lockfile).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/proper-lockfile.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/proper-lockfile/index.d.ts)
````ts
import { OperationOptions } from "retry";

export interface LockOptions {
    stale?: number | undefined; // default: 10000
    update?: number | undefined; // default: stale/2
    retries?: number | OperationOptions | undefined; // default: 0
    realpath?: boolean | undefined; // default: true
    fs?: any; // default: graceful-fs
    onCompromised?: ((err: Error) => any) | undefined; // default: (err) => throw err
    lockfilePath?: string | undefined; // default: `${file}.lock`
}

export interface UnlockOptions {
    realpath?: boolean | undefined; // default: true
    fs?: any; // default: graceful-fs
    lockfilePath?: string | undefined; // default: `${file}.lock`
}

export interface CheckOptions {
    stale?: number | undefined; // default: 10000
    realpath?: boolean | undefined; // default: true
    fs?: any; // default: graceful-fs
    lockfilePath?: string | undefined; // default: `${file}.lock`
}

export function lock(file: string, options?: LockOptions): Promise<() => Promise<void>>;
export function unlock(file: string, options?: UnlockOptions): Promise<void>;
export function check(file: string, options?: CheckOptions): Promise<boolean>;

export function lockSync(file: string, options?: LockOptions): () => void;
export function unlockSync(file: string, options?: UnlockOptions): void;
export function checkSync(file: string, options?: CheckOptions): boolean;

````

### Additional Details
 * Last updated: Tue, 07 Nov 2023 09:09:39 GMT
 * Dependencies: [@types/retry](https://npmjs.com/package/@types/retry)

# Credits
These definitions were written by [Nikita Volodin](https://github.com/qlonik), [Linus Unnebäck](https://github.com/LinusU), and [ulrichb](https://github.com/ulrichb).
