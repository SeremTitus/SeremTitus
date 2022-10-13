import { existsSync } from "node:fs";
import { mkdir, writeFile, stat, unlink, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer, { type Browser, type LaunchOptions, type Page } from "puppeteer";

const require = createRequire(import.meta.url);

// ── Paths ─────────────────────────────────────────────────
const screenshotsDir = path.resolve("assets/screenshots");

// ── Products Data ─────────────────────────────────────────
type Product = {
  name: string;
  href: string;
  logo: string;
  description: string;
  status: string;
  statusColor: string;
};

const products: Product[] = [
  {
    name: "Console Testers",
    href: "https://consoletesters.com",
    logo: "assets/logos/consoletesters.svg",
    description: "A platform built to support PlayStore developers.",
    status: "Live",
    statusColor: "brightgreen",
  },
  {
    name: "Ruzta",
    href: "https://ruzta.seremtitus.co.ke",
    logo: "assets/logos/ruzta.svg",
    description: "A domain-specific language built to supercharge game development in Godot Engine.",
    status: "v1.0.0Beta",
    statusColor: "yellow",
  },
  {
    name: "Splinter FTP Client",
    href: "https://splinter.seremtitus.co.ke",
    logo: "assets/logos/splinter.svg",
    description: "A CLI tool for quick, repetitive uploads and downloads to/from your server, using FTP.",
    status: "v2.0.2",
    statusColor: "brightgreen",
  },
  {
    name: "Kraft",
    href: "https://kraft.seremtitus.co.ke",
    logo: "assets/logos/kraft.svg",
    description: "A portable domain-specific language to write readable node graphs eg Blender Node System.",
    status: "Design phase",
    statusColor: "lightgrey",
  },
  {
    name: "seremtitus.co.ke",
    href: "https://seremtitus.co.ke",
    logo: "assets/logos/seremtitus.svg",
    description: "My own Personal/Freelance website.",
    status: "live",
    statusColor: "brightgreen"
  },
];

// ── Puppeteer Config ──────────────────────────────────────
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const NAVIGATION_TIMEOUT_MS = 60_000;
const NETWORK_IDLE_TIMEOUT_MS = 15_000;
const RENDER_SETTLE_MS = 1_500;
const MIN_SIZE_KB = 10;

const browserArgs = [
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  "--disable-component-extensions-with-background-pages",
  "--disable-crash-reporter",
  "--disable-default-apps",
  "--disable-dev-shm-usage",
  "--disable-extensions",
  "--disable-features=Translate,BackForwardCache,MediaRouter,AcceptCHFrame,AutoExpandDetailsElement",
  "--disable-hang-monitor",
  "--disable-ipc-flooding-protection",
  "--disable-popup-blocking",
  "--disable-renderer-backgrounding",
  "--disable-sync",
  "--force-device-scale-factor=1",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-default-browser-check",
  "--no-first-run",
  "--no-sandbox",
  "--password-store=basic",
  "--use-mock-keykey",
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function findLocalBrowserExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate));
}

async function installPuppeteerBrowser() {
  const packageJsonPath = require.resolve("puppeteer/package.json");
  const { bin } = require(packageJsonPath) as { bin: string };
  const cliPath = path.resolve(path.dirname(packageJsonPath), bin);
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  console.log("  installing chrome-headless-shell for Puppeteer ...");
  await execFileAsync(process.execPath, [cliPath, "browsers", "install", "chrome-headless-shell"], {
    maxBuffer: 1024 * 1024 * 10,
    timeout: 300_000,
  });
}

async function launchBrowser() {
  const localBrowserExecutable = findLocalBrowserExecutable();
  const launchOptions: LaunchOptions = localBrowserExecutable
    ? {
        executablePath: localBrowserExecutable,
        headless: true,
        dumpio: false,
        args: browserArgs,
      }
    : {
        headless: "shell",
        dumpio: false,
        args: browserArgs,
      };

  try {
    return await puppeteer.launch(launchOptions);
  } catch (error) {
    if (!errorMessage(error).includes("Could not find chrome-headless-shell")) {
      throw error;
    }
    await installPuppeteerBrowser();
    return puppeteer.launch(launchOptions);
  }
}

async function waitForPageReady(page: Page) {
  await page.waitForNetworkIdle({
    idleTime: 1_000,
    timeout: NETWORK_IDLE_TIMEOUT_MS,
  }).catch(() => undefined);

  await page.waitForFunction(() => document.readyState === "complete", {
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(
      Array.from(document.images, (image) => {
        if (image.complete) return undefined;
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }),
    );
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });

  await delay(RENDER_SETTLE_MS);
}

