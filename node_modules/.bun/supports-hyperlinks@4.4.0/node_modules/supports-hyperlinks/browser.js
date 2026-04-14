export function createSupportsHyperlinks() {
	return false;
}

const supportsHyperlinks = {
	stdout: createSupportsHyperlinks(),
	stderr: createSupportsHyperlinks(),
};

export default supportsHyperlinks;
