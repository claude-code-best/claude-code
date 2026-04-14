import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import ansiStyles from 'ansi-styles';

const ANSI_ESCAPE = '\u001B';
const ANSI_ESCAPE_CSI = '\u009B';
const ESCAPES = new Set([
	ANSI_ESCAPE,
	ANSI_ESCAPE_CSI,
]);

const ANSI_ESCAPE_BELL = '\u0007';
const ANSI_CSI = '[';
const ANSI_OSC = ']';
const ANSI_SGR_TERMINATOR = 'm';
const ANSI_SGR_RESET = 0;
const ANSI_SGR_RESET_FOREGROUND = 39;
const ANSI_SGR_RESET_BACKGROUND = 49;
const ANSI_SGR_RESET_UNDERLINE_COLOR = 59;
const ANSI_SGR_FOREGROUND_EXTENDED = 38;
const ANSI_SGR_BACKGROUND_EXTENDED = 48;
const ANSI_SGR_UNDERLINE_COLOR_EXTENDED = 58;
const ANSI_SGR_COLOR_MODE_256 = 5;
const ANSI_SGR_COLOR_MODE_RGB = 2;
const ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
const ANSI_ESCAPE_REGEX = new RegExp(`^\\u001B(?:\\${ANSI_CSI}(?<sgr>[0-9;]*)${ANSI_SGR_TERMINATOR}|${ANSI_ESCAPE_LINK}(?<uri>[^\\u0007\\u001B]*)(?:\\u0007|\\u001B\\\\))`);
const ANSI_ESCAPE_CSI_REGEX = new RegExp(`^\\u009B(?<sgr>[0-9;]*)${ANSI_SGR_TERMINATOR}`);
const ANSI_SGR_MODIFIER_CLOSE_CODES = new Set(ansiStyles.codes.values());
ANSI_SGR_MODIFIER_CLOSE_CODES.delete(ANSI_SGR_RESET);

const segmenter = new Intl.Segmenter();
const getGraphemes = string => Array.from(segmenter.segment(string), ({segment}) => segment);
const TAB_SIZE = 8;

const wrapAnsiCode = code => `${ANSI_ESCAPE}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
const wrapAnsiHyperlink = url => `${ANSI_ESCAPE}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;

const getSgrTokens = sgrParameters => {
	const codes = sgrParameters.split(';').map(sgrParameter => sgrParameter === '' ? ANSI_SGR_RESET : Number.parseInt(sgrParameter, 10));
	const sgrTokens = [];

	for (let index = 0; index < codes.length; index++) {
		const code = codes[index];

		if (!Number.isFinite(code)) {
			continue;
		}

		if (
			(
				code === ANSI_SGR_FOREGROUND_EXTENDED
				|| code === ANSI_SGR_BACKGROUND_EXTENDED
				|| code === ANSI_SGR_UNDERLINE_COLOR_EXTENDED
			)
		) {
			if (index + 1 >= codes.length) {
				break;
			}

			const mode = codes[index + 1];

			if (mode === ANSI_SGR_COLOR_MODE_256 && Number.isFinite(codes[index + 2])) {
				sgrTokens.push([code, mode, codes[index + 2]]);
				index += 2;
				continue;
			}

			const red = codes[index + 2];
			const green = codes[index + 3];
			const blue = codes[index + 4];
			if (
				mode === ANSI_SGR_COLOR_MODE_RGB
				&& Number.isFinite(red)
				&& Number.isFinite(green)
				&& Number.isFinite(blue)
			) {
				sgrTokens.push([code, mode, red, green, blue]);
				index += 4;
				continue;
			}

			break;
		}

		sgrTokens.push([code]);
	}

	return sgrTokens;
};

const removeActiveStyle = (activeStyles, family) => {
	const activeStyleIndex = activeStyles.findIndex(activeStyle => activeStyle.family === family);

	if (activeStyleIndex !== -1) {
		activeStyles.splice(activeStyleIndex, 1);
	}
};

const upsertActiveStyle = (activeStyles, nextActiveStyle) => {
	removeActiveStyle(activeStyles, nextActiveStyle.family);
	activeStyles.push(nextActiveStyle);
};

const removeModifierStylesByClose = (activeStyles, closeCode) => {
	for (let index = activeStyles.length - 1; index >= 0; index--) {
		const activeStyle = activeStyles[index];
		if (activeStyle.family.startsWith('modifier-') && activeStyle.close === closeCode) {
			activeStyles.splice(index, 1);
		}
	}
};

const getColorStyle = (code, sgrToken) => {
	if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97) || (code === ANSI_SGR_FOREGROUND_EXTENDED && sgrToken.length > 1)) {
		return {
			family: 'foreground',
			open: sgrToken.join(';'),
			close: ANSI_SGR_RESET_FOREGROUND,
		};
	}

	if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107) || (code === ANSI_SGR_BACKGROUND_EXTENDED && sgrToken.length > 1)) {
		return {
			family: 'background',
			open: sgrToken.join(';'),
			close: ANSI_SGR_RESET_BACKGROUND,
		};
	}

	if (code === ANSI_SGR_UNDERLINE_COLOR_EXTENDED && sgrToken.length > 1) {
		return {
			family: 'underlineColor',
			open: sgrToken.join(';'),
			close: ANSI_SGR_RESET_UNDERLINE_COLOR,
		};
	}
};

