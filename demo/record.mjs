// Records the README demo: n8n running demo/workflow.json with the LatLng node.
//
//   npm run demo:record
//
// 1. Starts n8n (`n8n-node dev`) with a throwaway user folder (~/.n8n-latlng-demo).
// 2. Setup, not recorded: creates the owner account, logs in, and creates the
//    "LatLng account" credential through the REST API with LATLNG_API_KEY from .env.
//    The key is never typed into or shown by the UI.
// 3. Recording: pastes the workflow, runs it and opens each node's output.
// 4. Stops n8n and converts the video to docs/demo.mp4 (plus docs/demo-poster.png) with ffmpeg.
//
// Costs 3 LatLng API calls per run. Plain .mjs on purpose: the node lint rules
// (no process/console) apply to every .ts file in the repository.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, selectors } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'demo/output');
// Outside the repo: n8n-node links the project into the user folder, so a folder inside it loops.
const userFolder = join(homedir(), '.n8n-latlng-demo');
const videoDir = join(out, 'video');
const mp4 = join(root, 'docs/demo.mp4');
const poster = join(root, 'docs/demo-poster.png');
const BASE = 'http://localhost:5678';
const EMAIL = 'demo@example.com';
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

selectors.setTestIdAttribute('data-test-id');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readEnv() {
	const env = {};
	for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
		if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
	if (!env.LATLNG_API_KEY) throw new Error('LATLNG_API_KEY missing from .env');
	return env;
}

/** Owner password for the throwaway instance, kept in the gitignored output folder. */
function ownerPassword() {
	const file = join(out, 'owner.json');
	if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')).password;
	const password = `Demo-${randomBytes(8).toString('hex')}A1`;
	writeFileSync(file, JSON.stringify({ email: EMAIL, password }));
	return password;
}

async function waitForN8n(child) {
	for (let i = 0; i < 120; i++) {
		if (child.exitCode !== null) throw new Error('n8n exited early; see demo/output/n8n.log');
		try {
			// /healthz answers before the REST routes are registered.
			if ((await fetch(`${BASE}/rest/settings`)).ok) return;
		} catch {
			// not up yet
		}
		await sleep(3000);
	}
	throw new Error('n8n did not start within 6 minutes');
}

/** Visible cursor and caption overlay (headless video has no cursor). */
function overlay() {
	let caption;
	let cursor;
	// The app may re-render <body>, so the elements are (re)created on demand.
	const ensure = () => {
		if (!document.body) return false;
		if (!cursor?.isConnected) {
			cursor = document.createElement('div');
			Object.assign(cursor.style, {
				position: 'fixed',
				width: '18px',
				height: '18px',
				borderRadius: '50%',
				zIndex: 2147483647,
				background: 'rgba(225,29,72,.85)',
				border: '2px solid #fff',
				pointerEvents: 'none',
				boxShadow: '0 0 6px rgba(0,0,0,.4)',
				transform: 'translate(-50%,-50%)',
				left: '-40px',
				top: '-40px',
				transition: 'width .12s, height .12s',
			});
			document.body.append(cursor);
		}
		if (!caption?.isConnected) {
			caption = document.createElement('div');
			Object.assign(caption.style, {
				position: 'fixed',
				left: '50%',
				bottom: '64px',
				transform: 'translateX(-50%)',
				zIndex: 2147483646,
				background: 'rgba(15,23,42,.88)',
				color: '#fff',
				font: '600 20px/1.3 system-ui, sans-serif',
				padding: '10px 18px',
				borderRadius: '10px',
				pointerEvents: 'none',
				display: 'none',
				maxWidth: '90%',
			});
			document.body.append(caption);
		}
		return true;
	};
	document.addEventListener(
		'mousemove',
		(e) => {
			if (!ensure()) return;
			cursor.style.left = `${e.clientX}px`;
			cursor.style.top = `${e.clientY}px`;
		},
		true,
	);
	document.addEventListener(
		'mousedown',
		() => ensure() && (cursor.style.width = cursor.style.height = '26px'),
		true,
	);
	document.addEventListener(
		'mouseup',
		() => ensure() && (cursor.style.width = cursor.style.height = '18px'),
		true,
	);
	window.__caption = (text) => {
		if (!ensure()) return;
		caption.textContent = text;
		caption.style.display = text ? 'block' : 'none';
	};
}

async function caption(page, text) {
	await page.evaluate((t) => window.__caption?.(t), text);
}

/** Moves the visible cursor to an element, then clicks it. */
async function clickOn(page, locator, { dbl = false } = {}) {
	const box = await locator.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
	await sleep(250);
	if (dbl) await locator.dblclick();
	else await locator.click();
}

