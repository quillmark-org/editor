#!/usr/bin/env node
/**
 * Builds @airmark/quiver into the static runtime artifact consumed by the dev
 * server and production build.
 *
 * Output: static/quills/{Quiver.json, manifest.<hash>.json, *.zip, store/}
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Quiver } from '@quillmark/quiver/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '..', 'static', 'quills');

await fs.promises.rm(OUTPUT_DIR, { recursive: true, force: true });
await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
await Quiver.buildPackage('@airmark/quiver', OUTPUT_DIR);

const quiver = await Quiver.fromPackage('@airmark/quiver');
const names = quiver.quillNames();
console.log(`packaged ${names.length} quill(s) into static/quills/`);
