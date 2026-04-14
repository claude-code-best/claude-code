# Installation
> `npm install --save @types/plist`

# Summary
This package contains type definitions for plist (https://github.com/TooTallNate/node-plist#readme).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/plist.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/plist/index.d.ts)
````ts
/// <reference types="node" />
import { XMLToStringOptions } from "xmlbuilder";

// plist
export as namespace plist;

// plist.parse()
export function parse(xml: string): PlistValue;
// plist.build()
export function build(obj: PlistValue, opts?: PlistBuildOptions): string;

// PlistValue
export type PlistValue = string | number | boolean | Date | Buffer | PlistObject | PlistArray;
export interface PlistObject {
    readonly [x: string]: PlistValue;
}
export interface PlistArray extends ReadonlyArray<PlistValue> {}

// PlistBuildOptions
// The instance of this type is passed to 'xmlbuilder' module as it is.
export type PlistBuildOptions = XMLToStringOptions;

````

### Additional Details
 * Last updated: Tue, 07 Nov 2023 09:09:39 GMT
 * Dependencies: [@types/node](https://npmjs.com/package/@types/node), [xmlbuilder](https://npmjs.com/package/xmlbuilder)

# Credits
These definitions were written by [Yusuke Higuchi](https://github.com/higuri).