async function restFromPage(page, path, init = {}) {
	return page.evaluate(
		async ({ path, init }) => {
			const headers = {
				'browser-id': localStorage.getItem('n8n-browserId') ?? '',
				'content-type': 'application/json',
			};
			const res = await fetch(path, { ...init, headers });
			return { status: res.status, body: await res.json().catch(() => null) };
		},
		{ path, init },
	);
}

async function setup(browser, env) {
	const password = ownerPassword();
	const res = await fetch(`${BASE}/rest/owner/setup`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: EMAIL, firstName: 'Demo', lastName: 'User', password }),
	});
	if (!res.ok && res.status !== 400) throw new Error(`owner setup failed: ${res.status}`);

	const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/signin`);
	await page.fill('input[type=email]', EMAIL);
	await page.fill('input[type=password]', password);
	await page.keyboard.press('Enter');
	await page.waitForURL(/\/home\//, { timeout: 30000 });
	// Answer the first-login "Customize n8n" survey with nothing, so it never opens again.
	const settings = await restFromPage(page, '/rest/settings');
	const survey = await restFromPage(page, '/rest/me/survey', {
		method: 'POST',
		body: JSON.stringify({
			version: 'v4',
			personalization_survey_submitted_at: new Date().toISOString(),
			personalization_survey_n8n_version: String(settings.body?.data?.versionCli ?? 'unknown'),
		}),
	});
	if (survey.status >= 300) throw new Error(`survey dismiss failed: ${survey.status}`);
	await page.goto(`${BASE}/home/workflows`);
	await sleep(3000);
	if (
		await page
			.getByRole('button', { name: 'Get started' })
			.isVisible()
			.catch(() => false)
	) {
		throw new Error('the personalization survey is still shown');
	}

	const list = await restFromPage(page, '/rest/credentials');
	let credential = list.body?.data?.find((c) => c.name === 'LatLng account');
	if (!credential) {
		const created = await restFromPage(page, '/rest/credentials', {
			method: 'POST',
			body: JSON.stringify({
				name: 'LatLng account',
				type: 'latLngApi',
				data: { apiKey: env.LATLNG_API_KEY },
			}),
		});
		if (created.status >= 300) throw new Error(`credential create failed: ${created.status}`);
		credential = created.body.data;
	}
	// Pasting a workflow opens a one-time "Pasting this from an AI tool?" prompt: turn it off here,
	// outside the recording.
	await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
	await page.goto(`${BASE}/workflow/new`);
	await page.getByTestId('zoom-to-fit').waitFor({ timeout: 30000 });
	await sleep(1500);
	const trigger = {
		id: 't',
		name: 'Start',
		type: 'n8n-nodes-base.manualTrigger',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
	await page.evaluate(
		(t) => navigator.clipboard.writeText(t),
		JSON.stringify({ nodes: [trigger], connections: {} }),
	);
	await page.mouse.click(520, 560);
	await page.keyboard.press('Control+V');
	const prompt = page.getByRole('dialog').filter({ hasText: 'Pasting this from an AI tool?' });
	await sleep(2000);
	if (process.env.DEMO_DEBUG) {
		await page.screenshot({ path: join(out, 'debug-setup-paste.png') });
		console.log('setup prompt visible:', await prompt.isVisible());
	}
	if (await prompt.isVisible({ timeout: 5000 }).catch(() => false)) {
		await prompt.getByText("Don't show again").click();
		await prompt.getByRole('button', { name: 'Skip' }).click();
	}
	const state = join(out, 'state.json');
	await ctx.storageState({ path: state });
	await ctx.close();
	return { state, credentialId: credential.id };
}

function workflowForDev(credentialId) {
	const wf = JSON.parse(readFileSync(join(root, 'demo/workflow.json'), 'utf8'));
	for (const node of wf.nodes) {
		if (node.type === '@t0mer/n8n-nodes-latlng.latLng') {
			node.type = 'CUSTOM.latLng'; // community nodes load as CUSTOM.* in dev mode
			node.credentials.latLngApi.id = credentialId;
		}
	}
	return JSON.stringify({ nodes: wf.nodes, connections: wf.connections });
}

async function waitForExecution(page) {
	for (let i = 0; i < 60; i++) {
		const res = await restFromPage(page, '/rest/executions?limit=1');
		const last = res.body?.data?.results?.[0] ?? res.body?.data?.[0];
		if (last && ['success', 'error', 'crashed'].includes(last.status)) return last.status;
		await sleep(1000);
	}
	throw new Error('workflow execution did not finish');
}

async function showNode(page, name, text, extra, { table = true } = {}) {
	await caption(page, text);
	await clickOn(page, page.locator('[data-test-id="canvas-node"]', { hasText: name }).first(), {
		dbl: true,
	});
	await sleep(1200);
	// Table view for JSON output; binary output keeps its own tab.
	const tableMode = page.getByTestId('output-panel').getByTestId('radio-button-table');
	if (table && (await tableMode.isVisible().catch(() => false))) await clickOn(page, tableMode);
	if (extra) await extra();
	await sleep(3500);
	await page.keyboard.press('Escape');
	await sleep(700);
}

async function record(browser, state, credentialId) {
	const ctx = await browser.newContext({
		viewport: { width: 1280, height: 720 },
		storageState: state,
		recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
	});
	await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
	await ctx.addInitScript(overlay);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/workflow/new`);
	// The execute button only exists once there are nodes; the zoom controls exist on an empty canvas.
	await page.getByTestId('zoom-to-fit').waitFor({ timeout: 30000 });
	await sleep(1000);

	await caption(page, 'LatLng for n8n: geocode an address, find cafés nearby, draw a map');
	await page.evaluate((t) => navigator.clipboard.writeText(t), workflowForDev(credentialId));
	// Empty canvas, clear of the "Add first step" button in the middle.
	await page.mouse.move(520, 560, { steps: 20 });
	await page.mouse.click(520, 560);
	await page.keyboard.press('Control+V');
	await sleep(1500);
	if (process.env.DEMO_DEBUG) {
		await page.screenshot({ path: join(out, 'debug-after-paste.png') });
		const dialogs = await page.locator('[role=dialog]').allInnerTexts();
		console.log('dialogs:', JSON.stringify(dialogs).slice(0, 600));
	}
	await page.getByTestId('zoom-to-fit').click();
	await sleep(2000);

	await caption(page, 'Run the workflow');
	await clickOn(page, page.getByTestId('execute-workflow-button'));
	const status = await waitForExecution(page);
	if (status !== 'success') throw new Error(`demo workflow ended with ${status}`);
	await sleep(1500);

	await showNode(
		page,
		'Geocode Address',
		'Geocoding → Forward: "Dizengoff Square, Tel Aviv" → lat/lon',
	);
	await showNode(
		page,
		'Find Cafés Nearby',
		'Place → Nearby: cafés within 500 m, distance in meters',
	);
	await showNode(
		page,
		'Draw Map',
		'Static Map → Get Image: the square (red) and the cafés (blue)',
		async () => {
			const view = page.getByTestId('output-panel').getByRole('button', { name: 'View' });
			await view.waitFor({ timeout: 10000 });
			await clickOn(page, view);
			await sleep(2500);
		},
		{ table: false },
	);
	await caption(page, '');
	await sleep(800);
	const video = page.video();
	await ctx.close();
	return video.path();
}

