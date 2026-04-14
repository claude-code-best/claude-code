# cli-boxes

> Boxes for use in the terminal

The list of boxes is just a [JSON file](boxes.json) and can be used anywhere.

## Install

```sh
npm install cli-boxes
```

## Usage

```js
import cliBoxes from 'cli-boxes';

console.log(cliBoxes.single);
/*
{
	topLeft: '┌',
	top: '─',
	topRight: '┐',
	right: '│',
	bottomRight: '┘',
	bottom: '─',
	bottomLeft: '└',
	left: '│'
}
*/
```

## API

### cliBoxes

#### `single`

```
┌────┐
│    │
└────┘
```

#### `double`

```
╔════╗
║    ║
╚════╝
```

#### `round`

```
╭────╮
│    │
╰────╯
```

#### `bold`

```
┏━━━━┓
┃    ┃
┗━━━━┛
```

#### `singleDouble`

```
╓────╖
║    ║
╙────╜
```

#### `doubleSingle`

```
╒════╕
│    │
╘════╛
```

#### `classic`

```
+----+
|    |
+----+
```

#### `arrow`

```
↘↓↓↓↓↙
→    ←
↗↑↑↑↑↖
```

## Related

- [boxen](https://github.com/sindresorhus/boxen) - Create boxes in the terminal
