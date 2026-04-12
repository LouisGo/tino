import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rawArgs = process.argv.slice(2);
const [command = "run", ...restArgs] = rawArgs;

const options = parseArgs(restArgs);
const profile = options.profile ?? "preview";
const settingsPath = options["knowledge-root"] ? null : resolveSettingsPath(profile);
const settings = settingsPath ? loadSettings(settingsPath, profile) : null;
const knowledgeRoot = options["knowledge-root"]
  ? expandHome(options["knowledge-root"])
  : expandHome(settings?.knowledgeRoot ?? fallbackKnowledgeRoot(profile));

switch (command) {
  case "inject":
    ensureKnowledgeRootLayout(knowledgeRoot);
    runInject({
      knowledgeRoot,
      count: Number(options.count ?? 20),
      scenario: options.scenario ?? "ai-review",
    });
    break;
  case "promote":
    ensureKnowledgeRootLayout(knowledgeRoot);
    runPromote({ knowledgeRoot });
    break;
  case "run":
    ensureKnowledgeRootLayout(knowledgeRoot);
    runInject({
      knowledgeRoot,
      count: Number(options.count ?? 20),
      scenario: options.scenario ?? "ai-review",
    });
    runPromote({ knowledgeRoot });
    break;
  case "status":
    printStatus({ knowledgeRoot, profile, settingsPath });
    break;
  default:
    console.error(
      [
        "Usage:",
        "  pnpm mock:ai-review inject [--profile preview] [--count 20]",
        "  pnpm mock:ai-review promote [--profile preview]",
        "  pnpm mock:ai-review run [--profile preview] [--count 20]",
        "  pnpm mock:ai-review status [--profile preview]",
      ].join("\n"),
    );
    process.exit(1);
}

function runInject({ knowledgeRoot, count, scenario }) {
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("count must be a positive number");
  }

  const queueState = loadQueueState(knowledgeRoot);
  const runtimeState = loadRuntimeState(knowledgeRoot);
  const captures = buildMockCaptures(count, scenario);
  const dailyFilesTouched = new Set();

  for (const capture of captures) {
    appendCaptureToDailyFile(knowledgeRoot, capture);
    queueState.pending.push(capture);
    dailyFilesTouched.add(dailyFilePathForCapture(knowledgeRoot, capture.capturedAt));
  }

  queueState.updatedAt = nowRfc3339();
  persistQueueState(knowledgeRoot, queueState);

  runtimeState.lastArchivePath =
    dailyFilesTouched.size > 0 ? [...dailyFilesTouched][dailyFilesTouched.size - 1] : null;
  runtimeState.queueDepth = queueState.pending.length;
  runtimeState.readyBatchCount = countReadyBatches(knowledgeRoot);
  runtimeState.updatedAt = nowRfc3339();
  persistRuntimeState(knowledgeRoot, runtimeState);

  console.log(`Injected ${captures.length} mock captures into ${knowledgeRoot}`);
  console.log(`Queue depth is now ${queueState.pending.length}`);
  for (const dailyPath of dailyFilesTouched) {
    console.log(`Updated daily archive: ${dailyPath}`);
  }
}