function ffmpeg(args) {
	const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
}

/** H.264 MP4 that plays everywhere, plus a poster frame (the rendered map) for the README. */
function toMp4(webm) {
	ffmpeg([
		'-i',
		webm,
		'-c:v',
		'libx264',
		'-crf',
		'20',
		'-preset',
		'slow',
		'-pix_fmt',
		'yuv420p',
		'-movflags',
		'+faststart',
		'-an',
		mp4,
	]);
	ffmpeg(['-sseof', '-4', '-i', mp4, '-frames:v', '1', poster]);
	const size = statSync(mp4).size;
	console.log(`docs/demo.mp4: ${(size / 1048576).toFixed(2)} MB; poster: docs/demo-poster.png`);
	if (size > MAX_VIDEO_BYTES) throw new Error('docs/demo.mp4 is over 5 MB');
}

const env = readEnv();
mkdirSync(out, { recursive: true });
mkdirSync(join(root, 'docs'), { recursive: true });
rmSync(videoDir, { recursive: true, force: true });

const log = openSync(join(out, 'n8n.log'), 'w');
const n8n = spawn('npx', ['n8n-node', 'dev', '--custom-user-folder', userFolder], {
	cwd: root,
	detached: true,
	stdio: ['ignore', log, log],
});
const stop = () => {
	try {
		process.kill(-n8n.pid, 'SIGTERM');
	} catch {
		// already stopped
	}
};
process.on('exit', stop);

let browser;
try {
	console.log('Starting n8n…');
	await waitForN8n(n8n);
	browser = await chromium.launch();
	const { state, credentialId } = await setup(browser, env);
	console.log('Recording…');
	const webm = await record(browser, state, credentialId);
	const raw = join(out, 'demo.webm');
	renameSync(webm, raw);
	toMp4(raw);
	console.log(`Raw video: ${raw} (${readdirSync(out).length} files in demo/output)`);
} finally {
	await browser?.close();
	stop();
}
