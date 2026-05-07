import { Quillmark } from '@quillmark/wasm';
import { QuillRegistry } from '@quillmark/registry';
import { FileSystemSource } from '@quillmark/registry/node';

async function test() {
	console.log('Initializing WASM...');
	const wasmModule = await import('@quillmark/wasm');
	if (wasmModule.init) wasmModule.init();

	const engine = new wasmModule.Quillmark();

	console.log('Initializing Registry...');
	const source = new FileSystemSource('./tonguetoquill-collection/quills');
	const registry = new QuillRegistry({ source, engine });
	const manifest = await source.getManifest();

	// Resolve/register quills through registry to mirror runtime behavior.
	for (const q of manifest.quills) {
		if (q.name === 'usaf_memo') {
			console.log(`Loading bundle for ${q.name}@${q.version}...`);
			await registry.resolve(`${q.name}@${q.version}`);
			console.log(`Registered ${q.name}@${q.version}`);
		}
	}

	console.log('Registered quills in engine:', engine.listQuills());

	console.log('\n==== TEST 1: Render 0.1.0 ====');
	const md1 = `---\nQUILL: usaf_memo@0.1.0\n---\nHello this is body 1.`;
	const parsed1 = Quillmark.parseMarkdown(md1);
	const res1 = engine.render(parsed1, {});
	const svg1 = new TextDecoder().decode(new Uint8Array(res1.artifacts[0].bytes));
	console.log('Length of SVG 1:', svg1.length);
	console.log("Contains 'hiiiii test test'? :", svg1.includes('hiiiii test test'));

	console.log('\n==== TEST 2: Render 0.2.0 (same body) ====');
	const md2 = `---\nQUILL: usaf_memo@0.2.0\n---\nHello this is body 1.`;
	const parsed2 = Quillmark.parseMarkdown(md2);
	// Add cache buster
	parsed2.fields = { ...parsed2.fields, __quill_version_cache_buster: 'usaf_memo@0.2.0' };

	const res2 = engine.render(parsed2, {});
	const svg2 = new TextDecoder().decode(new Uint8Array(res2.artifacts[0].bytes));
	console.log('Length of SVG 2:', svg2.length);
	console.log("Contains 'hiiiii test test'? :", svg2.includes('hiiiii test test'));

	console.log('\n==== TEST 3: Render 0.2.0 (different body) ====');
	const md3 = `---\nQUILL: usaf_memo@0.2.0\n---\nHello this is body 2.`;
	const parsed3 = Quillmark.parseMarkdown(md3);
	parsed3.fields = { ...parsed3.fields, __quill_version_cache_buster: 'usaf_memo@0.2.0' };

	const res3 = engine.render(parsed3, {});
	const svg3 = new TextDecoder().decode(new Uint8Array(res3.artifacts[0].bytes));
	console.log('Length of SVG 3:', svg3.length);
	console.log("Contains 'hiiiii test test'? :", svg3.includes('hiiiii test test'));

	console.log('\n==== TEST 4: Render 0.2.0 using options.quill_name (same body) ====');
	const res4 = engine.render(parsed2, { quill_name: 'usaf_memo@0.2.0' });
	const svg4 = new TextDecoder().decode(new Uint8Array(res4.artifacts[0].bytes));
	console.log('Length of SVG 4:', svg4.length);
	console.log("Contains 'hiiiii test test'? :", svg4.includes('hiiiii test test'));
}

test().catch(console.error);
