// CAYO LUMEN — the entrypoint that hands the game in to make.fun.
//
// What this little program does, in order: it takes the game folder and the
// screenshots folder sitting beside this file, copies both into the output
// directory the grader provides (MAKEFUN_OUTPUT_DIR, or /output when the
// variable is absent), and then asks the vendored make.fun library to write
// dossier.json — the summary the judge reads — from whatever landed in the
// output directory. Node's standard library is all it needs; nothing here
// reaches the network, and nothing here is installed.
//
// Run it yourself exactly the way the grader will:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and then check the result with the kit's checker before entering.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in is the repository root: game/ and
// screenshots/ sit right beside it.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// The grader hands us a writable output directory through the environment;
// outside the grader, /output is the conventional default.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game itself: every static file under game/ — the page, its modules,
// the vendored three.js build, and nothing else.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

// The screenshots: up to four real renders of the game, the first by name
// being the cover. The folder may be absent in a bare checkout, so only copy
// it when it is actually there.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier: built from the copied files, with the scorer's own caps, so
// an entry this program produces is one the scorer will accept — at most
// 160 KiB of source text, at most four screenshots of 256 KiB each, at most
// 993 files and 48 MiB under game/, and no game path over 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// One line of confirmation for the person running it by hand; the grader
// ignores stdout, so this costs the entry nothing.
console.log(`Cayo Lumen: game, screenshots and dossier.json written to ${outputDir}`);
