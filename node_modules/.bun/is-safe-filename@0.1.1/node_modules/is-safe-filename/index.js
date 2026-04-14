export const unsafeFilenameFixtures = Object.freeze([
	'',
	'   ',
	'.',
	'..',
	' .',
	'. ',
	' ..',
	'.. ',
	'../',
	'../foo',
	'foo/../bar',
	'foo/bar',
	'foo\\bar',
	'foo\0bar',
]);

export default function isSafeFilename(filename) {
	if (typeof filename !== 'string') {
		return false;
	}

	const trimmed = filename.trim();

	return trimmed !== ''
		&& trimmed !== '.'
		&& trimmed !== '..'
		&& !filename.includes('/')
		&& !filename.includes('\\')
		&& !filename.includes('\0');
}

export function assertSafeFilename(filename) {
	if (typeof filename !== 'string') {
		throw new TypeError('Expected a string');
	}

	if (!isSafeFilename(filename)) {
		throw new Error(`Unsafe filename: ${JSON.stringify(filename)}`);
	}
}
