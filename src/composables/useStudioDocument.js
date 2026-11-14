import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { parseBlocks, blocksToPreviewText } from "./useContentParser.js";
import { useCustomFonts } from "./useCustomFonts.js";
import { createMeasuredPaginationSession } from "./useMeasuredPagination.js";
import { DEFAULT_THEME, THEME_LIST, getThemeByName } from "../config/themes.js";
import { i18n } from "../i18n/index.js";

function t(key, params) {
  return i18n.global.t(key, params);
}

export const defaultMarkdown = `# 图文坊 · 上手指南

> 一段文案进，一套能直接发的竖版图文出。

## 这是什么
图文坊是一个本地运行的图文排版工具。你把写好的文案粘进左边的编辑器，右边立刻出现排好版的竖版卡片，一键导出成 1080×1440 的 PNG，直接发抖音和小红书。不需要登录，不需要联网，不需要会员，文案也不会传到任何服务器——所有排版、分页、导出都在你这台电脑上完成。它支持 Markdown 写法，但你不必会 Markdown，纯文字粘进来也能用，加两个井号就能起一个小标题。

## 三步出图
第一步，把文案粘进左边的编辑器，或者打开一个已有的 .md 文件。第二步，在右侧「发布设置」里选尺寸，抖音图文用 1080×1920，小红书用 1080×1440，两个都是一键切换，内容不用重排。第三步，点导出按钮，选一个文件夹，PNG 就出来了。如果你不确定该用哪套主题，先用默认的苹果备忘录：米色纸面配衬线标题，在手机上最耐看，也最不容易出错。主题随时可以换，换完预览立刻跟着变。

## 一页写多少字
这是最影响成品观感的一个数字。实测下来，在 1080×1440 的画幅里，单页正文容量的上限在 220 到 230 字之间。写成 250 字会被拆成两页，同一个小标题跨页，翻起来很碎；只写 155 字则只能填满六成，下半屏一片空白，看着像没做完。215 到 220 字是刚好填到七八成的位置。分页是按小标题切的，所以每个二级标题下面写够这个字数，一页一个观点，读的人最舒服。

## 尺寸与主题怎么选
抖音图文用 9:16，也就是 1080×1920；小红书用 3:4，1080×1440；公众号配图和朋友圈用方形 1:1。主题内置十六套，适合干货长文的是苹果备忘录、复古报刊、墨色简报、瑞士网格这四套，字重和行距都为阅读调过；带强渐变和高对比装饰的那几套更适合做活动海报，配长段文字会显得吵。换主题只改外观，不动内容和分页，可以一个个试过来。

## 导出前看四件事
第一，四个角落有没有多余的小字。页眉、页码、日期、落款这四个位置默认是关闭的，需要签名再自己打开。第二，正文有没有填到页面的七成以上，如果只到一半，回上一段把字数补够。第三，有没有一句话被拆到两页上，尤其是标题的最后一个字单独掉到下一页，那种最扎眼。第四，大标题有没有从词中间断开，中文按字符宽度断行，所以标题控制在十二个字以内最安全。

*把这份指南删掉，换成你自己的文案，就可以开始出图了。*
`;

const defaultMarkdownEnglish = `# 图文坊 WappKit · Quick Start

> Paste your copy, get a card deck you can post.

## What it is
图文坊 (TuwenFang) is an offline layout tool for vertical social cards. You paste your copy into the editor on the left, and paginated cards appear on the right, ready to export as 1080x1440 PNGs for Douyin or Xiaohongshu. No sign-up, no cloud, no membership, and nothing is uploaded — pagination, layout and export all run on your own machine. Markdown is supported but not required: plain text works, and two hash marks start a new section.

## Three steps to export
First, paste your copy into the editor or open an existing .md file. Second, pick a size in the publish panel: 1080x1920 for Douyin, 1080x1440 for Xiaohongshu. Third, hit export, choose a folder, and the PNGs are written. If you are not sure which theme to use, start with Apple Notes, the default: warm paper with serif headings reads best on a phone and is the hardest to get wrong. Themes can be switched at any time without retyping anything.

## How much text per page
This is the number that decides how the deck looks. On a 1080x1440 canvas, a single page holds roughly 220 to 230 characters of body text. At 250 the section spills onto a second page and one heading spans two cards; at 155 the page only fills sixty percent and the lower half sits empty. Aim for 215 to 220 characters per section. Pages break on headings, so fill each section to that length and keep one idea per card.

## Before you export
Check four things. First, no stray small text in the corners — header, page number, date and footer are all off by default. Second, body text reaches at least seventy percent of the page height. Third, no sentence is split across two cards. Fourth, the cover title is not broken mid-word, which is why twelve characters or fewer is the safe limit.

*Delete this guide, paste your own copy, and start exporting.*
`;

const pageImageClasses = [
  "hero-mountain",
  "hero-books",
  "hero-bedroom",
  "hero-run",
  "hero-journal",
  "hero-sunset",
];

