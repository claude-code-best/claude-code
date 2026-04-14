/**
Creates a supports hyperlinks check for a given stream.

@param stream - Optional stream to check for hyperlink support.
@returns boolean indicating whether hyperlinks are supported.
*/
export function createSupportsHyperlinks(stream?: {isTTY?: boolean}): boolean;

/**
Object containing hyperlink support status for stdout and stderr.
*/
type SupportsHyperlinks = {
	/**
	Whether stdout supports hyperlinks.
	*/
	stdout: boolean;
	/**
	Whether stderr supports hyperlinks.
	*/
	stderr: boolean;
};

declare const supportsHyperlinks: SupportsHyperlinks;

export default supportsHyperlinks;