async function captureScreenshot(slug: string, url: string) {
  const dest = path.join(screenshotsDir, `${slug}.png`);
  const tempDest = `${dest}.tmp.png`;
  let browser: Browser | null = null;

  console.log(`  fetching ${slug} ...`);
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      deviceScaleFactor: 1,
    });
    await page.goto(url, {
      waitUntil: "load",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await waitForPageReady(page);
    await page.screenshot({
      path: tempDest,
      fullPage: false,
    });
    await page.close();
  } catch (error) {
    console.error(`  [error]  ${slug}: ${errorMessage(error)}`);
    await unlink(tempDest).catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    return null;
  }

  if (browser) await browser.close();

  if (!existsSync(tempDest)) {
    console.error(`  [error]  ${slug}: screenshot was not created`);
    return null;
  }

  const { size } = await stat(tempDest);
  const sizeKB = size / 1024;

  if (sizeKB < MIN_SIZE_KB) {
    console.warn(`  [warn]  ${slug}: screenshot too small (${sizeKB.toFixed(1)} KB) - likely a challenge page.`);
    await unlink(tempDest).catch(() => undefined);
    return null;
  }

  await unlink(dest).catch(() => undefined);
  await rename(tempDest, dest);
  console.log(`  [saved]  ${slug}.png (${sizeKB.toFixed(1)} KB)`);
  return dest;
}

// ── README Generation ─────────────────────────────────────

function generateProductSection(screenshotPaths: Map<string, string | null>) {
  let section = "";

  for (const product of products) {
    const screenshotPath = screenshotPaths.get(product.href);
    const screenshotFile = screenshotPath ? path.basename(screenshotPath) : null;

    section += `<table style="border:none;border-collapse:collapse"><tr><td style="border:none;padding-right:10px"><a href="${product.href}" target="_blank"><img src="${product.logo}" alt="${product.name} Logo" width="50"></a></td><td style="border:none"><h1><a href="${product.href}" target="_blank">${product.name}</a></h1></td></tr></table>\n\n`;
    section += `${product.description}\n\n`;

    if (screenshotFile) {
      section += `<a href="${product.href}" target="_blank"><img src="assets/screenshots/${screenshotFile}" alt="${product.name} Screenshot" width="100%"></a>\n\n`;
    }

    section += `[![Status](https://img.shields.io/badge/Status-${encodeURIComponent(product.status)}-${product.statusColor})](${product.href})\n\n`;
    section += `---\n\n`;
  }

  return section;
}

function generateReadme(productSection: string): string {
  const socials = [
    { name: "LinkedIn", href: "https://linkedin.com/in/SeremTitus", file: "linkedin.svg" },
    { name: "Medium", href: "https://medium.com/@seremtitus", file: "medium.svg" },
    { name: "YouTube", href: "https://youtube.com/@serem_titus", file: "youtube.svg" },
    { name: "TikTok", href: "https://www.tiktok.com/@seremtitus", file: "tiktok.svg" },
    { name: "X", href: "https://x.com/SeremTitus_SE", file: "x.svg" },
    { name: "Instagram", href: "https://instagram.com/serem_titus_se", file: "instagram.svg" },
    // { name: "WhatsApp", href: "https://wa.me/XXXXXXXXXXX", file: "whatsapp.svg" },
  ];

  const socialBadges = socials.map((s) => `    <a href="${s.href}" target="_blank" style="margin: 0 8px"><img alt="${s.name}" src="assets/socials/${s.file}" height="28"></a>`).join("\n");

  return `<h1 align="center">Hi there 👋, I am Serem Titus</h1>
<h2 align="center">
  <a href="https://SeremTitus.co.ke" target="_blank" style="text-decoration:none; color:inherit;">
    SeremTitus.co.ke
  </a>
</h2>

<p align="center">
${socialBadges}
</p>

---

${productSection}`;
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const skipScreenshots = process.argv.includes("--skip");

  console.log("=== Updating GitHub Profile README ===\n");

  if (!existsSync(screenshotsDir)) {
    await mkdir(screenshotsDir, { recursive: true });
  }

  const screenshotPaths = new Map<string, string | null>();

  if (skipScreenshots) {
    console.log("Skipping screenshot fetch (--skip flag)\n");
    for (const product of products) {
      const slug = new URL(product.href).hostname.replace(/\./g, "-");
      const screenshotPath = path.join(screenshotsDir, `${slug}.png`);
      screenshotPaths.set(product.href, existsSync(screenshotPath) ? screenshotPath : null);
    }
  } else {
    console.log("Fetching screenshots...\n");
    for (const product of products) {
      const slug = new URL(product.href).hostname.replace(/\./g, "-");
      const screenshotPath = await captureScreenshot(slug, product.href);
      screenshotPaths.set(product.href, screenshotPath);
    }
  }
  console.log("");

  console.log("Generating README...");
  const productSection = generateProductSection(screenshotPaths);
  const readme = generateReadme(productSection);

  const readmePath = path.resolve("README.md");
  await writeFile(readmePath, readme, "utf-8");
  console.log("README.md updated successfully!\n");

  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
