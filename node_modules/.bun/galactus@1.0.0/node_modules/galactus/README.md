Galactus
-----------

> A JS implementation of `prune --production`

## Installation

```bash
npm i --save-dev galactus
```

## API

### Class: `DestroyerOfModules`

```js
import { DestroyerOfModules } from 'galactus';

// modulePath is the root folder of your module
const destroyer = new DestroyerOfModules({
  rootDirectory: __dirname,
  // Optionally provide your own walker from 'flora-colossus'
  walker: myWalker,
  // Optionally provide a method to override the default
  // keep or destroy test
  shouldKeepModuleTest: (module, isDepDep) => true,
});
```

#### `destroyer.destroy()`

Returns a `Promise` that resolves once the destruction is complete. By default
it will destroy all dependencies that aren't required for production or
optional dependencies. You can override this behavior by providing a
`shouldKeepModuleTest` function in the constructor.

#### `destroyer.collectKeptModules()`

Returns a `Promise` of a `ModuleMap` (a `Map` of paths to `Module`s). The
`Promise` resolves when the walker finishes walking the module tree. The
`ModuleMap` only contains the `Module`s that would be kept by a call
to `destroy()`.

There is one optional keyword argument, `relativePaths`. By default, the paths
in the `ModuleMap` are absolute. If `relativePaths` is `true`, they are relative
to the `rootDirectory` specified in the constructor.
