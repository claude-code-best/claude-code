/**
Style of the box border.
*/
export type BoxStyle = {
	readonly topLeft: string;
	readonly top: string;
	readonly topRight: string;
	readonly right: string;
	readonly bottomRight: string;
	readonly bottom: string;
	readonly bottomLeft: string;
	readonly left: string;
};

/**
All box styles.
*/
export type Boxes = {
	/**
	@example
	```
	┌────┐
	│    │
	└────┘
	```
	*/
	readonly single: BoxStyle;

	/**
	@example
	```
	╔════╗
	║    ║
	╚════╝
	```
	*/
	readonly double: BoxStyle;

	/**
	@example
	```
	╭────╮
	│    │
	╰────╯
	```
	*/
	readonly round: BoxStyle;

	/**
	@example
	```
	┏━━━━┓
	┃    ┃
	┗━━━━┛
	```
	*/
	readonly bold: BoxStyle;

	/**
	@example
	```
	╓────╖
	║    ║
	╙────╜
	```
	*/
	readonly singleDouble: BoxStyle;

	/**
	@example
	```
	╒════╕
	│    │
	╘════╛
	```
	*/
	readonly doubleSingle: BoxStyle;

	/**
	@example
	```
	+----+
	|    |
	+----+
	```
	*/
	readonly classic: BoxStyle;

	/**
	@example
	```
	↘↓↓↓↓↙
	→    ←
	↗↑↑↑↑↖
	```
	*/
	readonly arrow: BoxStyle;
};

/**
Boxes for use in the terminal.

@example
```
import cliBoxes from 'cli-boxes';

console.log(cliBoxes.single);
// {
// 	topLeft: '┌',
// 	top: '─',
// 	topRight: '┐',
// 	right: '│',
// 	bottomRight: '┘',
// 	bottom: '─',
// 	bottomLeft: '└',
// 	left: '│'
// }
```
*/
declare const cliBoxes: Boxes;

export default cliBoxes;