const applySgrResetCode = (code, activeStyles) => {
	if (code === ANSI_SGR_RESET) {
		activeStyles.length = 0;
		return true;
	}

	if (code === ANSI_SGR_RESET_FOREGROUND) {
		removeActiveStyle(activeStyles, 'foreground');
		return true;
	}

	if (code === ANSI_SGR_RESET_BACKGROUND) {
		removeActiveStyle(activeStyles, 'background');
		return true;
	}

	if (code === ANSI_SGR_RESET_UNDERLINE_COLOR) {
		removeActiveStyle(activeStyles, 'underlineColor');
		return true;
	}

	if (ANSI_SGR_MODIFIER_CLOSE_CODES.has(code)) {
		removeModifierStylesByClose(activeStyles, code);
		return true;
	}

	return false;
};

const applySgrToken = (sgrToken, activeStyles) => {
	const [code] = sgrToken;

	if (applySgrResetCode(code, activeStyles)) {
		return;
	}

	const colorStyle = getColorStyle(code, sgrToken);
	if (colorStyle) {
		upsertActiveStyle(activeStyles, colorStyle);
		return;
	}

	const close = ansiStyles.codes.get(code);
	if (close !== undefined && close !== ANSI_SGR_RESET) {
		upsertActiveStyle(activeStyles, {
			family: `modifier-${code}`,
			open: sgrToken.join(';'),
			close,
		});
	}
};

const applySgrParameters = (sgrParameters, activeStyles) => {
	for (const sgrToken of getSgrTokens(sgrParameters)) {
		applySgrToken(sgrToken, activeStyles);
	}
};

const applySgrResets = (sgrParameters, activeStyles) => {
	for (const sgrToken of getSgrTokens(sgrParameters)) {
		const [code] = sgrToken;
		applySgrResetCode(code, activeStyles);
	}
};

const applyLeadingSgrResets = (string, activeStyles) => {
	let remainder = string;

	while (remainder.length > 0) {
		if (remainder.startsWith(ANSI_ESCAPE) && remainder[1] !== '\\') {
			const match = ANSI_ESCAPE_REGEX.exec(remainder);
			if (!match) {
				break;
			}

			if (match.groups.sgr !== undefined) {
				applySgrResets(match.groups.sgr, activeStyles);
			}

			remainder = remainder.slice(match[0].length);
			continue;
		}

		if (remainder.startsWith(ANSI_ESCAPE_CSI)) {
			const match = ANSI_ESCAPE_CSI_REGEX.exec(remainder);
			if (!match || match.groups.sgr === undefined) {
				break;
			}

			applySgrResets(match.groups.sgr, activeStyles);
			remainder = remainder.slice(match[0].length);
			continue;
		}

		break;
	}
};

const getClosingSgrSequence = activeStyles => [...activeStyles].reverse().map(activeStyle => wrapAnsiCode(activeStyle.close)).join('');
const getOpeningSgrSequence = activeStyles => activeStyles.map(activeStyle => wrapAnsiCode(activeStyle.open)).join('');

// Calculate the length of words split on ' ', ignoring
// the extra characters added by ANSI escape codes
const wordLengths = string => string.split(' ').map(word => stringWidth(word));

// Wrap a long word across multiple rows
// ANSI escape codes do not count towards length
const wrapWord = (rows, word, columns) => {
	const characters = getGraphemes(word);

	let isInsideEscape = false;
	let isInsideLinkEscape = false;
	let visible = stringWidth(stripAnsi(rows.at(-1)));

	for (const [index, character] of characters.entries()) {
		const characterLength = stringWidth(character);

		if (visible + characterLength <= columns) {
			rows[rows.length - 1] += character;
		} else {
			rows.push(character);
			visible = 0;
		}

		if (ESCAPES.has(character) && !(isInsideLinkEscape && character === ANSI_ESCAPE && characters[index + 1] === '\\')) {
			isInsideEscape = true;

			const ansiEscapeLinkCandidate = characters.slice(index + 1, index + 1 + ANSI_ESCAPE_LINK.length).join('');
			isInsideLinkEscape = ansiEscapeLinkCandidate === ANSI_ESCAPE_LINK;
		}

		if (isInsideEscape) {
			if (isInsideLinkEscape) {
				if (
					character === ANSI_ESCAPE_BELL
					|| (character === '\\' && index > 0 && characters[index - 1] === ANSI_ESCAPE) // ST terminator (ESC \)
				) {
					isInsideEscape = false;
					isInsideLinkEscape = false;
				}
			} else if (character === ANSI_SGR_TERMINATOR) {
				isInsideEscape = false;
			}

			continue;
		}

		visible += characterLength;

		if (visible === columns && index < characters.length - 1) {
			rows.push('');
			visible = 0;
		}
	}

	// It's possible that the last row we copy over is only
	// ANSI escape characters, handle this edge-case
	if (!visible && rows.at(-1).length > 0 && rows.length > 1) {
		rows[rows.length - 2] += rows.pop();
	}
};

