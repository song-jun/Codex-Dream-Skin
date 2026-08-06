((cssText, artDataUrl, rawConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const ROOT_CLASSES = [
    "codex-dream-skin",
    "dream-theme-light",
    "dream-theme-dark",
    "dream-art-wide",
    "dream-art-standard",
    "dream-focus-left",
    "dream-focus-center",
    "dream-focus-right",
    "dream-safe-left",
    "dream-safe-center",
    "dream-safe-right",
    "dream-safe-none",
    "dream-task-ambient",
    "dream-task-banner",
    "dream-task-off",
  ];
  const ROOT_PROPERTIES = [
    "--dream-art",
    "--dream-art-position",
    "--dream-focus-x",
    "--dream-focus-y",
    "--dream-accent",
    "--dream-accent-ink",
    "--dream-image-luma",
    "--dream-mask-opacity",
    "--dream-mask-opacity-light",
    "--dream-mask-opacity-dark",
    "--dream-caret-color",
  ];
  const HOME_UTILITY_CLASS = "dream-home-utility";
  const TOP_FADE_CLASS = "app-shell-main-content-top-fade";
  const CARET_TARGETS = ".ProseMirror, [contenteditable=\"true\"], textarea, input";
  const installToken = {};
  let samplingNativeShell = false;
  let observer = null;
  let missingShellTimer = null;
  let shellWasObserved = false;
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
  const luminance = (red, green, blue) => {
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const defaultProfile = {
    appearance: "dark",
    accent: [108, 131, 142],
    focusX: .5,
    focusY: .5,
    aspect: 1.6,
    luma: .32,
    safeArea: "center",
  };

  const normalizeConfig = (value) => {
    const config = value && typeof value === "object" ? value : {};
    const art = config.art && typeof config.art === "object" ? config.art : {};
    const hasNumber = (candidate) =>
      (typeof candidate === "number" || (typeof candidate === "string" && candidate.trim() !== "")) &&
      Number.isFinite(Number(candidate));
    const requestedAccent = typeof art.accent === "string"
      ? art.accent.trim()
      : typeof config?.palette?.accent === "string"
        ? config.palette.accent.trim()
        : "";
    const safeAccent = /^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(requestedAccent)
      ? requestedAccent
      : null;
    const safeColor = (value) => typeof value === "string" && /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$/i.test(value.trim())
      ? value.trim()
      : null;
    const safeAccentInk = safeColor(art.accentInk);
    const imageLuma = art.imageLuma === null || art.imageLuma === undefined
      ? null
      : hasNumber(art.imageLuma) ? clamp(art.imageLuma) : null;
    const appearance = ["auto", "light", "dark"].includes(config.appearance)
      ? config.appearance
      : "auto";
    const safeArea = ["auto", "left", "right", "center", "none"].includes(art.safeArea)
      ? art.safeArea
      : "auto";
    const taskMode = ["auto", "ambient", "banner", "off"].includes(art.taskMode)
      ? art.taskMode
      : "auto";
    const legacyMaskOpacity = hasNumber(art.maskOpacity) ? clamp(art.maskOpacity) : null;
    const maskOpacityLight = hasNumber(art.maskOpacityLight) ? clamp(art.maskOpacityLight) : legacyMaskOpacity;
    const maskOpacityDark = hasNumber(art.maskOpacityDark) ? clamp(art.maskOpacityDark) : legacyMaskOpacity;
    const safeCaretColor = (value) => typeof value === "string" && /^(?:#[\da-f]{3,8}|(?:rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$/i.test(value.trim())
      ? value.trim()
      : null;
    const legacyCaretColor = safeCaretColor(art.caretColor);
    const caretColorLight = safeCaretColor(art.caretColorLight) ?? legacyCaretColor;
    const caretColorDark = safeCaretColor(art.caretColorDark) ?? legacyCaretColor;
    const metadataRatio = Number(config?.artMetadata?.ratio);
    return {
      appearance,
      safeArea,
      taskMode,
      maskOpacityLight,
      maskOpacityDark,
      caretColor: legacyCaretColor,
      caretColorLight,
      caretColorDark,
      focusX: hasNumber(art.focusX) ? clamp(art.focusX) : null,
      focusY: hasNumber(art.focusY) ? clamp(art.focusY) : null,
      accent: safeAccent,
      accentInk: safeAccentInk,
      imageLuma,
      initialAspect: Number.isFinite(metadataRatio) && metadataRatio > 0 ? metadataRatio : null,
    };
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  previous?.compatibilityCleanup?.();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.missingShellTimer) clearTimeout(previous.missingShellTimer);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();
  const config = normalizeConfig(rawConfig);
  let profile = {
    ...defaultProfile,
    aspect: config.initialAspect ?? defaultProfile.aspect,
  };
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = "13";
  }

  const analyzeArt = () => new Promise((resolve) => {
    if (typeof Image !== "function") {
      resolve(defaultProfile);
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const width = 48;
        const height = Math.max(12, Math.round(width * image.naturalHeight / image.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let count = 0;
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let totalBrightness = 0;
        const samples = [];
        const sampleMap = new Array(width * height);
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] < 96) continue;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const light = (.2126 * red + .7152 * green + .0722 * blue) / 255;
          const sample = { red, green, blue, light, index: offset / 4 };
          samples.push(sample);
          sampleMap[sample.index] = sample;
          totalRed += red;
          totalGreen += green;
          totalBlue += blue;
          totalBrightness += light;
          count += 1;
        }
        if (!count) throw new Error("Image contains no opaque pixels");
        const average = [totalRed / count, totalGreen / count, totalBlue / count];
        const averageBrightness = totalBrightness / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let sampleCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = sampleMap[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              sampleCount += 1;
              const previousSample = x > start ? sampleMap[y * width + x - 1] : null;
              const above = y > 0 ? sampleMap[(y - 1) * width + x] : null;
              if (previousSample) { edges += Math.abs(sample.light - previousSample.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = sampleCount ? total / sampleCount : 0;
          const variance = sampleCount ? Math.max(0, totalSquared / sampleCount - mean * mean) : 1;
          return Math.sqrt(variance) * .58 + (edgeCount ? edges / edgeCount : 1) * .42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * .38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * .86) safeArea = "left";
        else if (rightInformation < leftInformation * .86) safeArea = "right";
        let focusWeight = 0;
        let focusX = 0;
        let focusY = 0;
        let accentWeight = 0;
        let accent = [0, 0, 0];
        for (const sample of samples) {
          const x = sample.index % width;
          const y = Math.floor(sample.index / width);
          const difference = Math.sqrt(
            (sample.red - average[0]) ** 2 +
            (sample.green - average[1]) ** 2 +
            (sample.blue - average[2]) ** 2,
          ) / 441.7;
          const saliency = .03 + difference ** 1.35;
          focusX += (x / Math.max(1, width - 1)) * saliency;
          focusY += (y / Math.max(1, height - 1)) * saliency;
          focusWeight += saliency;
          const max = Math.max(sample.red, sample.green, sample.blue);
          const min = Math.min(sample.red, sample.green, sample.blue);
          const saturation = max ? (max - min) / max : 0;
          const usableLight = 1 - Math.min(1, Math.abs(sample.light - .46) / .54);
          const weight = saturation ** 2 * (.15 + usableLight);
          accent[0] += sample.red * weight;
          accent[1] += sample.green * weight;
          accent[2] += sample.blue * weight;
          accentWeight += weight;
        }
        const resolvedAccent = accentWeight > 1
          ? accent.map((channel) => Math.round(channel / accentWeight))
          : average.map((channel) => Math.round(channel));
        let resolvedFocusX = clamp(focusX / focusWeight);
        if (safeArea === "left") resolvedFocusX = Math.max(.64, resolvedFocusX);
        if (safeArea === "right") resolvedFocusX = Math.min(.36, resolvedFocusX);
        resolve({
          appearance: averageBrightness >= .58 ? "light" : "dark",
          accent: resolvedAccent,
          focusX: resolvedFocusX,
          focusY: clamp(focusY / focusWeight),
          aspect: image.naturalWidth / Math.max(1, image.naturalHeight),
          luma: clamp(averageBrightness),
          safeArea,
        });
      } catch {
        resolve(defaultProfile);
      }
    };
    image.onerror = () => resolve(defaultProfile);
    image.src = artUrl;
  });

  const detectShellAppearance = () => {
    const root = document.documentElement;
    const body = document.body;
    const classes = `${root?.className || ""} ${body?.className || ""}`
      .toLowerCase()
      .replace(/\bdream-theme-(?:dark|light)\b/g, "");
    if (/\b(dark|electron-dark|theme-dark|appearance-dark)\b/.test(classes)) return "dark";
    if (/\b(light|electron-light|theme-light|appearance-light)\b/.test(classes)) return "light";

    const dataTheme = (
      root?.getAttribute?.("data-theme") ||
      root?.getAttribute?.("data-appearance") ||
      root?.getAttribute?.("data-color-mode") ||
      body?.getAttribute?.("data-theme") ||
      body?.getAttribute?.("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    try {
      const hadSkin = root?.classList?.contains?.("codex-dream-skin");
      const savedSkinClasses = hadSkin
        ? ROOT_CLASSES.filter((className) => root.classList.contains(className))
        : [];
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove(...ROOT_CLASSES);
      try {
        const colorScheme = getComputedStyle(root).colorScheme || "";
        if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
        if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
      } finally {
        if (hadSkin) root.classList.add(...savedSkinClasses);
        observer?.takeRecords?.();
        samplingNativeShell = false;
      }
    } catch {
      samplingNativeShell = false;
    }
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}
    return "light";
  };

  const clearSkinDom = () => {
    const root = document.documentElement;
    root?.classList.remove(...ROOT_CLASSES);
    for (const property of ROOT_PROPERTIES) root?.style.removeProperty(property);
    document.querySelectorAll(CARET_TARGETS).forEach((node) => node.style.removeProperty("caret-color"));
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-task").forEach((node) => node.classList.remove("dream-task"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(`.${HOME_UTILITY_CLASS}`).forEach((node) => node.classList.remove(HOME_UTILITY_CLASS));
    compatibilityCleanup();
    if (missingShellTimer) {
      clearTimeout(missingShellTimer);
      missingShellTimer = null;
      syncMissingShellTimer();
    }
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
  };

  // 新版 Codex 的 class 会带构建 hash；临时补回稳定语义 class，复用既有皮肤规则。
  const compatibilityNodes = [];
  const addCompatibilityClass = (node, className) => {
    if (!node?.classList || node.classList.contains(className)) return;
    node.classList.add(className);
    compatibilityNodes.push([node, className]);
  };
  const compatibilityCleanup = () => {
    for (const [node, className] of compatibilityNodes.splice(0)) {
      try { node.classList.remove(className); } catch {}
    }
  };

  let compatibilityReport = {
    topFade: false,
    source: "not-checked",
  };

  const nodeClassName = (node) => {
    const value = node?.getAttribute?.("class") ?? node?.className;
    return typeof value === "string" ? value : "";
  };

  const hasTopFadeName = (node) => {
    const marker = [
      nodeClassName(node),
      node?.getAttribute?.("data-testid") ?? "",
      node?.getAttribute?.("data-name") ?? "",
      node?.getAttribute?.("aria-label") ?? "",
    ].join(" ");
    return /(?:main[-_ ]?content[-_ ]?)?top[-_ ]?fade/i.test(marker);
  };

  const looksLikeTopFade = (node) => {
    if (!node?.getBoundingClientRect) return false;
    try {
      const rect = node.getBoundingClientRect();
      if (rect.top > 8 || rect.height <= 0 || rect.height > 180) return false;
      const style = getComputedStyle(node);
      const positioned = /absolute|fixed|sticky/i.test(style.position || "");
      const nonInteractive = style.pointerEvents === "none";
      const gradient = /gradient|mask/i.test([
        style.backgroundImage,
        style.maskImage,
        style.webkitMaskImage,
      ].join(" "));
      return positioned && nonInteractive && gradient;
    } catch {
      return false;
    }
  };

  const findTopFade = (shellMain) => {
    const candidates = [
      ...document.querySelectorAll("[data-app-shell-main-content-top-fade]"),
      ...document.querySelectorAll('[class*="TopFade"], [class*="top-fade"]'),
    ].filter((node) => !shellMain?.contains || shellMain.contains(node));
    const named = candidates.find(hasTopFadeName);
    if (named) return { node: named, source: "semantic" };

    const descendants = shellMain?.querySelectorAll?.("*") ?? [];
    const visual = [...descendants].slice(0, 512).find(looksLikeTopFade);
    return visual ? { node: visual, source: "visual" } : null;
  };

  const updateCompatibilityReport = (topFade) => {
    compatibilityReport = {
      topFade: Boolean(topFade),
      source: topFade?.source ?? "not-found",
    };
    const state = window[STATE_KEY];
    if (state) state.compatibility = compatibilityReport;
  };

  const syncMissingShellTimer = () => {
    const state = window[STATE_KEY];
    if (state) state.missingShellTimer = missingShellTimer;
  };

  const applyProfile = (root) => {
    const focusX = config.focusX ?? profile.focusX;
    const focusY = config.focusY ?? profile.focusY;
    const appearance = config.appearance === "auto" ? detectShellAppearance() : config.appearance;
    const focus = focusX < .4 ? "left" : focusX > .6 ? "right" : "center";
    const safeArea = config.safeArea === "auto" ? (profile.safeArea ||
      (focus === "left" ? "right" : focus === "right" ? "left" : "center")) : config.safeArea;
    const taskMode = config.taskMode === "auto"
      ? profile.aspect >= 2.25 ? "banner" : "ambient"
      : config.taskMode;
    const accent = config.accent || `rgb(${profile.accent.join(" ")})`;
    const computedAccentInk = luminance(...profile.accent) > .42 ? "rgb(26 24 28)" : "rgb(250 248 251)";
    const accentInk = config.accentInk || computedAccentInk;
    const imageLuma = config.imageLuma ?? profile.luma;
    root.classList.toggle("dream-theme-light", appearance === "light");
    root.classList.toggle("dream-theme-dark", appearance === "dark");
    root.classList.toggle("dream-art-wide", profile.aspect >= 1.75);
    root.classList.toggle("dream-art-standard", profile.aspect < 1.75);
    for (const value of ["left", "center", "right"]) {
      root.classList.toggle(`dream-focus-${value}`, focus === value);
    }
    for (const value of ["left", "center", "right", "none"]) {
      root.classList.toggle(`dream-safe-${value}`, safeArea === value);
    }
    for (const value of ["ambient", "banner", "off"]) {
      root.classList.toggle(`dream-task-${value}`, taskMode === value);
    }
    root.style.setProperty("--dream-art", `url("${artUrl}")`);
    root.style.setProperty("--dream-art-position", `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`);
    root.style.setProperty("--dream-focus-x", String(focusX));
    root.style.setProperty("--dream-focus-y", String(focusY));
    root.style.setProperty("--dream-accent", accent);
    root.style.setProperty("--dream-accent-ink", accentInk);
    root.style.setProperty("--dream-image-luma", imageLuma.toFixed(3));
    root.style.removeProperty("--dream-mask-opacity");
    if (config.maskOpacityLight === null) root.style.removeProperty("--dream-mask-opacity-light");
    else root.style.setProperty("--dream-mask-opacity-light", String(config.maskOpacityLight));
    if (config.maskOpacityDark === null) root.style.removeProperty("--dream-mask-opacity-dark");
    else root.style.setProperty("--dream-mask-opacity-dark", String(config.maskOpacityDark));
    const caretColor = appearance === "light" ? config.caretColorLight : config.caretColorDark;
    if (caretColor === null) {
      root.style.removeProperty("--dream-caret-color");
      document.querySelectorAll(CARET_TARGETS).forEach((node) => node.style.removeProperty("caret-color"));
    } else {
      root.style.setProperty("--dream-caret-color", caretColor);
      document.querySelectorAll(CARET_TARGETS).forEach((node) => node.style.setProperty("caret-color", caretColor, "important"));
    }
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root || !document.body) return;

    // Main Codex shell is the content surface. The left rail is optional: Codex
    // removes or rebuilds aside.app-shell-left-panel while collapsing/expanding
    // it, and clearing the skin there flashes native colors over the active theme.
    // True auxiliary windows (pets, blank targets) still have no main surface, so
    // they continue to clear residual skin state.
    const shellMain = document.querySelector("main.main-surface") ||
      document.querySelector("main") ||
      document.querySelector('[role="main"]');
    if (!shellMain) {
      // 路由切换时 Codex 会短暂重建 main；延迟清理，避免顶栏和遮罩闪回原生样式。
      if (!shellWasObserved) {
        clearSkinDom();
        return;
      }
      if (!missingShellTimer) {
        missingShellTimer = setTimeout(() => {
          missingShellTimer = null;
          syncMissingShellTimer();
          const currentShellMain = document.querySelector("main.main-surface") ||
            document.querySelector("main") ||
            document.querySelector('[role="main"]');
          if (!currentShellMain) clearSkinDom();
        }, 320);
        syncMissingShellTimer();
      }
      return;
    }
    shellWasObserved = true;
    if (missingShellTimer) {
      clearTimeout(missingShellTimer);
      missingShellTimer = null;
      syncMissingShellTimer();
    }

    addCompatibilityClass(shellMain, "main-surface");
    const sidebar = document.querySelector("aside.app-shell-left-panel") || document.querySelector("aside");
    addCompatibilityClass(sidebar, "app-shell-left-panel");
    const header = document.querySelector("main.main-surface > header") ||
      document.querySelector("main > header[data-app-shell-application-menu-bar]");
    addCompatibilityClass(header, "app-header-tint");
    const applicationMenu = document.querySelector('[class*="_ApplicationMenuTopBar_"]');
    addCompatibilityClass(applicationMenu, "group/application-menu-top-bar");
    const topFade = findTopFade(shellMain);
    addCompatibilityClass(topFade?.node, TOP_FADE_CLASS);
    updateCompatibilityReport(topFade);

    root.classList.add("codex-dream-skin");
    applyProfile(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== "13") {
      style.textContent = cssText;
      style.dataset.dreamVersion = "13";
    }

    const homeMarker = document.querySelector('[data-testid="home-icon"]') ||
      document.querySelector('.group\\/home-suggestions') ||
      document.querySelector('[class*="home-suggestions"]');
    const home = homeMarker?.closest('[role="main"], main') ||
      document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    const mainCandidates = [...document.querySelectorAll('[role="main"]')];
    if (!mainCandidates.length) mainCandidates.push(shellMain);
    for (const candidate of mainCandidates) {
      candidate.classList.toggle("dream-home", candidate === home);
      candidate.classList.toggle("dream-task", candidate !== home);
    }
    const utilityBars = new Set(home
      ? home.querySelectorAll('[class*="_homeUtilityBar_"], [class*="_HomeUtilityBar_"]')
      : []);
    for (const candidate of document.querySelectorAll(`.${HOME_UTILITY_CLASS}`)) {
      if (!utilityBars.has(candidate)) candidate.classList.remove(HOME_UTILITY_CLASS);
    }
    for (const candidate of utilityBars) candidate.classList.add(HOME_UTILITY_CLASS);
    shellMain.classList.toggle("dream-home-shell", Boolean(home));

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      document.body.appendChild(chrome);
    }
    chrome.classList.toggle("dream-home-shell", Boolean(home));
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    clearSkinDom();
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  observer = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
  });

  // 首页聚焦输入框时，Codex 默认会 scrollIntoView 把 body 滚到最底，把标题推出可视区。
  // 这里在首页路由下拦截 focusin，保留焦点但把所有可能滚动的祖先节点重置到顶部。
  const resetHomeScroll = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const home = document.querySelector('main.dream-home, [role="main"].dream-home');
    if (!home) return;
    const reset = (node) => {
      if (!node) return;
      try {
        if (node.scrollTop !== 0) node.scrollTop = 0;
      } catch {}
    };
    reset(window);
    reset(document);
    reset(document.documentElement);
    reset(document.body);
    reset(home);
    for (let el = home.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1) reset(el);
    }
  };
  document.addEventListener("focusin", (event) => {
    const home = document.querySelector('main.dream-home, [role="main"].dream-home');
    if (!home) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!home.contains(target)) return;
    // 持续重置 1.2 秒，压制 Codex 多次 scrollIntoView 调用（rAF 经常抢不过）。
    let ticks = 0;
    const intervalId = setInterval(() => {
      resetHomeScroll();
      ticks += 1;
      if (ticks >= 24) clearInterval(intervalId);
    }, 50);
  }, true);
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure, cleanup, observer, timer, scheduler, artUrl, profile, config, installToken,
    compatibilityCleanup, missingShellTimer, compatibility: compatibilityReport, version: "1.2.0",
  };
  ensure();
  analyzeArt().then((result) => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken || window.__CODEX_DREAM_SKIN_DISABLED__) return;
    profile = result;
    state.profile = result;
    ensure();
  });
  return { installed: true, version: "1.2.0", adaptive: true };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_THEME_JSON__)