const platforms = [
  { name: "小红书", size: "1080 x 1440", width: 1080, height: 1440, ratio: "3:4", color: "#ff2442", description: "小红书图文笔记，最佳 3:4 比例" },
  { name: "抖音", size: "1080 x 1920", width: 1080, height: 1920, ratio: "9:16", color: "#111827", description: "抖音全屏图文 / 挂卡短视频，9:16 比例" },
  { name: "微博", size: "1080 x 1260", width: 1080, height: 1260, ratio: "6:7", color: "#ff8a00", description: "微博九宫格配图与图文长卡片" },
  { name: "通用方形", size: "1080 x 1080", width: 1080, height: 1080, ratio: "1:1", color: "#6366f1", description: "通用社交媒体 1:1 正方形配图" },
  { name: "自定义尺寸", size: "自定义", width: 1200, height: 1600, ratio: "自定义", color: "#8b5cf6", custom: true, description: "自定义卡片宽度、高度与画幅比例" },
];
const imageCache = new Map();
const SETTINGS_KEY = "markcard_studio_settings_v1";
const EXPORT_FORMATS = ["PNG", "JPG", "PDF", "长图(PNG)"];
const PAGINATION_MODES = ["h2", "h3", "delimiter", "length", "smart"];
const BACKGROUND_TYPES = ["solid", "gradient", "pattern", "image", "wallpaper"];
const MIN_CUSTOM_ASPECT_RATIO = 0.4;
const MAX_CUSTOM_ASPECT_RATIO = 2.5;

