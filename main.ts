// Token Launch Radar (token-radar-01) — the program, Node 22, standard library only.
//
// It reads the sealed DefiLlama snapshot at /input/snapshot.json (or --input <file|dir>),
// scores every pre-token protocol with the model in lib/model.ts, and writes the whole
// hand-in under /output: the ranked board (board.json), the dashboard's data (data.js),
// this repository's dashboard/ and screenshots/ copied verbatim, and the dossier
// (dossier.json) built by buildDossier from vendor/makefun-board.ts. The run is
// deterministic — the same snapshot in, the same bytes out, every time — and it refuses to
// hand in anything the gate would reject, rather than writing it and hoping.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataFileText, readSnapshot, scoreSnapshot, validateBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The gate's limits, as the kit states them. */
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const PAGE_LIMITS = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--name <value>` (or `--name=<value>`) out of the arguments, else the fallback. */
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

/** Fail with a message on stderr and this exit code. */
function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/** Copy a directory's regular files into `to`, skipping dotfiles; returns the names copied. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** Total size in bytes of the named files inside `dir`. */
function totalSize(dir: string, names: string[]): number {
  let sum = 0;
  for (const name of names) sum += statSync(join(dir, name)).size;
  return sum;
}

function run(): void {
  const inputArg = flag('input', '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    fail(
      `no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`,
      2,
    );
  }
  const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = readSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = scoreSnapshot(snapshot);
  const issue = validateBoard(board, snapshot);
  if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`, 1);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataFileText(radar));

  const pageFiles = copyDir(join(repoRoot, 'dashboard'), join(out, 'dashboard'));
  // The judge reads the dashboard's source through the dossier's text, which stops at the
  // cap: a page past it is judged on a cut source, so refuse to hand one in.
  const sourceBytes = totalSize(join(out, 'dashboard'), pageFiles);
  if (sourceBytes > DOSSIER_TEXT_CAP) {
    fail(`dashboard source is ${sourceBytes} bytes, past the ${DOSSIER_TEXT_CAP} the dossier shows whole`, 1);
  }

  const shots = copyDir(join(repoRoot, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) {
    fail(
      `screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a protocol detail view and a filtered view`,
      1,
    );
  }
  for (const name of shots) {
    if (!SHOT_NAME.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }

  // The dossier goes last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, { text_max_bytes: DOSSIER_TEXT_CAP, screenshots: SHOT_LIMITS, dashboard: PAGE_LIMITS }),
  );

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked, ${radar.live_size} live-token protocols set aside\n` +
      `token radar: wrote board.json, data.js, dashboard/ (${pageFiles.length} files), screenshots/ (${shots.length} images) and dossier.json under ${out}\n`,
  );
}

run();