function runPromote({ knowledgeRoot }) {
  const queueState = loadQueueState(knowledgeRoot);
  const runtimeState = loadRuntimeState(knowledgeRoot);
  const promotedBatches = [];

  while (true) {
    const triggerReason = resolveBatchTrigger(queueState.pending);
    if (!triggerReason) {
      break;
    }

    const takeCount =
      triggerReason === "capture_count" ? Math.min(20, queueState.pending.length) : queueState.pending.length;
    const captures = queueState.pending.splice(0, takeCount);
    const batch = buildBatchFile(captures, triggerReason);
    const batchPath = path.join(knowledgeRoot, "_system", "batches", `${batch.id}.json`);
    writeJson(batchPath, batch);
    promotedBatches.push({ batch, batchPath });
  }

  queueState.updatedAt = nowRfc3339();
  persistQueueState(knowledgeRoot, queueState);

  runtimeState.queueDepth = queueState.pending.length;
  runtimeState.readyBatchCount = countReadyBatches(knowledgeRoot);
  runtimeState.updatedAt = nowRfc3339();

  if (promotedBatches.length) {
    const latest = promotedBatches[promotedBatches.length - 1];
    runtimeState.lastBatchPath = latest.batchPath;
    runtimeState.lastBatchReason = latest.batch.triggerReason;
  }

  persistRuntimeState(knowledgeRoot, runtimeState);

  if (!promotedBatches.length) {
    console.log("No pending captures met the batch promotion rule.");
    return;
  }

  for (const { batch, batchPath } of promotedBatches) {
    console.log(
      `Promoted ${batch.captureCount} captures into ${batch.id} via ${batch.triggerReason} -> ${batchPath}`,
    );
  }
  console.log(`Ready batch count is now ${runtimeState.readyBatchCount}`);
}

function printStatus({ knowledgeRoot, profile, settingsPath }) {
  const queueState = loadQueueState(knowledgeRoot);
  const runtimeState = loadRuntimeState(knowledgeRoot);
  const batchesDir = path.join(knowledgeRoot, "_system", "batches");
  const batchFiles = fs.existsSync(batchesDir)
    ? fs
        .readdirSync(batchesDir)
        .filter((fileName) => fileName.endsWith(".json"))
        .sort()
    : [];

  console.log(`Profile: ${profile}`);
  console.log(`Settings: ${settingsPath}`);
  console.log(`Knowledge root: ${knowledgeRoot}`);
  console.log(`Queue depth: ${queueState.pending.length}`);
  console.log(`Ready batch count: ${runtimeState.readyBatchCount}`);
  console.log(`Last batch path: ${runtimeState.lastBatchPath ?? "(none)"}`);
  console.log(`Batch files: ${batchFiles.length}`);
  for (const fileName of batchFiles.slice(-5)) {
    console.log(`- ${fileName}`);
  }
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const value = args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : "true";
    parsed[key] = value;
    if (value !== "true") {
      index += 1;
    }
  }

  return parsed;
}

function resolveSettingsPath(profile) {
  const appDataDir = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Tino",
    profile === "production" ? "production" : "shared",
  );

  return path.join(appDataDir, "settings.json");
}

function loadSettings(settingsPath, profile) {
  if (fs.existsSync(settingsPath)) {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  }

  return {
    knowledgeRoot: fallbackKnowledgeRoot(profile),
  };
}

function fallbackKnowledgeRoot(profile) {
  return profile === "production" ? "~/tino-inbox-production" : "~/tino-inbox-preview";
}

function expandHome(targetPath) {
  if (!targetPath.startsWith("~/")) {
    return targetPath;
  }

  return path.join(os.homedir(), targetPath.slice(2));
}

function ensureKnowledgeRootLayout(knowledgeRoot) {
  fs.mkdirSync(path.join(knowledgeRoot, "daily"), { recursive: true });
  fs.mkdirSync(path.join(knowledgeRoot, "_system", "batches"), { recursive: true });
  fs.mkdirSync(path.join(knowledgeRoot, "_system", "reviews"), { recursive: true });
}

function loadQueueState(knowledgeRoot) {
  const queuePath = path.join(knowledgeRoot, "_system", "queue.json");
  if (!fs.existsSync(queuePath)) {
    return {
      updatedAt: nowRfc3339(),
      pending: [],
    };
  }

  return JSON.parse(fs.readFileSync(queuePath, "utf8"));
}

function persistQueueState(knowledgeRoot, queueState) {
  const queuePath = path.join(knowledgeRoot, "_system", "queue.json");
  writeJson(queuePath, queueState);
}

