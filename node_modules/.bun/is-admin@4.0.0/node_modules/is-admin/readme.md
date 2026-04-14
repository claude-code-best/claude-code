# is-admin

> Check if the process is running as administrator on Windows

## Install

```
$ npm install is-admin
```

## Usage

```js
import isAdmin from 'is-admin';

console.log(await isAdmin());
//=> false
```

## API

### isAdmin()

Returns a `Promise<boolean>` indicating whether the process is running as administrator.

## Related

- [is-elevated](https://github.com/sindresorhus/is-elevated) - Check if the process is running with elevated privileges *(cross-platform)*
