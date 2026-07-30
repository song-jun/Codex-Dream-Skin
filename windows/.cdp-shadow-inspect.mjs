import fs from "node:fs";
import path from "node:path";

const statePath = path.join(process.env.LOCALAPPDATA, "CodexDreamSkin", "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const targets = await (await fetch(`http://127.0.0.1:${state.port}/json`)).json();
const target = targets.find((item) => item.type === "page" && item.url.startsWith("app://"));
if (!target) throw new Error("No Codex page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data.toString());
  const resolve = pending.get(message.id);
  if (resolve) { pending.delete(message.id); resolve(message); }
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
const evaluate = (expression) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (message) => message.error
    ? reject(new Error(JSON.stringify(message.error)))
    : resolve(message.result?.result?.value));
  socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, (message) => message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message));
  socket.send(JSON.stringify({ id, method, params }));
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (process.argv.includes("--trace-plugin-flash")) {
  const clickByText = (text) => evaluate(`(() => {
    const node = [...document.querySelectorAll("button")]
      .find((candidate) => String(candidate.textContent || "").trim() === ${JSON.stringify(text)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  const pageState = () => evaluate(`(() => ({
    mainText: String(document.querySelector("main")?.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 120),
    mainClasses: document.querySelector("main")?.className || "",
    current: [...document.querySelectorAll("button[aria-current=page]")].map((node) => String(node.textContent || "").trim()),
  }))()`);
  const homeClicked = await clickByText("新建任务");
  await sleep(800);
  console.log(JSON.stringify({ step: "new-task", clicked: homeClicked, state: await pageState() }));
  const pluginClicked = await clickByText("插件");
  console.log(JSON.stringify({ step: "plugin", clicked: pluginClicked, state: await pageState() }));
  await send("Page.enable");
  const captureDir = path.join(process.env.TEMP || ".", "codex-dream-plugin-flash");
  fs.mkdirSync(captureDir, { recursive: true });
  for (let sample = 0; sample < 24; sample += 1) {
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(captureDir, `frame-${String(sample).padStart(2, "0")}.png`), Buffer.from(screenshot.result.data, "base64"));
    const trace = await evaluate(`(() => {
      const describe = (node) => {
        const style = getComputedStyle(node);
        const before = getComputedStyle(node, "::before");
        const after = getComputedStyle(node, "::after");
        const rect = node.getBoundingClientRect();
        const effect = (candidate) => candidate.backgroundImage !== "none" || candidate.boxShadow !== "none" ||
          candidate.filter !== "none" || candidate.backdropFilter !== "none" || candidate.transform !== "none" ||
          candidate.animationName !== "none" || candidate.transitionProperty !== "all" && candidate.transitionDuration !== "0s";
        return {
          tag: node.tagName,
          classes: String(node.className).slice(0, 220),
          text: String(node.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 80),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) },
          position: style.position,
          zIndex: style.zIndex,
          background: style.background,
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
          filter: style.filter,
          backdropFilter: style.backdropFilter,
          transform: style.transform,
          animation: [style.animationName, style.animationDuration, style.animationTimingFunction].join(" "),
          transition: style.transition,
          before: { effect: effect(before), background: before.background, boxShadow: before.boxShadow, filter: before.filter, transform: before.transform, opacity: before.opacity },
          after: { effect: effect(after), background: after.background, boxShadow: after.boxShadow, filter: after.filter, transform: after.transform, opacity: after.opacity },
        };
      };
      const nodes = [...document.querySelectorAll("*")]
        .map((node) => ({ node, rect: node.getBoundingClientRect(), style: getComputedStyle(node) }))
        .filter(({ rect, style }) => rect.width >= 500 && rect.height > 0 && rect.y < 300 && rect.bottom > 140 &&
          (style.backgroundImage !== "none" || style.boxShadow !== "none" || style.filter !== "none" ||
            style.backdropFilter !== "none" || style.transform !== "none" || style.animationName !== "none"))
        .map(({ node }) => describe(node));
      return {
        now: Math.round(performance.now()),
        url: location.href,
        classes: String(document.documentElement.className),
        points: [160, 170, 180, 190, 220, 240, 260, 280].map((y) => ({ y, hits: document.elementsFromPoint(600, y).slice(0, 8).map(describe) })),
        nodes,
      };
    })()`);
    console.log(JSON.stringify({ sample, trace }));
    await sleep(16);
  }
  socket.close();
  process.exit(0);
}

if (process.argv.includes("--capture-plugin")) {
  await send("Page.enable");
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  const outputPath = path.join(process.env.TEMP || ".", "codex-dream-plugin-current.png");
  fs.writeFileSync(outputPath, Buffer.from(screenshot.result.data, "base64"));
  console.log(outputPath);
  socket.close();
  process.exit(0);
}

if (process.argv.includes("--click-plugin")) {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((node) => String(node.textContent || "").trim() === "插件");
    if (!button) return false;
    button.click();
    return true;
  })()`);
  console.log(JSON.stringify({ clicked }));
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

