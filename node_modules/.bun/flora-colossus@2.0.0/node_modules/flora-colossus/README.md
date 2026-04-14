Flora Colossus
-----------

> Walk your node_modules tree

## Installation

```bash
npm i --save-dev flora-colossus
```

## API

### Enum: `DepType`

```js
import { DepType } from 'flora-colossus';

// DepType.PROD --> Production dependency
// DepType.OPTIONAL --> Optional dependency
// DepType.DEV --> Development dependency
// DepType.DEV_OPTIONAL --> Optional dependency of a development dependency
// DepType.ROOT --> The root module
```

####

### Class: `Walker`

```js
import { Walker } from 'flora-colossus';

// modulePath is the root folder of your module
const walker = new Walker(modulePath);
```

#### `walker.walkTree()`

Returns `Promise<Module[]>`

Will walk your entire node_modules tree reporting back an array of "modules", each
module has a "path", "name" and "depType".  See the typescript definition file
for more information.