export function useStudioDocument() {
  const initialMarkdown = i18n.global.locale.value === "zh-CN" ? defaultMarkdown : defaultMarkdownEnglish;
  const markdownSource = ref(initialMarkdown);
  const sourcePath = ref("");
  const savedContent = ref(initialMarkdown);
  const pages = ref([createFallbackPage()]);
  const activePageIndex = ref(0);
  const isLoadingDocument = ref(false);
  const isExporting = ref(false);
  const exportMessage = ref("");
  // WappKit: 页眉/页码/日期/落款四处默认全部关闭，不替用户署名
  const showTopLeft = ref(false);
  const showTopRight = ref(false);
  const showBottomLeft = ref(false);
  const showBottomRight = ref(false);
  const showPageNumber = showTopRight; // Alias for backwards compatibility
  const selectedTheme = ref(DEFAULT_THEME.name);
  const selectedPlatformName = ref("小红书");
  const selectedFormat = ref("PNG");
  const scale = ref(2);
  const transparentBackground = ref(false);
  // WappKit: 默认背景改纯色暖阳底色，去掉原青绿→紫渐变的促销感
  const solidBackground = ref(true);
  const backgroundColor = ref("#fff7e9");
  const backgroundType = ref("solid"); // "solid" | "gradient" | "pattern" | "image"
  const backgroundValue = ref("#fff7e9");
  const exportPath = ref("");
  const zoom = ref(74);
  const activeTab = ref("平台");
  const customWidth = ref(1200);
  const customHeight = ref(1600);
  const selectedFontId = ref("theme-default");
  const customFontFamily = ref("");
  const customFontEmbedCss = ref("");
  const customFontFingerprint = ref("theme-default");
  const {
    customFonts,
    isLoadingCustomFonts,
    customFontError,
    isCustomFontRuntimeAvailable,
    refreshCustomFonts,
    importCustomFont: importManagedCustomFont,
    ensureCustomFontLoaded,
    deleteCustomFont: deleteManagedCustomFont,
  } = useCustomFonts();

  const globalMeta = ref({
    kicker: "@图文坊",
    date: "",
    quote: t("runtime.defaultQuote"),
  });
  const customPageMetas = ref({});

  function setBackgroundType(type) {
    backgroundType.value = type;
  }

  function setBackgroundValue(val) {
    backgroundValue.value = val;
    if (backgroundType.value === "solid" && val.startsWith("#")) {
      backgroundColor.value = val;
    }
  }

  function applyLoadedCustomFont(loaded) {
    customFontFamily.value = loaded?.family || "";
    customFontEmbedCss.value = loaded?.embedCss || "";
    customFontFingerprint.value = loaded?.fingerprint || "theme-default";
  }

  async function selectCustomFont(fontId) {
    const nextFontId = typeof fontId === "string" ? fontId : "theme-default";
    if (nextFontId === "theme-default") {
      applyLoadedCustomFont(null);
      selectedFontId.value = "theme-default";
      return;
    }

    isLoadingCustomFonts.value = true;
    try {
      const loaded = await ensureCustomFontLoaded(nextFontId);
      if (!loaded) return;
      applyLoadedCustomFont(loaded);
      selectedFontId.value = nextFontId;
      customFontError.value = "";
    } catch (error) {
      customFontError.value = error?.message || String(error);
    } finally {
      isLoadingCustomFonts.value = false;
    }
  }

  async function importCustomFont() {
    try {
      const font = await importManagedCustomFont();
      if (font) await selectCustomFont(font.id);
    } catch {
      // The font manager exposes the native error to the settings panel.
    }
  }

  async function deleteCustomFont(fontId) {
    if (!fontId || fontId === "theme-default") return;
    try {
      await deleteManagedCustomFont(fontId);
      if (selectedFontId.value === fontId) {
        applyLoadedCustomFont(null);
        selectedFontId.value = "theme-default";
      }
    } catch {
      // The font manager exposes the native error to the settings panel.
    }
  }

  // --- Pagination Rules State ---
  const paginationMode = ref("h2"); // "h2" | "h3" | "delimiter" | "length" | "smart"
  const customDelimiter = ref("---");
  const maxPageLength = ref(300);

  function setPaginationMode(mode) {
    paginationMode.value = mode;
  }

  function setCustomDelimiter(delimiter) {
    customDelimiter.value = delimiter;
  }

  function setMaxPageLength(len) {
    const val = parseInt(len, 10);
    if (!isNaN(val) && val >= 50) {
      maxPageLength.value = val;
    }
  }

  function restoreUserSettings() {
    try {
      const rawSettings = localStorage.getItem(SETTINGS_KEY);
      if (!rawSettings) return;

      const settings = JSON.parse(rawSettings);
      if (!settings || typeof settings !== "object") return;

      if (typeof settings.showTopLeft === "boolean") showTopLeft.value = settings.showTopLeft;
      if (typeof settings.showTopRight === "boolean") showTopRight.value = settings.showTopRight;
      if (typeof settings.showBottomLeft === "boolean") showBottomLeft.value = settings.showBottomLeft;
      if (typeof settings.showBottomRight === "boolean") showBottomRight.value = settings.showBottomRight;
      if (THEME_LIST.some((theme) => theme.name === settings.selectedTheme)) selectedTheme.value = settings.selectedTheme;
      if (platforms.some((platform) => platform.name === settings.selectedPlatformName)) selectedPlatformName.value = settings.selectedPlatformName;
      if (EXPORT_FORMATS.includes(settings.selectedFormat)) selectedFormat.value = settings.selectedFormat;
      if ([1, 2, 3].includes(settings.scale)) scale.value = settings.scale;
      if (typeof settings.transparentBackground === "boolean") transparentBackground.value = settings.transparentBackground;
      if (typeof settings.solidBackground === "boolean") solidBackground.value = settings.solidBackground;
      if (typeof settings.backgroundColor === "string") backgroundColor.value = settings.backgroundColor;
      if (BACKGROUND_TYPES.includes(settings.backgroundType)) backgroundType.value = settings.backgroundType;
      if (typeof settings.backgroundValue === "string") backgroundValue.value = settings.backgroundValue;
      if (typeof settings.exportPath === "string") exportPath.value = settings.exportPath;
      if (Number.isFinite(settings.zoom)) zoom.value = Math.min(100, Math.max(52, settings.zoom));
      if (Number.isFinite(settings.customWidth)) customWidth.value = Math.min(3840, Math.max(300, settings.customWidth));
      if (Number.isFinite(settings.customHeight)) customHeight.value = Math.min(3840, Math.max(300, settings.customHeight));
      if (PAGINATION_MODES.includes(settings.paginationMode)) paginationMode.value = settings.paginationMode;
      if (typeof settings.customDelimiter === "string") customDelimiter.value = settings.customDelimiter;
      if (Number.isFinite(settings.maxPageLength)) maxPageLength.value = Math.max(50, settings.maxPageLength);
      if (typeof settings.selectedFontId === "string") selectedFontId.value = settings.selectedFontId;

      if (settings.globalMeta && typeof settings.globalMeta === "object") {
        if (typeof settings.globalMeta.kicker === "string") globalMeta.value.kicker = settings.globalMeta.kicker;
        if (typeof settings.globalMeta.date === "string") globalMeta.value.date = settings.globalMeta.date;
        if (typeof settings.globalMeta.quote === "string") globalMeta.value.quote = settings.globalMeta.quote;
      }
    } catch {
      // Ignore corrupted or unavailable local settings.
    }
  }

  function persistUserSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        showTopLeft: showTopLeft.value,
        showTopRight: showTopRight.value,
        showBottomLeft: showBottomLeft.value,
        showBottomRight: showBottomRight.value,
        selectedTheme: selectedTheme.value,
        selectedPlatformName: selectedPlatformName.value,
        selectedFormat: selectedFormat.value,
        scale: scale.value,
        transparentBackground: transparentBackground.value,
        solidBackground: solidBackground.value,
        backgroundColor: backgroundColor.value,
        backgroundType: backgroundType.value,
        backgroundValue: backgroundValue.value,
        exportPath: exportPath.value,
        zoom: zoom.value,
        customWidth: customWidth.value,
        customHeight: customHeight.value,
        paginationMode: paginationMode.value,
        customDelimiter: customDelimiter.value,
        maxPageLength: maxPageLength.value,
        selectedFontId: selectedFontId.value,
        globalMeta: globalMeta.value,
      }));
    } catch {
      // Local storage may be unavailable or full; settings remain in memory.
    }
  }

  restoreUserSettings();
  setCustomDimensions(customWidth.value, customHeight.value);

  watch(
    [
      showTopLeft,
      showTopRight,
      showBottomLeft,
      showBottomRight,
      selectedTheme,
      selectedPlatformName,
      selectedFormat,
      scale,
      transparentBackground,
      solidBackground,
      backgroundColor,
      backgroundType,
      backgroundValue,
      exportPath,
      zoom,
      customWidth,
      customHeight,
      paginationMode,
      customDelimiter,
      maxPageLength,
      selectedFontId,
      globalMeta,
    ],
    persistUserSettings,
    { deep: true },
  );

  refreshCustomFonts();

  // --- History Management ---
  const undoStack = ref([]);
  const redoStack = ref([]);
  const maxHistorySize = 100;

  let lastCommittedState = initialMarkdown;
  let historyDebounceTimer = null;
  let isUndoRedoOperation = false;

  const canUndo = computed(() => undoStack.value.length > 0 || markdownSource.value !== lastCommittedState);
  const canRedo = computed(() => redoStack.value.length > 0);

  // --- Auto-Save Management ---
  const DRAFT_KEY = "markcard_studio_draft_v1";
  const autoSaveStatus = ref(t("runtime.autosaveEnabled"));
  let autoSaveTimer = null;
  let isRestoringDraft = false;

  // Restore draft from localStorage on load if available
  try {
    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      const parsed = JSON.parse(savedDraft);
      if (parsed && typeof parsed.content === "string" && parsed.content.trim()) {
        if (parsed.content.startsWith("# 未命名作品")) {
          localStorage.removeItem(DRAFT_KEY);
        } else {
          markdownSource.value = parsed.content;
          savedContent.value = parsed.content;
          lastCommittedState = parsed.content;
          isRestoringDraft = true;
          autoSaveStatus.value = t("runtime.draftRestored");
        }
      }
    }
  } catch {
    // Ignore localStorage parse errors
  }

  function pushUndoState(state) {
    if (undoStack.value.length > 0 && undoStack.value[undoStack.value.length - 1] === state) {
      return;
    }
    undoStack.value.push(state);
    if (undoStack.value.length > maxHistorySize) {
      undoStack.value.shift();
    }
  }

  function flushPendingHistory() {
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = null;
    }
    if (markdownSource.value !== lastCommittedState) {
      pushUndoState(lastCommittedState);
      lastCommittedState = markdownSource.value;
    }
  }

  function recordDiscreteChange(newContent) {
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = null;
    }
    if (markdownSource.value !== lastCommittedState) {
      pushUndoState(lastCommittedState);
    }
    pushUndoState(markdownSource.value);
    redoStack.value = [];
    isUndoRedoOperation = true;
    markdownSource.value = newContent;
    lastCommittedState = newContent;
  }

  function scheduleTypingHistory(newContent) {
    if (isUndoRedoOperation) return;

    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
    }

    historyDebounceTimer = setTimeout(() => {
      if (lastCommittedState !== newContent) {
        pushUndoState(lastCommittedState);
        redoStack.value = [];
        lastCommittedState = newContent;
      }
      historyDebounceTimer = null;
    }, 450);
  }

  watch(markdownSource, (newVal) => {
    if (isUndoRedoOperation) {
      isUndoRedoOperation = false;
    } else {
      scheduleTypingHistory(newVal);
    }

    if (isRestoringDraft) {
      isRestoringDraft = false;
      return;
    }

    autoSaveStatus.value = t("runtime.editing");
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    autoSaveTimer = setTimeout(async () => {
      autoSaveStatus.value = t("runtime.saving");

      if (!sourcePath.value) {
        try {
          localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({
              content: newVal,
              updatedAt: Date.now(),
            }),
          );
          autoSaveStatus.value = t("runtime.draftBackedUp");
        } catch {
          autoSaveStatus.value = t("runtime.draftBackupFailed");
        }
      } else {
        try {
          await saveDocument(true);
          autoSaveStatus.value = t("runtime.fileAutosaved");
        } catch {
          autoSaveStatus.value = t("runtime.fileAutosaveFailed");
        }
      }
    }, 1200);
  });

  function undo() {
    flushPendingHistory();
    if (undoStack.value.length === 0) return;

    const previousState = undoStack.value.pop();
    redoStack.value.push(markdownSource.value);

    isUndoRedoOperation = true;
    markdownSource.value = previousState;
    lastCommittedState = previousState;
  }

  function redo() {
    if (redoStack.value.length === 0) return;

    flushPendingHistory();

    const nextState = redoStack.value.pop();
    pushUndoState(markdownSource.value);

    isUndoRedoOperation = true;
    markdownSource.value = nextState;
    lastCommittedState = nextState;
  }

  function resetHistory(initialContent = markdownSource.value) {
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      historyDebounceTimer = null;
    }
    undoStack.value = [];
    redoStack.value = [];
    lastCommittedState = initialContent;
  }

  async function openExportFolderPicker() {
    try {
      const selected = await invoke("pick_export_folder");
      if (selected) {
        exportPath.value = selected;
        return selected;
      }
    } catch {
      const manual = prompt(t("publish.pathPrompt"), exportPath.value);
      if (manual && manual.trim()) {
        exportPath.value = manual.trim();
        return manual.trim();
      }
    }
    return null;
  }

  const lineCount = computed(() => markdownSource.value.split("\n").length);
  const wordCount = computed(() => markdownSource.value.replace(/\s/g, "").length);
  const isDirty = computed(() => markdownSource.value !== savedContent.value);

  const markdownLines = computed(() =>
    markdownSource.value.split("\n").map((text, index) => ({
      no: index + 1,
      text,
      type: getLineType(text),
    })),
  );
  const selectedPlatform = computed(() => {
    const found = platforms.find((platform) => platform.name === selectedPlatformName.value) ?? platforms[0];
    if (found.custom) {
      return {
        ...found,
        width: customWidth.value,
        height: customHeight.value,
        size: `${customWidth.value} x ${customHeight.value}`,
        ratio: `${customWidth.value}:${customHeight.value}`,
      };
    }
    return found;
  });
  const canvasRatio = computed(() => `${selectedPlatform.value.width} / ${selectedPlatform.value.height}`);
  const canvasSizeLabel = computed(
    () => `${selectedPlatform.value.width} x ${selectedPlatform.value.height}`,
  );
  const selectedThemeClass = computed(() => getThemeByName(selectedTheme.value).class);

  const selectedPage = computed(
    () => pages.value[activePageIndex.value] ?? pages.value[0] ?? createFallbackPage(),
  );

  const canGoPrevious = computed(() => activePageIndex.value > 0);
  const canGoNext = computed(() => activePageIndex.value < pages.value.length - 1);

  let parseVersion = 0;
  let debounceTimer = null;
  let paginationAbortController = null;
  let suppressDocumentWatchers = false;

  async function updatePagesNow() {
    paginationAbortController?.abort();
    const abortController = new AbortController();
    paginationAbortController = abortController;
    const version = ++parseVersion;
    isLoadingDocument.value = true;
    let paginationSession = null;

    try {
      const requestedFontId = selectedFontId.value;
      if (requestedFontId === "theme-default") {
        applyLoadedCustomFont(null);
      } else {
        try {
          const loaded = await ensureCustomFontLoaded(requestedFontId);
          if (version !== parseVersion) return;
          if (loaded && requestedFontId === selectedFontId.value) {
            applyLoadedCustomFont(loaded);
          }
        } catch (error) {
          if (requestedFontId === selectedFontId.value) {
            applyLoadedCustomFont(null);
            selectedFontId.value = "theme-default";
            customFontError.value = error?.message || String(error);
          }
          return;
        }
      }

      const parsed = parseMarkdownSections(
        markdownSource.value,
        paginationMode.value,
        customDelimiter.value,
        maxPageLength.value,
      );
      const nextPages = [];
      paginationSession = createMeasuredPaginationSession({
        platform: selectedPlatform.value,
        themeClass: selectedThemeClass.value,
        showTopLeft: showTopLeft.value,
        showTopRight: showTopRight.value,
        showBottomLeft: showBottomLeft.value,
        showBottomRight: showBottomRight.value,
        customFontFamily: customFontFamily.value,
        customFontFingerprint: customFontFingerprint.value,
        signal: abortController.signal,
      });

      for (let index = 0; index < parsed.length; index += 1) {
        const section = parsed[index];
        const allBlocks = parseBlocks(section.bodyMarkdown);
        await resolveBlockImages(allBlocks, sourcePath.value);
        if (abortController.signal.aborted) return;
        const resolvedMarkdown = section.bodyMarkdown;
        const imageUrl = allBlocks
          .flatMap((block) => block.type === "image" ? [block] : (block.images || []))
          .find((image) => image.src && !image.missing)?.src || "";
        const blockPages = await paginationSession.paginate(
          allBlocks,
          {
            title: section.title,
            cover: section.cover,
            maxPageLength: ["length", "smart"].includes(paginationMode.value)
              ? maxPageLength.value
              : null,
          },
        );
        if (version !== parseVersion) return;

        const customMeta = customPageMetas.value[index] || {};
        const baseKicker = customMeta.kicker || section.kicker || globalMeta.value.kicker || "@图文坊";
        const baseDate = customMeta.date || section.date || globalMeta.value.date || getTodayDateString();
        const baseQuote = customMeta.quote || section.quote || globalMeta.value.quote || t("runtime.defaultQuote");

        // Main page (first block-page)
        nextPages.push({
          ...section,
          label: index === 0 ? t("runtime.cover") : String(nextPages.length),
          kicker: baseKicker,
          date: baseDate,
          quote: baseQuote,
          imageClass: pageImageClasses[index % pageImageClasses.length],
          blocks: blockPages[0] || [],
          bodyMarkdown: resolvedMarkdown,
          body: blocksToPreviewText(blockPages[0] || []),
          imageUrl,
          isOverflow: false,
        });

        // Overflow pages (additional block-pages for the same section)
        for (let subIdx = 1; subIdx < blockPages.length; subIdx++) {
          const overflowBlocks = blockPages[subIdx];
          nextPages.push({
            title: section.title,
            label: String(nextPages.length),
            kicker: baseKicker,
            date: baseDate,
            quote: baseQuote,
            imageClass: pageImageClasses[index % pageImageClasses.length],
            blocks: overflowBlocks,
            bodyMarkdown: resolvedMarkdown,
            body: blocksToPreviewText(overflowBlocks),
            imageUrl: "",
            cover: false,
            isOverflow: true,
          });
        }
      }

      if (version !== parseVersion) return;

      pages.value = nextPages.length ? nextPages : [createFallbackPage()];
      if (activePageIndex.value > pages.value.length - 1) {
        activePageIndex.value = Math.max(0, pages.value.length - 1);
      }
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
    } finally {
      paginationSession?.destroy();
      if (paginationAbortController === abortController) {
        paginationAbortController = null;
      }
      if (version === parseVersion) {
        isLoadingDocument.value = false;
      }
    }
  }

  watch(
    sourcePath,
    () => {
      if (suppressDocumentWatchers) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      updatePagesNow();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    paginationAbortController?.abort();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (historyDebounceTimer) clearTimeout(historyDebounceTimer);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
  });

  watch(
    markdownSource,
    () => {
      if (suppressDocumentWatchers) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updatePagesNow();
      }, 120);
    },
  );

  watch([paginationMode, customDelimiter, maxPageLength], () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    updatePagesNow();
  });

  watch([
    selectedPlatformName,
    customWidth,
    customHeight,
    selectedTheme,
    showTopLeft,
    showTopRight,
    showBottomLeft,
    showBottomRight,
    selectedFontId,
  ], () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updatePagesNow();
    }, 120);
  });

  watch(
    () => i18n.global.locale.value,
    (newLocale, oldLocale) => {
      const defaultQuotes = ["zh-CN", "en-US"].map(
        (locale) => i18n.global.getLocaleMessage(locale)?.runtime?.defaultQuote,
      );
      if (defaultQuotes.includes(globalMeta.value.quote)) {
        globalMeta.value.quote = t("runtime.defaultQuote");
      }
      if (["已开启", "On"].includes(autoSaveStatus.value)) {
        autoSaveStatus.value = t("runtime.autosaveEnabled");
      }

      // 如果未绑定本地文件，切换系统语言时重置并初始化对应语言的默认案例；若已绑定本地文件则保持内容不变
      if (!sourcePath.value && newLocale && newLocale !== oldLocale) {
        const nextDefaultContent = newLocale === "zh-CN" ? defaultMarkdown : defaultMarkdownEnglish;
        suppressDocumentWatchers = true;
        markdownSource.value = nextDefaultContent;
        savedContent.value = nextDefaultContent;
        lastCommittedState = nextDefaultContent;
        resetHistory(nextDefaultContent);
        activePageIndex.value = 0;
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          // Ignore
        }
        nextTick(() => {
          suppressDocumentWatchers = false;
        });
      }

      updatePagesNow();
    },
  );

  async function loadDocumentFromContent(file) {
    if (!file || typeof file.content !== "string") return;
    suppressDocumentWatchers = true;
    try {
      markdownSource.value = file.content;
      savedContent.value = file.content;
      sourcePath.value = file.path || "";
      if (file.path) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          // Ignore
        }
      }
      resetHistory(file.content);
      activePageIndex.value = 0;
      const displayName = file.name || file.fileName || t("runtime.markdownDocument");
      autoSaveStatus.value = file.path ? t("runtime.fileOpened") : t("runtime.contentImported");
      if (debounceTimer) clearTimeout(debounceTimer);
      await nextTick();
      await updatePagesNow();
      exportMessage.value = file.path
        ? t("runtime.opened", { name: displayName, count: pages.value.length })
        : t("runtime.imported", { name: displayName, count: pages.value.length });
    } finally {
      suppressDocumentWatchers = false;
    }
  }

  async function openDocumentFromDialog() {
    isLoadingDocument.value = true;
    try {
      const file = await invoke("open_markdown_file");
      if (!file) return null;

      await loadDocumentFromContent(file);
      return file;
    } catch (err) {
      exportMessage.value = t("runtime.openFailed", { error: err.message || err });
      return null;
    } finally {
      isLoadingDocument.value = false;
    }
  }

  async function saveDocument(isAutoSave = false) {
    try {
      if (isAutoSave && !sourcePath.value) {
        return null;
      }

      const result = await invoke("save_markdown_file", {
        path: sourcePath.value || null,
        content: markdownSource.value,
      });

      if (result?.path) {
        sourcePath.value = result.path;
        savedContent.value = markdownSource.value;
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          // Ignore
        }

        if (!isAutoSave) {
          exportMessage.value = t("runtime.savedTo", { name: result.fileName || result.path });
          autoSaveStatus.value = t("runtime.fileSaved");
        } else {
          autoSaveStatus.value = t("runtime.fileAutosaved");
        }
        return result.path;
      }
      return null;
    } catch (err) {
      if (!isAutoSave) {
        exportMessage.value = t("runtime.saveFailed", { error: err.message || err });
      }
      autoSaveStatus.value = t("runtime.saveFailedShort");
      return null;
    }
  }

  function createNewDocument() {
    const newContent = `# ${t("document.title")}

> ${t("document.lead")}

## 1. ${t("document.firstPage")}
${t("document.inputHere")}`;
    markdownSource.value = newContent;
    sourcePath.value = "";
    savedContent.value = newContent;
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore
    }
    resetHistory(newContent);
    activePageIndex.value = 0;
    exportMessage.value = t("runtime.newArtwork");
    autoSaveStatus.value = t("runtime.autosaveEnabled");
    if (debounceTimer) clearTimeout(debounceTimer);
    updatePagesNow();
  }

  function addPageTemplate() {
    const nextIndex = pages.value.length;
    const newContent = `${markdownSource.value.trim()}\n\n## ${nextIndex}. ${t("document.newPage")}\n${t("document.continueHere")}`;
    recordDiscreteChange(newContent);
    activePageIndex.value = Math.max(0, pages.value.length - 1);
  }

  function deletePage(index) {
    if (pages.value.length <= 1) return;
    const parsed = parseMarkdownSections(markdownSource.value);
    if (index < 0 || index >= parsed.length) return;

    parsed.splice(index, 1);

    const title = parsed[0]?.cover ? `# ${parsed[0].title}\n\n${parsed[0].bodyMarkdown}` : `# ${t("document.title")}`;
    const rest = parsed.slice(1).map((sec) => sec.title ? `## ${sec.title}\n${sec.bodyMarkdown}` : `---\n${sec.bodyMarkdown}`).join("\n\n");

    const newContent = `${title}\n\n${rest}`.trim();
    recordDiscreteChange(newContent);
    if (activePageIndex.value >= pages.value.length - 1) {
      activePageIndex.value = Math.max(0, pages.value.length - 2);
    }
  }

  function movePage({ fromIndex, toIndex }) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const parsed = parseMarkdownSections(markdownSource.value);
    if (fromIndex >= parsed.length || toIndex >= parsed.length) return;

    const [moved] = parsed.splice(fromIndex, 1);
    parsed.splice(toIndex, 0, moved);

    const title = parsed[0]?.cover ? `# ${parsed[0].title}\n\n${parsed[0].bodyMarkdown}` : `# ${t("document.title")}`;
    const rest = parsed.slice(1).map((sec) => sec.title ? `## ${sec.title}\n${sec.bodyMarkdown}` : `---\n${sec.bodyMarkdown}`).join("\n\n");

    const newContent = `${title}\n\n${rest}`.trim();
    recordDiscreteChange(newContent);
    activePageIndex.value = toIndex;
  }

  function selectPage(index) {
    activePageIndex.value = index;
  }

  function nextPage() {
    if (canGoNext.value) activePageIndex.value += 1;
  }

  function previousPage() {
    if (canGoPrevious.value) activePageIndex.value -= 1;
  }

  function setZoom(nextZoom) {
    zoom.value = Math.min(100, Math.max(52, nextZoom));
  }

  function toggleTheme() {
    const themes = THEME_LIST.map((t) => t.name);
    const index = themes.indexOf(selectedTheme.value);
    selectedTheme.value = themes[(index + 1) % themes.length];
  }

  function setCustomWidth(w) {
    const val = parseInt(w, 10);
    if (!isNaN(val) && val > 0) {
      customWidth.value = Math.min(3840, Math.max(300, val));
    }
  }

  function setCustomHeight(h) {
    const val = parseInt(h, 10);
    if (!isNaN(val) && val > 0) {
      customHeight.value = Math.min(3840, Math.max(300, val));
    }
  }

  function setCustomDimensions(w, h) {
    setCustomWidth(w);
    setCustomHeight(h);
  }

  function swapDimensions() {
    const temp = customWidth.value;
    customWidth.value = customHeight.value;
    customHeight.value = temp;
  }

  function updateGlobalMeta(meta) {
    if (meta.kicker !== undefined) globalMeta.value.kicker = meta.kicker;
    if (meta.date !== undefined) globalMeta.value.date = meta.date;
    if (meta.quote !== undefined) globalMeta.value.quote = meta.quote;

    pages.value.forEach((page, idx) => {
      if (meta.kicker !== undefined) page.kicker = meta.kicker;
      if (meta.date !== undefined) page.date = meta.date;
      if (meta.quote !== undefined) page.quote = meta.quote;
      customPageMetas.value[idx] = { ...page };
    });
  }

  return {
    markdownSource,
    sourcePath,
    savedContent,
    isDirty,
    pages,
    markdownLines,
    selectedPage,
    activePageIndex,
    isLoadingDocument,
    isExporting,
    exportMessage,
    autoSaveStatus,
    showPageNumber,
    showTopLeft,
    showTopRight,
    showBottomLeft,
    showBottomRight,
    selectedTheme,
    selectedPlatformName,
    selectedFormat,
    scale,
    transparentBackground,
    solidBackground,
    backgroundColor,
    exportPath,
    zoom,
    activeTab,
    customWidth,
    customHeight,
    customFonts,
    selectedFontId,
    customFontFamily,
    customFontEmbedCss,
    customFontFingerprint,
    isLoadingCustomFonts,
    customFontError,
    isCustomFontRuntimeAvailable,
    lineCount,
    wordCount,
    platforms,
    selectedPlatform,
    canvasRatio,
    canvasSizeLabel,
    selectedThemeClass,
    canGoPrevious,
    canGoNext,
    canUndo,
    canRedo,
    undo,
    redo,
    recordDiscreteChange,
    resetHistory,
    loadDocumentFromContent,
    openDocumentFromDialog,
    saveDocument,
    createNewDocument,
    addPageTemplate,
    deletePage,
    movePage,
    selectPage,
    nextPage,
    previousPage,
    setZoom,
    toggleTheme,
    backgroundType,
    backgroundValue,
    setBackgroundType,
    setBackgroundValue,
    paginationMode,
    customDelimiter,
    maxPageLength,
    setPaginationMode,
    setCustomDelimiter,
    setMaxPageLength,
    setCustomWidth,
    setCustomHeight,
    setCustomDimensions,
    swapDimensions,
    importCustomFont,
    selectCustomFont,
    deleteCustomFont,
    openExportFolderPicker,
    updateGlobalMeta,
  };
}