function loadRuntimeState(knowledgeRoot) {
  const runtimePath = path.join(knowledgeRoot, "_system", "runtime.json");
  if (!fs.existsSync(runtimePath)) {
    return {
      watchStatus: "Rust clipboard poller active",
      lastError: null,
      lastArchivePath: null,
      lastFilterReason: null,
      lastBatchPath: null,
      lastBatchReason: null,
      queueDepth: 0,
      readyBatchCount: 0,
      updatedAt: nowRfc3339(),
      recentHashes: [],
      recentCaptures: [],
    };
  }

  return JSON.parse(fs.readFileSync(runtimePath, "utf8"));
}

function persistRuntimeState(knowledgeRoot, runtimeState) {
  const runtimePath = path.join(knowledgeRoot, "_system", "runtime.json");
  writeJson(runtimePath, runtimeState);
}

function buildMockCaptures(count, scenario) {
  const baseItems = buildScenarioItems(scenario);
  const captures = [];
  const now = new Date();

  for (let index = 0; index < count; index += 1) {
    const item = baseItems[index % baseItems.length];
    const capturedAt = new Date(now.getTime() - (count - index) * 60_000);
    const rawText =
      item.contentKind === "link"
        ? item.linkUrl
        : `${item.rawText}${index >= baseItems.length ? `\nFollow-up note ${index + 1}.` : ""}`;
    const id = `cap_mock_${Date.now()}_${String(index + 1).padStart(2, "0")}`;
    const rawRich =
      item.contentKind === "rich_text"
        ? `<p>${escapeHtml(rawText)}</p>`
        : item.rawRich ?? null;

    captures.push({
      id,
      source: "clipboard",
      sourceAppName: item.sourceAppName,
      sourceAppBundleId: item.sourceAppBundleId,
      sourceAppIconPath: null,
      capturedAt: toRfc3339Local(capturedAt),
      contentKind: item.contentKind,
      rawText,
      rawRich,
      rawRichFormat: rawRich ? "html" : null,
      linkUrl: item.contentKind === "link" ? item.linkUrl : null,
      assetPath: null,
      thumbnailPath: null,
      imageWidth: null,
      imageHeight: null,
      byteSize: null,
      hash: sha256(`${item.sourceAppName}|${rawText}|${index}`),
    });
  }

  return captures;
}

function buildScenarioItems(scenario) {
  if (scenario !== "ai-review") {
    throw new Error(`Unsupported scenario: ${scenario}`);
  }

  return [
    {
      sourceAppName: "Obsidian",
      sourceAppBundleId: "md.obsidian",
      contentKind: "plain_text",
      rawText: "[Mock Chain] Need a contract-first review path before topic persistence goes live.",
    },
    {
      sourceAppName: "VS Code",
      sourceAppBundleId: "com.microsoft.VSCode",
      contentKind: "plain_text",
      rawText: "[Mock Chain] Batch DTO should stay stable even while model access is still mocked.",
    },
    {
      sourceAppName: "Safari",
      sourceAppBundleId: "com.apple.Safari",
      contentKind: "link",
      linkUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data",
    },
    {
      sourceAppName: "Linear",
      sourceAppBundleId: "com.linear",
      contentKind: "plain_text",
      rawText: "[Mock Chain] Review page needs a clear trust signal when the result is only a trial sort.",
    },
    {
      sourceAppName: "Typora",
      sourceAppBundleId: "abnerworks.Typora",
      contentKind: "rich_text",
      rawText: "[Mock Chain] Rich text notes should still land in daily and carry enough context for later review.",
    },
    {
      sourceAppName: "Slack",
      sourceAppBundleId: "com.tinyspeck.slackmacgap",
      contentKind: "plain_text",
      rawText: "[Mock Chain] Inbox routing should stay visible to the user without exposing raw AI jargon.",
    },
    {
      sourceAppName: "Notes",
      sourceAppBundleId: "com.apple.Notes",
      contentKind: "plain_text",
      rawText: "[Mock Chain] Missing context and low confidence are product-facing review hints, not developer-only details.",
    },
    {
      sourceAppName: "Safari",
      sourceAppBundleId: "com.apple.Safari",
      contentKind: "link",
      linkUrl: "https://openai.com/docs/guides/text",
    },
  ];
}