// Trims spaces from a string ignoring invisible sequences
const stringVisibleTrimSpacesRight = string => {
	const words = string.split(' ');
	let last = words.length;

	while (last > 0) {
		if (stringWidth(words[last - 1]) > 0) {
			break;
		}

		last--;
	}

	if (last === words.length) {
		return string;
	}

	return words.slice(0, last).join(' ') + words.slice(last).join('');
};

const expandTabs = line => {
	if (!line.includes('\t')) {
		return line;
	}

	const segments = line.split('\t');
	let visible = 0;
	let expandedLine = '';

	for (const [index, segment] of segments.entries()) {
		expandedLine += segment;
		visible += stringWidth(segment);

		if (index < segments.length - 1) {
			const spaces = TAB_SIZE - (visible % TAB_SIZE);
			expandedLine += ' '.repeat(spaces);
			visible += spaces;
		}
	}

	return expandedLine;
};

// The wrap-ansi module can be invoked in either 'hard' or 'soft' wrap mode.
//
// 'hard' will never allow a string to take up more than columns characters.
//
// 'soft' allows long words to expand past the column length.
const exec = (string, columns, options = {}) => {
	if (options.trim !== false && string.trim() === '') {
		return '';
	}

	let returnValue = '';
	let escapeUrl;
	const activeStyles = [];

	const lengths = wordLengths(string);
	let rows = [''];

	for (const [index, word] of string.split(' ').entries()) {
		if (options.trim !== false) {
			rows[rows.length - 1] = rows.at(-1).trimStart();
		}

		let rowLength = stringWidth(rows.at(-1));

		if (index !== 0) {
			if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
				// If we start with a new word but the current row length equals the length of the columns, add a new row
				rows.push('');
				rowLength = 0;
			}

			if (rowLength > 0 || options.trim === false) {
				rows[rows.length - 1] += ' ';
				rowLength++;
			}
		}

		// In 'hard' wrap mode, the length of a line is never allowed to extend past 'columns'
		if (options.hard && options.wordWrap !== false && lengths[index] > columns) {
			const remainingColumns = columns - rowLength;
			const breaksStartingThisLine = 1 + Math.floor((lengths[index] - remainingColumns - 1) / columns);
			const breaksStartingNextLine = Math.floor((lengths[index] - 1) / columns);
			if (breaksStartingNextLine < breaksStartingThisLine) {
				rows.push('');
			}

			wrapWord(rows, word, columns);
			continue;
		}

		if (rowLength + lengths[index] > columns && rowLength > 0 && lengths[index] > 0) {
			if (options.wordWrap === false && rowLength < columns) {
				wrapWord(rows, word, columns);
				continue;
			}

			rows.push('');
		}

		if (rowLength + lengths[index] > columns && options.wordWrap === false) {
			wrapWord(rows, word, columns);
			continue;
		}

		rows[rows.length - 1] += word;
	}

	if (options.trim !== false) {
		rows = rows.map(row => stringVisibleTrimSpacesRight(row));
	}

	const preString = rows.join('\n');
	const pre = getGraphemes(preString);

	// We need to keep a separate index as `String#slice()` works on Unicode code units, while `pre` is an array of grapheme clusters.
	let preStringIndex = 0;

	for (const [index, character] of pre.entries()) {
		returnValue += character;

		if (character === ANSI_ESCAPE && pre[index + 1] !== '\\') {
			const {groups} = ANSI_ESCAPE_REGEX.exec(preString.slice(preStringIndex)) || {groups: {}};
			if (groups.sgr !== undefined) {
				applySgrParameters(groups.sgr, activeStyles);
			} else if (groups.uri !== undefined) {
				escapeUrl = groups.uri.length === 0 ? undefined : groups.uri;
			}
		} else if (character === ANSI_ESCAPE_CSI) {
			const {groups} = ANSI_ESCAPE_CSI_REGEX.exec(preString.slice(preStringIndex)) || {groups: {}};
			if (groups.sgr !== undefined) {
				applySgrParameters(groups.sgr, activeStyles);
			}
		}

		if (pre[index + 1] === '\n') {
			if (escapeUrl) {
				returnValue += wrapAnsiHyperlink('');
			}

			returnValue += getClosingSgrSequence(activeStyles);
		} else if (character === '\n') {
			const openingStyles = [...activeStyles];
			applyLeadingSgrResets(preString.slice(preStringIndex + 1), openingStyles);
			returnValue += getOpeningSgrSequence(openingStyles);

			if (escapeUrl) {
				returnValue += wrapAnsiHyperlink(escapeUrl);
			}
		}

		preStringIndex += character.length;
	}

	return returnValue;
};

// For each newline, invoke the method separately
export default function wrapAnsi(string, columns, options) {
	return String(string)
		.normalize()
		.replaceAll('\r\n', '\n')
		.split('\n')
		.map(line => exec(expandTabs(line), columns, options))
		.join('\n');
}