function createFallbackPage() {
  return {
    label: t("runtime.cover"),
    kicker: "@图文坊",
    title: t("document.title"),
    bodyMarkdown: t("document.defaultBody"),
    body: [t("document.defaultBody")],
    imageClass: pageImageClasses[0],
    imageUrl: "",
    cover: true,
  };
}

function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
}

function extractDocumentTitle(lines) {
  const h1 = lines.find((line) => /^#\s+/.test(line));
  if (h1) return cleanMarkdownText(h1);

  const h2 = lines.find((line) => /^##\s+/.test(line));
  if (h2) return cleanMarkdownText(h2);

  const h3 = lines.find((line) => /^###\s+/.test(line));
  if (h3) return cleanMarkdownText(h3);

  const firstText = lines.find((line) => {
    const t = line.trim();
    return Boolean(t) && !t.startsWith("---") && !t.startsWith("***") && !t.startsWith("<!--");
  });
  if (firstText) return cleanMarkdownText(firstText);

  return t("document.title");
}

function parseMarkdownSections(source, mode = "h2", delimiter = "---", maxLen = 300) {
  if (!source || !source.trim()) {
    return [createFallbackPage()];
  }

  const lines = source.split("\n");
  const documentTitle = extractDocumentTitle(lines);
  const documentTitleLineIndex = lines.findIndex((line) => /^#\s+/.test(line));

  const sections = [];
  const introLines = [];
  let currentSection = null;
  let activeFence = "";

  function isBreakLine(line) {
    const trimmed = line.trim();

    if (mode === "h2") {
      return /^##\s+/.test(line) || /^---$|^\*\*\*$|^<!--\s*page\s*-->/i.test(trimmed);
    }

    if (mode === "h3") {
      return /^#{2,3}\s+/.test(line) || /^---$|^\*\*\*$|^<!--\s*page\s*-->/i.test(trimmed);
    }

    if (mode === "delimiter") {
      if (delimiter && trimmed === delimiter.trim()) return true;
      return /^---$|^\*\*\*$|^<!--\s*page\s*-->/i.test(trimmed);
    }

    if (mode === "length") {
      return /^#{2,6}\s+/.test(line) || /^---$|^\*\*\*$|^<!--\s*page\s*-->/i.test(trimmed);
    }

    if (mode === "smart") {
      return /^#{2,3}\s+/.test(line) || /^---$|^\*\*\*$|^<!--\s*page\s*-->/i.test(trimmed);
    }

    return /^##\s+/.test(line);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (activeFence) {
      const marker = fenceMatch?.[1] || "";
      const isClosingFence = marker[0] === activeFence[0]
        && marker.length >= activeFence.length
        && marker.length === trimmed.length;
      if (isClosingFence) activeFence = "";
      if (currentSection) currentSection.bodyMarkdown += `${line}\n`;
      else introLines.push(line);
      continue;
    }

    if (fenceMatch) {
      activeFence = fenceMatch[1];
      if (currentSection) currentSection.bodyMarkdown += `${line}\n`;
      else introLines.push(line);
      continue;
    }

    if (i === documentTitleLineIndex) {
      continue;
    }

    if (isBreakLine(line)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const isExplicitBreak =
        /^---$|^\*\*\*$|^<!--\s*page\s*-->/i.test(line.trim()) ||
        (mode === "delimiter" && line.trim() === delimiter?.trim());
      currentSection = {
        title: isExplicitBreak ? "" : cleanMarkdownText(line),
        bodyMarkdown: "",
        cover: false,
      };
      continue;
    }

    if (currentSection) {
      currentSection.bodyMarkdown += `${line}\n`;
    } else {
      introLines.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  // With no page break, all body lines already belong to the cover. Creating
  // an additional fallback section here would render the entire document twice.
  const finalSections = sections;

  const validSections = finalSections.filter(
    (sec) => Boolean(sec.title && sec.title.trim()) || Boolean(sec.bodyMarkdown && sec.bodyMarkdown.trim())
  );
  const sectionsToRender = validSections.length ? validSections : finalSections;

  const coverBodyMarkdown = introLines.join("\n").trim();
  const pages = [
    {
      title: documentTitle,
      bodyMarkdown: coverBodyMarkdown,
      cover: true,
    },
    ...sectionsToRender.map((section) => ({
      title: section.title,
      bodyMarkdown: section.bodyMarkdown.trim(),
      cover: false,
    })),
  ];

  return pages.length ? pages : [createFallbackPage()];
}

function cleanMarkdownText(text) {
  return text
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function getLineType(text) {
  if (/^#{1,6}\s+/.test(text)) return "heading";
  if (/^>\s?/.test(text)) return "quote";
  if (/^[-*]\s+/.test(text)) return "list";
  return "";
}

async function resolveBlockImages(blocks, basePath) {
  for (const block of blocks || []) {
    const images = block.type === "image" ? [block] : block.images || [];
    for (const image of images) {
      if (!image.src) continue;
      const replacement = await tryResolveImage(image.src, basePath);
      if (replacement) {
        image.src = replacement;
        image.missing = false;
      } else if (!/^(https?:|data:|blob:)/i.test(image.src)) {
        // Keep the original Markdown visible when a local asset is unavailable.
        image.missing = true;
      }
    }
  }
}

async function tryResolveImage(target, basePath) {
  if (!target) return "";

  const rawTarget = target.trim().replace(/^<(.+)>$/, "$1");

  if (/^(https?:|data:|blob:)/i.test(rawTarget)) {
    return rawTarget;
  }

  // markdown-it percent-encodes non-ASCII and spaces in image destinations.
  // Decode local paths before handing them to the filesystem resolver.
  let raw = rawTarget;
  if (!/^file:\/\//i.test(rawTarget)) {
    try {
      raw = decodeURIComponent(rawTarget);
    } catch {
      raw = rawTarget;
    }
  }

  const cacheKey = `${basePath || ""}::${raw}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const resolved = await invoke("resolve_local_image", {
        path: raw,
        basePath: basePath || null,
      });
      return resolved?.dataUrl || "";
    } catch {
      return "";
    }
  })();

  imageCache.set(cacheKey, promise);
  return promise;
}
