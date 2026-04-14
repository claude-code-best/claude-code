/**
Check if the process is running as administrator on Windows.

@returns Whether the process is running as administrator.

@example
```
import isAdmin from 'is-admin';

console.log(await isAdmin());
//=> false
```
*/
export default function isAdmin(): Promise<boolean>;
