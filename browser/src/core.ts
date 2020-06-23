export default async function() {
	const pwnd = await import('pwnd-core');
	return pwnd.default();
}