const result = await evaluate(`(() => {
  const main = document.querySelector("main.main-surface");
  const read = (node) => {
    if (!node) return null;
    const style = getComputedStyle(node);
    const before = getComputedStyle(node, "::before");
    const after = getComputedStyle(node, "::after");
    const rect = node.getBoundingClientRect();
    return {
      tag: node.tagName,
      id: node.id,
      classes: String(node.className).slice(0, 260),
      text: String(node.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 100),
      position: style.position,
      zIndex: style.zIndex,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) },
      background: style.background,
      backgroundImage: style.backgroundImage,
      border: style.border,
      boxShadow: style.boxShadow,
      filter: style.filter,
      backdropFilter: style.backdropFilter,
      opacity: style.opacity,
      transition: style.transition,
      before: { content: before.content, background: before.background, boxShadow: before.boxShadow, filter: before.filter, opacity: before.opacity },
      after: { content: after.content, background: after.background, boxShadow: after.boxShadow, filter: after.filter, opacity: after.opacity },
    };
  };
  const points = [
    [600, 65], [600, 75], [600, 82], [600, 88], [600, 95], [600, 105], [600, 115], [600, 125],
    [350, 88], [1000, 88],
  ];
  const pointHits = points.map(([x, y]) => ({
    point: { x, y },
    hits: document.elementsFromPoint(x, y).slice(0, 8).map(read),
  }));
  const visibleEffects = main ? [...main.querySelectorAll("*")]
    .map((node) => ({ node, rect: node.getBoundingClientRect(), style: getComputedStyle(node) }))
    .filter(({ rect, style }) => rect.width > 500 && rect.height > 0 && rect.y < 150 && rect.bottom > 55 &&
      (style.boxShadow !== "none" || style.filter !== "none" || style.backdropFilter !== "none" || style.backgroundImage !== "none" || style.opacity !== "1"))
    .map(({ node }) => read(node)) : [];
  const navigation = [...document.querySelectorAll("a, button, [role=link]")]
    .map((node) => ({ node, rect: node.getBoundingClientRect() }))
    .filter(({ node }) => String(node.textContent || "").trim() === "插件")
    .map(({ node }) => ({
      tag: node.tagName,
      href: node.getAttribute("href"),
      role: node.getAttribute("role"),
      aria: node.getAttribute("aria-label"),
      classes: String(node.className).slice(0, 220),
      rect: (() => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
      outer: node.outerHTML.slice(0, 1000),
    }));
  return {
    url: location.href,
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight },
    classes: String(document.documentElement.className),
    bodyText: String(document.body.innerText || "").slice(0, 300),
    main: main ? read(main) : null,
    navigation,
    pointHits,
    visibleEffects,
  };
})()`);
console.log(JSON.stringify({ port: state.port, result }, null, 2));
socket.close();