function resolveBatchTrigger(pending) {
  if (pending.length >= 20) {
    return "capture_count";
  }

  if (!pending.length) {
    return null;
  }

  const oldestCapturedAt = Date.parse(pending[0].capturedAt);
  const tenMinutes = 10 * 60 * 1000;
  return Date.now() - oldestCapturedAt >= tenMinutes ? "max_wait" : null;
}

function buildBatchFile(captures, triggerReason) {
  const createdAt = nowRfc3339();

  return {
    id: `batch_${Date.now()}${crypto.randomBytes(4).toString("hex")}`,
    status: "pending_ai",
    createdAt,
    triggerReason,
    captureCount: captures.length,
    firstCapturedAt: captures[0].capturedAt,
    lastCapturedAt: captures[captures.length - 1].capturedAt,
    sourceIds: captures.map((capture) => capture.id),
    captures,
  };
}

function countReadyBatches(knowledgeRoot) {
  const batchesDir = path.join(knowledgeRoot, "_system", "batches");
  if (!fs.existsSync(batchesDir)) {
    return 0;
  }

  return fs
    .readdirSync(batchesDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => JSON.parse(fs.readFileSync(path.join(batchesDir, fileName), "utf8")))
    .filter((batch) => ["pending_ai", "ready"].includes(String(batch.status ?? "").trim())).length;
}

function dailyFilePathForCapture(knowledgeRoot, capturedAt) {
  const dateLabel = capturedAt.slice(0, 10);
  return path.join(knowledgeRoot, "daily", `${dateLabel}.md`);
}

function appendCaptureToDailyFile(knowledgeRoot, capture) {
  const dailyPath = dailyFilePathForCapture(knowledgeRoot, capture.capturedAt);
  let content = fs.existsSync(dailyPath)
    ? fs.readFileSync(dailyPath, "utf8")
    : `# Daily Capture Archive ${capture.capturedAt.slice(0, 10)}\n`;

  if (!content.endsWith("\n")) {
    content += "\n";
  }

  content += `\n${renderCaptureEntry(capture)}`;
  fs.writeFileSync(dailyPath, content, "utf8");
}

function renderCaptureEntry(capture) {
  let entry = "";
  entry += `## ${capture.capturedAt} \`${capture.id}\`\n`;
  entry += `- Source: ${capture.source}\n`;
  if (capture.sourceAppName) {
    entry += `- Source App: ${capture.sourceAppName}\n`;
  }
  if (capture.sourceAppBundleId) {
    entry += `- Source Bundle ID: ${capture.sourceAppBundleId}\n`;
  }
  entry += `- Kind: ${capture.contentKind}\n`;
  entry += `- Hash: ${capture.hash}\n\n`;

  if (capture.linkUrl) {
    entry += `- URL: ${capture.linkUrl}\n\n`;
  }

  entry += "### Readable Text\n";
  entry += renderCodeBlock("text", capture.rawText);

  if (capture.rawRich && capture.rawRichFormat) {
    entry += "\n### Raw Rich Representation\n";
    entry += renderCodeBlock(capture.rawRichFormat, capture.rawRich);
  }

  return entry;
}

function renderCodeBlock(language, content) {
  return `\`\`\`${language}\n${content.trimEnd()}\n\`\`\`\n`;
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function nowRfc3339() {
  return toRfc3339Local(new Date());
}

function toRfc3339Local(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffsetMinutes / 60));
  const offsetRemainderMinutes = pad(absOffsetMinutes % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}:${offsetRemainderMinutes}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
