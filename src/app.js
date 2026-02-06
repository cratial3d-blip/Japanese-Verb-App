const Core = window.JapaneseSrsCore;
const Notifications =
  window.JapaneseSrsNotifications ||
  {
    getPermission: () => "unsupported",
    requestPermission: async () => "unsupported",
    reschedule: async () => ({ permission: "unsupported", plan: [] }),
    getPlanSnapshot: () => null,
    formatPlanSummary: () => "",
  };

function setupLiveKanaInput(inputEl) {
  let raw = "";
  let suppressInput = false;

  function render() {
    suppressInput = true;
    inputEl.value = Core.romajiToKana(raw);
    const end = inputEl.value.length;
    inputEl.setSelectionRange(end, end);
    suppressInput = false;
  }

  inputEl.addEventListener("focus", () => {
    if (!raw && inputEl.value) {
      raw = inputEl.value;
      render();
    }
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === "Backspace") {
      raw = raw.slice(0, -1);
      event.preventDefault();
      render();
      return;
    }

    if (event.key === "Delete") {
      raw = raw.slice(0, -1);
      event.preventDefault();
      render();
      return;
    }

    if (event.key === "Tab" || event.key === "Enter") {
      return;
    }

    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      return;
    }

    if (event.key.length === 1) {
      raw += event.key;
      event.preventDefault();
      render();
    }
  });

  inputEl.addEventListener("paste", (event) => {
    const text = event.clipboardData.getData("text");
    if (text) {
      raw += text;
      event.preventDefault();
      render();
    }
  });

  inputEl.addEventListener("input", () => {
    if (suppressInput) return;
    raw = inputEl.value;
    render();
  });

  return {
    reset() {
      raw = "";
      render();
    },
  };
}

function attachEnterHandler(inputEl, primaryBtn, secondaryBtn) {
  if (!inputEl) return;
  inputEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (primaryBtn && primaryBtn.style.display !== "none" && !primaryBtn.disabled) {
      primaryBtn.click();
      return;
    }
    if (secondaryBtn && secondaryBtn.style.display !== "none" && !secondaryBtn.disabled) {
      secondaryBtn.click();
    }
  });
}

const DATA_PATHS = {
  verbs: "data/verbs/verbs.v2.jsonl?v=20260204_1",
  exceptions: "data/exceptions/verb_exceptions.v1.json?v=20260204_1",
  templates: "data/conjugations/conjugation_templates.v2.json?v=20260204_2",
  ruleHints: "data/ui_text/rule_hints.v2.json?v=20260204_2",
  exampleSentences: "data/ui_text/example_sentences.v3.json?v=20260204_1",
  furigana: "data/ui_text/furigana.verbs.v2.v1.json?v=20260204_1",
};

const STORAGE_KEY = "japanese_srs_cards_v1";
const SETTINGS_KEY = "japanese_srs_settings_v1";
const STATS_KEY = "japanese_srs_stats_v1";
const DEMO_FLAG_KEY = "japanese_srs_demo_mode_v1";
const DEMO_BACKUP_KEY = "japanese_srs_demo_backup_v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_VERSION = "v1";

const state = {
  verbs: [],
  templates: [],
  exceptions: {},
  ruleHints: null,
  exampleSentences: null,
  furigana: null,
  stats: null,
  settings: null,
  cards: {},
  verbsById: {},
  templatesById: {},
  drillForms: [],
};

let lessonsActive = false;
let currentScreen = "home";
let reviewSession = null;
let lessonSession = null;
let reminderSyncTimer = null;
let verbBrowserReturnScreen = "lessons";
let verbBrowserPage = 1;
const VERB_BROWSER_PAGE_SIZE = 12;
const TAB_UI_MEMORY_SCREENS = new Set(["stats", "verb-browser"]);
const tabUiMemory = {
  scrollTopByScreen: {},
  verbBrowserQuery: "",
};

function isDictionaryTemplateId(templateId) {
  return templateId === "plain_dictionary";
}

const FORM_GROUPS = [
  {
    id: "plain_negative",
    label: "Plain negative (ない)",
    templates: ["plain_negative"],
  },
  {
    id: "plain_past",
    label: "Plain past (た)",
    templates: ["plain_past"],
  },
  {
    id: "plain_past_negative",
    label: "Plain past negative (なかった)",
    templates: ["plain_past_negative"],
  },
  {
    id: "plain_te_form",
    label: "Te-form (て／で)",
    templates: ["plain_te_form"],
  },
  {
    id: "polite_basic",
    label: "Polite (ます・ません・ました・ませんでした)",
    templates: [
      "polite_dictionary",
      "polite_negative",
      "polite_past",
      "polite_past_negative",
    ],
  },
  {
    id: "requests",
    label: "Requests (てください・ないでください)",
    templates: ["polite_te_form", "plain_nai_de_kudasai"],
  },
  {
    id: "progressive_state",
    label: "Progressive / state (ている・ています・ていません・ていました・ていませんでした)",
    templates: [
      "plain_te_iru",
      "polite_te_imasu",
      "polite_te_imasen",
      "polite_te_imashita",
      "polite_te_imasen_deshita",
    ],
  },
  {
    id: "permission_prohibition",
    label: "Permission / prohibition (てもいい・てはいけない)",
    templates: ["plain_te_mo_ii", "plain_te_wa_ikenai"],
  },
  {
    id: "desire",
    label: "Desire (たい・たくない・たかった・たくなかった)",
    templates: [
      "plain_tai",
      "plain_tai_negative",
      "plain_tai_past",
      "plain_tai_past_negative",
    ],
  },
  {
    id: "volitional",
    label: "Volitional (〜よう・〜おう・〜ましょう)",
    templates: ["plain_volitional", "polite_volitional"],
  },
  {
    id: "potential",
    label: "Potential (よむ→よめる・たべる→たべられる・する→できる・くる→こられる)",
    templates: ["potential_plain"],
  },
];

function selectableTemplates() {
  return state.templates.filter((tpl) => tpl.active && !isDictionaryTemplateId(tpl.id));
}

function getFormGroups() {
  return FORM_GROUPS.map((group) => {
    const ids = group.templates.filter((id) => {
      const tpl = state.templatesById[id];
      return tpl && tpl.active && !isDictionaryTemplateId(id);
    });
    if (ids.length === 0) return null;
    return { id: group.id, label: group.label, templateIds: ids };
  }).filter(Boolean);
}

function getEnabledFormIds() {
  if (Core.normalizeEnabledForms) {
    return Core.normalizeEnabledForms(state.templates, state.settings.enabled_conjugation_forms);
  }
  const eligible = selectableTemplates().map((tpl) => tpl.id);
  if (!Array.isArray(state.settings.enabled_conjugation_forms)) {
    return eligible.slice();
  }
  if (state.settings.enabled_conjugation_forms.length === 0) {
    return [];
  }
  const eligibleSet = new Set(eligible);
  return state.settings.enabled_conjugation_forms.filter((id) => eligibleSet.has(id));
}

function getEnabledTemplates() {
  const enabledIds = new Set(getEnabledFormIds());
  return selectableTemplates().filter((tpl) => enabledIds.has(tpl.id));
}

function filterCardStore(cardStore) {
  const filtered = {};
  Object.keys(cardStore).forEach((key) => {
    const card = cardStore[key];
    if (card && !isDictionaryTemplateId(card.conjugation_id)) {
      filtered[key] = card;
    }
  });
  return filtered;
}

function filterCardsList(cards) {
  return cards.filter((card) => !isDictionaryTemplateId(card.conjugation_id));
}

function setStatus(text) {
  const subtitle = document.getElementById("page-subtitle");
  if (subtitle) {
    subtitle.textContent = text || "";
    return;
  }
  const status = document.getElementById("status");
  if (status) {
    status.textContent = text || "";
  }
}

function setHeader(title, subtitle) {
  const titleEl = document.getElementById("page-title");
  const subtitleEl = document.getElementById("page-subtitle");
  if (titleEl) titleEl.textContent = title || "";
  if (subtitleEl) {
    subtitleEl.textContent = subtitle || "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFuriganaSegments(segments) {
  return segments
    .map(([surface, reading]) => {
      const safeSurface = escapeHtml(surface);
      if (!reading) {
        return `<span>${safeSurface}</span>`;
      }
      return `<ruby>${safeSurface}<rt>${escapeHtml(reading)}</rt></ruby>`;
    })
    .join("");
}

function renderVerbDisplay(verb) {
  if (!verb) return "";
  const entry = state.furigana && state.furigana[verb.id];
  if (entry && Array.isArray(entry.segments) && entry.segments.length) {
    return `<span class="ruby-verb">${renderFuriganaSegments(entry.segments)}</span>`;
  }
  if (verb.kanji && verb.kana) {
    return `<ruby class="ruby-verb">${escapeHtml(verb.kanji)}<rt>${escapeHtml(
      verb.kana,
    )}</rt></ruby>`;
  }
  return `<span class="ruby-verb">${escapeHtml(verb.kana || verb.kanji || "")}</span>`;
}

function shouldVibrate() {
  return Boolean(state.settings && state.settings.vibration && navigator.vibrate);
}

function triggerHaptic(correct) {
  if (!shouldVibrate()) return;
  if (correct) {
    navigator.vibrate(10);
  } else {
    navigator.vibrate([20, 30, 20]);
  }
}

function flashInputFeedback(inputEl, correct) {
  if (!inputEl) return;
  const wrap = inputEl.closest(".input-wrap");
  if (!wrap) return;
  const icon = wrap.querySelector(".input-icon");
  wrap.classList.remove("is-success", "is-error");
  wrap.classList.add(correct ? "is-success" : "is-error");
  if (icon) {
    icon.textContent = correct ? "\u2713" : "\u00d7";
    icon.classList.add("show");
  }
  setTimeout(() => {
    wrap.classList.remove("is-success", "is-error");
    if (icon) icon.classList.remove("show");
  }, 450);
}

function flashButtonFeedback(checkButton, nextButton, correct, nextLabel = "Next") {
  if (!checkButton || !nextButton) return;
  checkButton.textContent = correct ? "\u2713 Correct" : "\u2715 Not quite";
  checkButton.disabled = true;
  setTimeout(() => {
    checkButton.style.display = "none";
    nextButton.style.display = "inline-block";
    nextButton.textContent = nextLabel;
    checkButton.disabled = false;
    checkButton.textContent = "Check";
  }, 400);
}

function setInfoToggle(infoToggle, feedback, open) {
  if (!infoToggle || !feedback) return;
  infoToggle.style.display = "inline-flex";
  feedback.classList.toggle("is-open", open);
  infoToggle.textContent = open ? "Hide info" : "Show info";
}

function showAnswerFlash(flashEl, correct) {
  if (!flashEl) return;
  flashEl.classList.remove("show", "success", "error");
  flashEl.classList.add(correct ? "success" : "error");
  flashEl.textContent = correct ? "Nice — correct" : "Not quite";
  flashEl.classList.add("show");
  if (flashEl._timerId) {
    clearTimeout(flashEl._timerId);
  }
  flashEl._timerId = setTimeout(() => {
    flashEl.classList.remove("show", "success", "error");
    flashEl.textContent = "";
    flashEl._timerId = null;
  }, 850);
}

function isSubmitFormatValid(rawInput) {
  const text = String(rawInput || "");
  const compact = text.replace(/\s+/g, "");
  if (!compact) return false;
  return /^[\u3041-\u309f]+$/.test(compact);
}

function flashInvalidFormat(inputEl) {
  if (!inputEl) return;
  const wrap = inputEl.closest(".input-wrap");
  if (!wrap) return;
  const icon = wrap.querySelector(".input-icon");
  wrap.classList.remove("is-success", "is-error", "is-format-error");
  if (icon) {
    icon.classList.remove("show");
  }
  void wrap.offsetWidth;
  wrap.classList.add("is-format-error");
  if (wrap._formatTimerId) {
    clearTimeout(wrap._formatTimerId);
  }
  wrap._formatTimerId = setTimeout(() => {
    wrap.classList.remove("is-format-error");
    wrap._formatTimerId = null;
  }, 420);
}

function openStudyContentSettings() {
  setActiveScreen("settings");
  requestAnimationFrame(() => {
    const section = document.getElementById("settings-forms-section");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function setLessonsView(mode) {
  const session = document.getElementById("lessons-session");
  if (!session) return;
  session.classList.remove("is-hidden");
}

function rememberTabUiState(screen) {
  if (!TAB_UI_MEMORY_SCREENS.has(screen)) return;
  tabUiMemory.scrollTopByScreen[screen] = window.scrollY || 0;
  if (screen === "verb-browser") {
    const search = document.getElementById("verb-search");
    if (search) {
      tabUiMemory.verbBrowserQuery = search.value || "";
    }
  }
}

function restoreTabUiState(screen) {
  if (!TAB_UI_MEMORY_SCREENS.has(screen)) return;
  if (screen === "verb-browser") {
    const search = document.getElementById("verb-search");
    if (search && typeof tabUiMemory.verbBrowserQuery === "string") {
      search.value = tabUiMemory.verbBrowserQuery;
    }
  }
  const savedTop = tabUiMemory.scrollTopByScreen[screen];
  requestAnimationFrame(() => {
    window.scrollTo({ top: typeof savedTop === "number" ? savedTop : 0, behavior: "auto" });
  });
}

function setActiveScreen(target) {
  const previousScreen = currentScreen;
  if (previousScreen && previousScreen !== target) {
    rememberTabUiState(previousScreen);
  }
  const buttons = document.querySelectorAll(".nav-item");
  const screens = document.querySelectorAll(".screen");
  currentScreen = target;
  buttons.forEach((b) => b.classList.toggle("active", b.dataset.screen === target));
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === `screen-${target}`);
  });
  if (target === "lessons") {
    lessonsActive = false;
    setLessonsView("session");
    const container = document.getElementById("lessons-session");
    if (container) {
      container.innerHTML = "";
    }
    startLessonsFlow();
  } else {
    updateHeaderForScreen(target);
  }
  if (target === "stats") {
    renderStatsScreen();
  }
  if (target === "verb-browser") {
    restoreTabUiState("verb-browser");
    renderVerbBrowser();
  }
  if (target === "stats") {
    restoreTabUiState("stats");
  }
}

function loadCards() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to parse stored cards", err);
    return {};
  }
}

function saveCards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cards));
}

function defaultStats() {
  return {
    dailyActivity: {},
    mistakeLog: [],
    mistakeCounts: {
      cards: {},
      templates: {},
    },
  };
}

function loadStats() {
  const raw = localStorage.getItem(STATS_KEY);
  if (!raw) return defaultStats();
  try {
    return { ...defaultStats(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn("Failed to parse stats", err);
    return defaultStats();
  }
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
}

function defaultSettings() {
  return {
    dailyLessons: 10,
    unlockTime: "",
    maxDailyReviews: null,
    lessonBank: 0,
    lastUnlockAt: null,
    enabled_conjugation_forms: null,
    drill_conjugation_forms: null,
    vibration: true,
    study_level: "N5_N4",
    lesson_content_mode: "level",
    reminders_enabled: false,
    reminders_reviews_time: "19:00",
    reminders_lessons_unlocked: true,
    reminders_permission: "default",
  };
}

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  const base = defaultSettings();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw);
    return { ...base, ...parsed };
  } catch (err) {
    console.warn("Failed to parse settings", err);
    return base;
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function clampDailyLessons(value) {
  const num = Number(value);
  if (isNaN(num)) return 10;
  return Math.min(20, Math.max(1, Math.floor(num)));
}

function mostRecentUnlockTime(now, timeStr) {
  const [hours, minutes] = timeStr.split(":").map((v) => Number(v));
  const candidate = new Date(now.getTime());
  candidate.setHours(hours || 0, minutes || 0, 0, 0);
  if (candidate.getTime() > now.getTime()) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

function advanceByDays(date, days, timeStr) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  if (timeStr) {
    const [hours, minutes] = timeStr.split(":").map((v) => Number(v));
    next.setHours(hours || 0, minutes || 0, 0, 0);
  }
  return next;
}

function applyLessonUnlocks(now) {
  const settings = state.settings;
  settings.dailyLessons = clampDailyLessons(settings.dailyLessons);

  if (!settings.lastUnlockAt) {
    if (settings.unlockTime) {
      const recent = mostRecentUnlockTime(now, settings.unlockTime);
      settings.lastUnlockAt = recent.toISOString();
    } else {
      settings.lastUnlockAt = now.toISOString();
    }
    if (!settings.lessonBank || settings.lessonBank < settings.dailyLessons) {
      settings.lessonBank = settings.dailyLessons;
    }
    saveSettings();
    return;
  }

  const lastUnlock = new Date(settings.lastUnlockAt);
  let count = 0;
  let newLast = lastUnlock;

  if (settings.unlockTime) {
    const recent = mostRecentUnlockTime(now, settings.unlockTime);
    const lastAligned = mostRecentUnlockTime(lastUnlock, settings.unlockTime);
    const diffDays = Math.floor((recent.getTime() - lastAligned.getTime()) / DAY_MS);
    if (diffDays > 0) {
      count = diffDays;
      newLast = advanceByDays(lastAligned, diffDays, settings.unlockTime);
    }
  } else {
    const diffMs = now.getTime() - lastUnlock.getTime();
    if (diffMs >= DAY_MS) {
      count = Math.floor(diffMs / DAY_MS);
      newLast = new Date(lastUnlock.getTime() + count * DAY_MS);
    }
  }

  if (count > 0) {
    settings.lessonBank += count * settings.dailyLessons;
    settings.lastUnlockAt = newLast.toISOString();
    saveSettings();
  }
}

function getLessonsAvailableCount() {
  applyLessonUnlocks(new Date());
  const bank = state.settings.lessonBank || 0;
  const unseen = countAvailableNew();
  const dailyLimit = clampDailyLessons(state.settings.dailyLessons);
  const totalAvailable = Math.min(bank, unseen);
  const availableToday = Math.min(totalAvailable, dailyLimit);
  return {
    available: totalAvailable,
    availableToday,
    bank,
    unseen,
    dailyLimit,
  };
}

function formatTime(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const isPm = hours >= 12;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minuteStr = String(minutes).padStart(2, "0");
  return `${hour12}:${minuteStr} ${isPm ? "PM" : "AM"}`;
}

function getNextUnlockTimeText(now = new Date()) {
  const settings = state.settings;
  if (settings.unlockTime) {
    const [hourStr, minuteStr] = settings.unlockTime.split(":");
    const target = new Date(now.getTime());
    target.setHours(Number(hourStr), Number(minuteStr) || 0, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return formatTime(target);
  }
  if (settings.lastUnlockAt) {
    const next = new Date(new Date(settings.lastUnlockAt).getTime() + DAY_MS);
    return formatTime(next);
  }
  return "";
}

function decrementLessonBank(count) {
  const settings = state.settings;
  settings.lessonBank = Math.max(0, (settings.lessonBank || 0) - count);
  saveSettings();
}

function getMaxDailyReviews() {
  const max = Number(state.settings.maxDailyReviews);
  if (!max || isNaN(max) || max <= 0) return null;
  return Math.floor(max);
}

function getStudyLevelSetting() {
  const level = state.settings.study_level;
  return level === "N5" ? "N5" : "N5_N4";
}

function getLessonContentMode() {
  return state.settings.lesson_content_mode === "custom" ? "custom" : "level";
}

function isCustomContentMode() {
  return getLessonContentMode() === "custom";
}

function getVerbLevelRank(level) {
  if (level === "N5") return 1;
  return 2;
}

function getTemplateLevelRank(level) {
  if (level === "N5") return 1;
  return 2;
}

function isVerbAllowedByLevel(verb) {
  const study = getStudyLevelSetting();
  if (study === "N5") return verb.level === "N5";
  return true;
}

function isTemplateAllowedByLevel(template) {
  const study = getStudyLevelSetting();
  if (study === "N5") {
    return (template.conjugation_level || "unknown") === "N5";
  }
  return true;
}

function getLessonVerbPool() {
  const allowed = isCustomContentMode()
    ? (state.verbs || []).slice()
    : (state.verbs || []).filter(isVerbAllowedByLevel);
  return allowed;
}

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return res.json();
}

async function loadJsonl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  const text = await res.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function ensureCard(verbId, templateId) {
  const cardId = Core.makeCardId(verbId, templateId);
  if (!state.cards[cardId]) {
    state.cards[cardId] = Core.createCard(verbId, templateId, new Date());
  }
  return state.cards[cardId];
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekday(date) {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function timeAgo(ts) {
  const diffMs = Date.now() - new Date(ts).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parseCardId(cardId) {
  const parts = String(cardId).split("::");
  return { verbId: parts[0], templateId: parts[1] };
}

function buildBackupPayload() {
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: {
      cards: state.cards,
      settings: state.settings,
      stats: state.stats,
    },
  };
}

function normalizeImportedSettings(settings) {
  return { ...defaultSettings(), ...(settings || {}) };
}

function normalizeImportedStats(stats) {
  const base = defaultStats();
  if (!stats) return base;
  return {
    ...base,
    ...stats,
    dailyActivity: stats.dailyActivity || {},
    mistakeLog: stats.mistakeLog || [],
    mistakeCounts: stats.mistakeCounts || base.mistakeCounts,
  };
}

function applyImportedData(payload) {
  const data = payload && payload.data ? payload.data : payload;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid backup format.");
  }
  const cards = data.cards && typeof data.cards === "object" ? data.cards : null;
  const settings = data.settings && typeof data.settings === "object" ? data.settings : null;
  const stats = data.stats && typeof data.stats === "object" ? data.stats : null;

  if (!cards || !settings || !stats) {
    throw new Error("Backup missing required data.");
  }

  state.cards = filterCardStore(cards);
  state.settings = normalizeImportedSettings(settings);
  state.stats = normalizeImportedStats(stats);

  localStorage.removeItem(DEMO_FLAG_KEY);
  localStorage.removeItem(DEMO_BACKUP_KEY);

  saveCards();
  saveStats();
  saveSettings();
  applyLessonUnlocks(new Date());
  updateReviewSummary();
  updateLessonSummary();
  populateSettingsForm();
  renderStatsScreen();
}

function hasDemoBackup() {
  return Boolean(localStorage.getItem(DEMO_BACKUP_KEY));
}

function isDemoMode() {
  return localStorage.getItem(DEMO_FLAG_KEY) === "true";
}

function saveDemoBackup() {
  if (hasDemoBackup()) return;
  const snapshot = {
    cards: state.cards,
    stats: state.stats,
    settings: state.settings,
  };
  localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify(snapshot));
}

function restoreDemoBackup() {
  const raw = localStorage.getItem(DEMO_BACKUP_KEY);
  if (!raw) return false;
  try {
    const snapshot = JSON.parse(raw);
    state.cards = snapshot.cards || {};
    state.stats = snapshot.stats || defaultStats();
    state.settings = snapshot.settings || defaultSettings();
    localStorage.removeItem(DEMO_BACKUP_KEY);
    localStorage.removeItem(DEMO_FLAG_KEY);
    saveCards();
    saveStats();
    saveSettings();
    return true;
  } catch (err) {
    console.warn("Failed to restore demo backup", err);
    return false;
  }
}

function buildDemoCards() {
  const cards = {};
  const templates = (state.templates || []).filter(
    (tpl) => tpl && tpl.active && tpl.id !== "plain_dictionary",
  );
  const verbs = state.verbs || [];
  if (templates.length === 0 || verbs.length === 0) return cards;

  const now = new Date();
  const stages = ["S1", "S2", "S3", "S4", "S5", "S6"];
  const maxCards = Math.min(140, verbs.length * 3);
  let created = 0;

  for (let v = 0; v < verbs.length && created < maxCards; v += 1) {
    const verb = verbs[v];
    for (let t = 0; t < 3 && created < maxCards; t += 1) {
      const tpl = templates[(v + t) % templates.length];
      const card = Core.createCard(verb.id, tpl.id, now);
      const stage = stages[created % stages.length];
      card.stage = stage;
      card.learning_step = null;
      const offset = (created % 7) - 2;
      card.due_at = addDays(now, offset).toISOString();
      card.success_count_total = 3 + (created % 6);
      card.failure_count_total =
        created % 11 === 0 ? 4 : created % 5 === 0 ? 2 : 0;
      if (card.failure_count_total >= 4) {
        card.is_leech = true;
      }
      cards[card.card_id] = card;
      created += 1;
    }
  }

  let retired = 0;
  Object.values(cards).forEach((card) => {
    if (retired >= 8) return;
    if (card.stage === "S5" || card.stage === "S6") {
      card.stage = "RETIRED";
      card.due_at = null;
      retired += 1;
    }
  });

  return cards;
}

function buildDemoStats(cards) {
  const stats = defaultStats();
  const now = new Date();
  const activityPattern = [12, 9, 14, 18, 7, 16, 11, 13, 10, 15, 8, 12, 17, 9];
  for (let i = 0; i < activityPattern.length; i += 1) {
    const day = addDays(now, -i);
    stats.dailyActivity[toDateKey(day)] = activityPattern[i];
  }

  const mistakeCards = [];
  Object.values(cards).forEach((card) => {
    if (!card || !card.failure_count_total) return;
    stats.mistakeCounts.cards[card.card_id] = card.failure_count_total;
    stats.mistakeCounts.templates[card.conjugation_id] =
      (stats.mistakeCounts.templates[card.conjugation_id] || 0) +
      card.failure_count_total;
    mistakeCards.push(card);
  });

  mistakeCards.slice(0, 20).forEach((card, idx) => {
    const ts = new Date(now.getTime() - idx * 90 * 60000).toISOString();
    stats.mistakeLog.push({
      cardId: card.card_id,
      verb_id: card.verb_id,
      conjugation_id: card.conjugation_id,
      ts,
    });
  });

  return stats;
}

function applyDemoData() {
  saveDemoBackup();
  const cards = buildDemoCards();
  const stats = buildDemoStats(cards);
  state.cards = cards;
  state.stats = stats;
  if (state.settings) {
    state.settings.lessonBank = Math.max(
      state.settings.dailyLessons || 10,
      (state.settings.dailyLessons || 10) * 4,
    );
    state.settings.lastUnlockAt = new Date(Date.now() - DAY_MS).toISOString();
  }
  localStorage.setItem(DEMO_FLAG_KEY, "true");
  saveCards();
  saveStats();
  saveSettings();
  applyLessonUnlocks(new Date());
  updateReviewSummary();
  updateLessonSummary();
  populateSettingsForm();
  renderStatsScreen();
}

function refreshAfterDemoChange() {
  reviewSession = null;
  lessonSession = null;
  lessonsActive = false;
  const reviewsSession = document.getElementById("reviews-session");
  const lessonsSession = document.getElementById("lessons-session");
  if (reviewsSession) reviewsSession.innerHTML = "";
  if (lessonsSession) lessonsSession.innerHTML = "";
  setActiveScreen("home");
}

function recordReviewAttempt({ verbId, templateId, correct }) {
  if (!state.stats) return;
  const now = new Date();
  const dayKey = toDateKey(now);
  state.stats.dailyActivity[dayKey] = (state.stats.dailyActivity[dayKey] || 0) + 1;

  if (!correct) {
    const cardId = Core.makeCardId(verbId, templateId);
    if (!state.stats.mistakeCounts) {
      state.stats.mistakeCounts = { cards: {}, templates: {} };
    }
    const counts = state.stats.mistakeCounts;
    counts.cards[cardId] = (counts.cards[cardId] || 0) + 1;
    counts.templates[templateId] = (counts.templates[templateId] || 0) + 1;
    state.stats.mistakeLog.unshift({
      cardId,
      verb_id: verbId,
      conjugation_id: templateId,
      ts: now.toISOString(),
    });
    if (state.stats.mistakeLog.length > 250) {
      state.stats.mistakeLog.length = 250;
    }
  }

  saveStats();
  if (currentScreen === "stats") {
    renderStatsScreen();
  }
  queueReminderRefresh();
}

function renderFormsList(container, selectedIds, onChange) {
  if (!container) return;
  container.innerHTML = "";
  const selected = new Set(selectedIds || []);
  const groups = getFormGroups();
  groups.forEach((group) => {
    const label = document.createElement("label");
    label.className = "form-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = group.id;
    const allSelected = group.templateIds.every((id) => selected.has(id));
    const anySelected = group.templateIds.some((id) => selected.has(id));
    checkbox.checked = allSelected;
    checkbox.indeterminate = anySelected && !allSelected;
    checkbox.addEventListener("change", () => {
      if (onChange) {
        const next = new Set(selected);
        if (checkbox.checked) {
          group.templateIds.forEach((id) => next.add(id));
        } else {
          group.templateIds.forEach((id) => next.delete(id));
        }
        onChange(Array.from(next));
      }
    });
    const text = document.createElement("span");
    text.textContent = group.label;
    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);
  });
}

function updateFormsWarnings() {
  const enabledCount = getEnabledFormIds().length;
  const customMode = isCustomContentMode();
  const message = customMode && enabledCount === 0
    ? "No conjugation forms enabled. Enable at least one to start lessons."
    : "";
  const settingsWarning = document.getElementById("settings-forms-warning");
  if (settingsWarning) {
    settingsWarning.textContent = message;
    settingsWarning.style.display = message ? "block" : "none";
  }
}

function setEnabledFormIds(ids) {
  state.settings.enabled_conjugation_forms = ids;
  saveSettings();
  renderEnabledFormsUI();
  updateLessonSummary();
  updateReviewSummary();
  updateFormsWarnings();
}

function setDrillFormIds(ids) {
  state.settings.drill_conjugation_forms = ids;
  state.drillForms = ids;
  saveSettings();
  renderDrillFormsUI();
  updateDrillControls();
}

function renderEnabledFormsUI() {
  const enabledIds = getEnabledFormIds();
  renderFormsList(document.getElementById("settings-forms-list"), enabledIds, setEnabledFormIds);
}

function renderDrillFormsUI() {
  const list = document.getElementById("drill-forms-list");
  if (!list) return;
  renderFormsList(list, state.drillForms, (next) => {
    setDrillFormIds(next);
  });
}

function getDrillFormIds() {
  return state.drillForms || [];
}

function updateDrillControls() {
  const warning = document.getElementById("drill-forms-warning");
  const startButton = document.getElementById("start-drill");
  const forms = getDrillFormIds();
  if (warning) {
    warning.textContent = forms.length === 0 ? "Select at least one form to start." : "";
    warning.style.display = forms.length === 0 ? "block" : "none";
  }
  if (startButton) {
    startButton.disabled = forms.length === 0;
  }
}

function updateReviewSummary() {
  let due = Core.buildDailyReviewQueue(Object.values(filterCardStore(state.cards)), new Date());
  const max = getMaxDailyReviews();
  if (max) {
    due = due.slice(0, max);
  }
  const homeCount = document.getElementById("home-reviews-count");
  const homeSub = document.getElementById("home-reviews-sub");
  const progress = document.getElementById("reviews-progress");
  const emptyState = document.getElementById("reviews-empty-state");
  const sessionContainer = document.getElementById("reviews-session");
  if (homeCount) {
    if (due.length === 0) {
      homeCount.textContent = "No reviews right now";
      homeCount.classList.add("empty");
    } else {
      homeCount.textContent = due.length;
      homeCount.classList.remove("empty");
    }
  }
  if (homeSub) {
    homeSub.textContent = due.length === 0 ? "You're caught up" : "reviews waiting";
  }
  const start = document.getElementById("start-reviews");
  if (due.length === 0) {
    if (start) start.disabled = true;
    if (progress) progress.style.display = "none";
    if (emptyState) emptyState.style.display = "grid";
    if (sessionContainer) sessionContainer.innerHTML = "";
    reviewSession = null;
  } else {
    if (start) start.disabled = false;
    if (progress) progress.style.display = "grid";
    if (emptyState) emptyState.style.display = "none";
  }
  if (currentScreen === "home" || currentScreen === "reviews") {
    updateHeaderForScreen(currentScreen);
  }
  if (currentScreen === "stats") {
    renderStatsScreen();
  }
}

function getLessonTemplates() {
  if (isCustomContentMode()) {
    return getEnabledTemplates();
  }
  return selectableTemplates().filter(isTemplateAllowedByLevel);
}

function countAvailableNew() {
  const templates = getLessonTemplates();
  const verbs = getLessonVerbPool();
  let count = 0;
  for (const verb of verbs) {
    for (const tpl of templates) {
      const cardId = Core.makeCardId(verb.id, tpl.id);
      if (!state.cards[cardId]) {
        count += 1;
      }
    }
  }
  return count;
}

function updateLessonSummary() {
  const availability = getLessonsAvailableCount();
  const homeCount = document.getElementById("home-lessons-count");
  const homeStart = document.getElementById("home-start-lessons");
  const templatesAvailable = getLessonTemplates().length;
  if (homeCount) {
    homeCount.textContent = templatesAvailable === 0 ? 0 : availability.availableToday;
  }
  if (homeStart) {
    homeStart.disabled = templatesAvailable === 0 || availability.availableToday === 0;
  }
  if (currentScreen === "home" || currentScreen === "lessons") {
    updateHeaderForScreen(currentScreen);
  }
  if (currentScreen === "stats") {
    renderStatsScreen();
  }
  queueReminderRefresh();
}

function getCurrentDueCount() {
  return Core.buildDailyReviewQueue(Object.values(filterCardStore(state.cards)), new Date()).length;
}

function buildReminderContext() {
  const availability = getLessonsAvailableCount();
  return {
    now: new Date().toISOString(),
    dueCount: getCurrentDueCount(),
    lessonsAvailable: availability.availableToday,
    unlockTime: state.settings.unlockTime || "",
  };
}

function renderReminderStatus(snapshot) {
  const statusEl = document.getElementById("settings-reminder-status");
  if (!statusEl) return;
  statusEl.textContent = Notifications.formatPlanSummary(snapshot, state.settings);
}

async function refreshReminderSchedule(reason) {
  if (!state.settings) return null;
  const snapshot = await Notifications.reschedule(state.settings, buildReminderContext());
  if (
    snapshot &&
    snapshot.permission &&
    snapshot.permission !== "unsupported" &&
    state.settings.reminders_permission !== snapshot.permission
  ) {
    state.settings.reminders_permission = snapshot.permission;
    saveSettings();
  }
  renderReminderStatus(snapshot);
  return snapshot;
}

function queueReminderRefresh(delayMs = 120) {
  if (reminderSyncTimer) {
    clearTimeout(reminderSyncTimer);
  }
  reminderSyncTimer = setTimeout(() => {
    refreshReminderSchedule("queued").catch((err) => {
      console.warn("Failed to refresh reminder schedule", err);
    });
  }, delayMs);
}

function updateDemoControls() {
  const status = document.getElementById("demo-status");
  const loadBtn = document.getElementById("demo-load");
  const restoreBtn = document.getElementById("demo-restore");
  const demoOn = isDemoMode();
  if (status) {
    status.textContent = demoOn
      ? "Demo data loaded. Restore real data to exit demo mode."
      : "";
  }
  if (restoreBtn) {
    restoreBtn.disabled = !demoOn || !hasDemoBackup();
  }
  if (loadBtn) {
    loadBtn.disabled = demoOn;
  }
}

function formatVerbLevel(level) {
  return level === "N5" ? "N5" : "N4";
}

function renderVerbBrowser() {
  const list = document.getElementById("verb-browser-list");
  const search = document.getElementById("verb-search");
  const levelNote = document.getElementById("verb-browser-level");
  const pageInfo = document.getElementById("verb-browser-page-info");
  const prevButton = document.getElementById("verb-browser-prev");
  const nextButton = document.getElementById("verb-browser-next");
  if (!list) return;

  const study = getStudyLevelSetting();
  if (levelNote) {
    levelNote.textContent = study === "N5" ? "Study level: N5 only" : "Study level: N5 + N4";
  }

  const query = (search && search.value ? search.value : "").trim().toLowerCase();
  const verbs = (state.verbs || []).filter(isVerbAllowedByLevel);
  const filtered = query
    ? verbs.filter((verb) => {
        const gloss = (verb.gloss_en || []).join(" ").toLowerCase();
        const kanji = (verb.kanji || "").toLowerCase();
        const kana = (verb.kana || "").toLowerCase();
        return (
          kana.includes(query) ||
          kanji.includes(query) ||
          gloss.includes(query)
        );
      })
    : verbs;

  const totalPages = Math.max(1, Math.ceil(filtered.length / VERB_BROWSER_PAGE_SIZE));
  if (verbBrowserPage > totalPages) {
    verbBrowserPage = totalPages;
  }
  if (verbBrowserPage < 1) {
    verbBrowserPage = 1;
  }
  const start = (verbBrowserPage - 1) * VERB_BROWSER_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + VERB_BROWSER_PAGE_SIZE);

  const rows = pageItems
    .map((verb) => {
      return `
        <div class="verb-row">
          <div class="verb-row-main">
            <div class="verb-row-kana">${verb.kana}</div>
            ${verb.kanji ? `<div class="verb-row-kanji">${verb.kanji}</div>` : ""}
            <div class="verb-row-gloss">${(verb.gloss_en || []).join(", ")}</div>
          </div>
          <div class="verb-row-meta">
            <span class="verb-level">${formatVerbLevel(verb.level)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  list.innerHTML =
    rows || `<div class="muted">No verbs match your search.</div>`;

  if (pageInfo) {
    if (filtered.length === 0) {
      pageInfo.textContent = "0 results";
    } else {
      pageInfo.textContent = `Page ${verbBrowserPage} of ${totalPages}`;
    }
  }
  if (prevButton) {
    prevButton.disabled = filtered.length === 0 || verbBrowserPage <= 1;
  }
  if (nextButton) {
    nextButton.disabled = filtered.length === 0 || verbBrowserPage >= totalPages;
  }
}

function lessonHintForClass(verbClass) {
  if (verbClass === "ichidan") return "Drop る + …";
  if (verbClass === "godan") return "Change ending + …";
  if (verbClass === "irregular") return "Special form";
  return "";
}

function getRuleDisplay(verb, templateId) {
  if (!verb || !templateId) return { classLabel: "", ruleHint: "" };
  const verbClass = verb.verb_class;
  if (!verbClass) return { classLabel: "", ruleHint: "" };

  const hints = state.ruleHints || {};
  const labels = (hints.display && hints.display.verb_class_labels) || {};
  const fallbackLabels = {
    godan: "Godan",
    ichidan: "Ichidan",
    irregular: "Irregular",
  };
  const classLabel =
    (labels[verbClass] || fallbackLabels[verbClass] || "").split(" ")[0].toUpperCase();
  const templateHints = (hints.templates && hints.templates[templateId]) || null;
  let ruleHint = "";

  if (templateHints && templateHints[verbClass]) {
    ruleHint = templateHints[verbClass];
    const overrides = Array.isArray(templateHints.overrides) ? templateHints.overrides : [];
    const override = overrides.find((item) => item.lemma_kana === verb.kana);
    if (override && override.hint) {
      ruleHint = override.hint;
    }
  } else {
    ruleHint = lessonHintForClass(verbClass);
  }

  return { classLabel, ruleHint };
}

function formatVerbTypeLabel(label) {
  if (!label) return "";
  return String(label)
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function getExampleSentence(verb, templateId, expected) {
  if (!verb || !templateId || !expected) return "";
  const verbClass = verb.verb_class;
  if (!verbClass) return "";
  const data = state.exampleSentences;
  const templates = data && data.templates ? data.templates : null;
  if (!templates) return "";
  const templateData = templates[templateId];
  if (!templateData || !templateData.by_verb_class) return "";
  const lexicon = (data && data.lexicon) || {};

  function hashStringToUint32(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  let list = templateData.by_verb_class[verbClass];
  const overrides = Array.isArray(templateData.overrides) ? templateData.overrides : [];
  const matchedOverride = overrides.find(
    (ov) =>
      ov &&
      Array.isArray(ov.verb_ids) &&
      ov.verb_ids.includes(verb.id)
  );
  if (matchedOverride && matchedOverride.disabled) return "";
  if (matchedOverride && Array.isArray(matchedOverride.examples)) {
    list = matchedOverride.examples;
  }

  if (!Array.isArray(list) || list.length === 0) return "";
  const key = `${verb.id}|${templateId}`;
  const idx = hashStringToUint32(key) % list.length;
  const item = list[idx];
  const text = item && typeof item.text === "string" ? item.text : "";
  if (!text) return "";
  const withVerb = text.split("{V}").join(expected);
  return withVerb.replace(/\{([A-Za-z0-9_]+)\}/g, (match, token) => {
    if (token === "V") return expected;
    const options = lexicon[token];
    if (!Array.isArray(options) || options.length === 0) return "";
    const tokenKey = `${key}|${token}`;
    const tokenIdx = hashStringToUint32(tokenKey) % options.length;
    return options[tokenIdx];
  });
}

function getLessonBreakdown(verb, templateId, expected) {
  if (!verb || !templateId || !expected) return "";
  const base = verb.kana;
  if (templateId === "polite_te_form") {
    const teForm = Core.conjugate(verb, "plain_te_form", state.exceptions);
    if (teForm && teForm !== expected) {
      return `${base} → ${teForm} → ${expected}`;
    }
  }
  if (base && expected && base !== expected) {
    return `${base} → ${expected}`;
  }
  return "";
}

function buildQueueFromCards(cards) {
  return filterCardsList(cards).map((card) => ({
    verb_id: card.verb_id,
    conjugation_id: card.conjugation_id,
  }));
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildDrillQueueFromPool(count, formIds) {
  const ids = (formIds || []).filter((id) => state.templatesById[id]);
  if (ids.length === 0) return [];
  const verbs = state.verbs || [];
  const pool = [];
  ids.forEach((templateId) => {
    verbs.forEach((verb) => {
      pool.push({ verb_id: verb.id, conjugation_id: templateId });
    });
  });
  if (pool.length === 0) return [];
  const shuffled = shuffle(pool);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function createSession(container, queueItems, options) {
  const session = {
    container,
    queue: [...queueItems],
    hintUsed: false,
    answered: false,
    mode: options && options.mode ? options.mode : "generic",
    totalCount: queueItems.length,
    completed: 0,
    progressById: {},
    lastResult: null,
  };
  renderSessionCard(session);
  return session;
}

function setDrillSetupVisible(visible) {
  const panel = document.getElementById("drill-setup");
  if (!panel) return;
  panel.classList.toggle("is-hidden", !visible);
}

function createLessonSession(container, lessonItems) {
  const session = {
    container,
    lessons: [...lessonItems],
    practiceQueue: [],
    phase: "lesson",
    lessonIndex: 0,
    practiceCompleted: 0,
  };
  lessonSession = session;
  renderLessonCard(session);
}

function getReviewsDueCount() {
  let due = Core.buildDailyReviewQueue(Object.values(filterCardStore(state.cards)), new Date());
  const max = getMaxDailyReviews();
  if (max) {
    due = due.slice(0, max);
  }
  return due.length;
}

function getLessonsAvailable() {
  const availability = getLessonsAvailableCount();
  return availability.availableToday;
}

function getLessonsHeaderSubtitle(session) {
  if (!session || !session.lessons || session.lessons.length === 0) return "";
  const total = session.lessons.length;
  if (session.phase === "lesson") {
    return `Lesson ${session.lessonIndex + 1} of ${total}`;
  }
  if (session.phase === "confirm") {
    return `Lesson ${total} of ${total}`;
  }
  if (session.phase === "practice") {
    const current = Math.min(session.practiceCompleted + 1, total);
    return `Lesson ${current} of ${total}`;
  }
  return "";
}

function getReviewsHeaderSubtitle(session) {
  if (!session || session.totalCount === 0) return "0 due now";
  if (session.queue.length === 0) return `${session.totalCount} of ${session.totalCount}`;
  const current = Math.min(session.completed + 1, session.totalCount);
  return `Review ${current} of ${session.totalCount}`;
}

function startReviewsSession() {
  setActiveScreen("reviews");
  let due = Core.buildDailyReviewQueue(Object.values(filterCardStore(state.cards)), new Date());
  const max = getMaxDailyReviews();
  if (max) {
    due = due.slice(0, max);
  }
  const queue = buildQueueFromCards(due);
  const container = document.getElementById("reviews-session");
  reviewSession = createSession(container, queue, { mode: "reviews" });
  updateHeaderForScreen("reviews");
}

function updateHeaderForScreen(screen) {
  const target = screen || currentScreen;
  if (target === "home") {
    const dueNow = getReviewsDueCount();
    const lessonsAvailable = getLessonsAvailable();
    const subtitle =
      dueNow > 0
        ? `${dueNow} reviews waiting`
        : lessonsAvailable > 0
          ? `${lessonsAvailable} new lessons available`
          : "All caught up";
    setHeader("Daily Practice", subtitle);
    return;
  }

  if (target === "lessons") {
    let subtitle = "";
    if (lessonSession && lessonsActive) {
      subtitle = getLessonsHeaderSubtitle(lessonSession);
    } else {
      const availability = getLessonsAvailableCount();
      if (availability.availableToday > 0) {
        subtitle = `${availability.availableToday} new lessons available`;
      } else {
        const nextUnlock = getNextUnlockTimeText(new Date());
        subtitle = nextUnlock ? `Next unlock at ${nextUnlock}` : "";
      }
    }
    setHeader("Today's Lessons", subtitle);
    return;
  }

  if (target === "reviews") {
    const subtitle =
      reviewSession && reviewSession.totalCount > 0
        ? getReviewsHeaderSubtitle(reviewSession)
        : `${getReviewsDueCount()} due now`;
    setHeader("Your Reviews", subtitle);
    return;
  }

  if (target === "settings") {
    setHeader("Settings", "");
    return;
  }

  if (target === "drill") {
    setHeader("Drill", "");
    return;
  }

  if (target === "weakness") {
    setHeader("Weakness", "");
    return;
  }

  if (target === "stats") {
    setHeader("Stats", "");
    return;
  }

  if (target === "verb-browser") {
    setHeader("Verb Browser", "");
    return;
  }
}

function buildQueueStatus() {
  const countsByDay = {};
  const cards = Object.values(filterCardStore(state.cards));
  const today = new Date();
  const todayKey = toDateKey(today);
  cards.forEach((card) => {
    if (!card || !card.due_at || card.stage === "RETIRED") return;
    const dueDate = new Date(card.due_at);
    const key = dueDate < new Date(`${todayKey}T00:00:00`) ? todayKey : toDateKey(dueDate);
    countsByDay[key] = (countsByDay[key] || 0) + 1;
  });

  const rows = [];
  let running = 0;
  for (let i = 0; i < 5; i += 1) {
    const day = addDays(today, i);
    const key = toDateKey(day);
    const newCount = countsByDay[key] || 0;
    running += newCount;
    rows.push({
      label: formatWeekday(day),
      newCount,
      total: running,
    });
  }
  return rows;
}

function computeStreaks(activity) {
  const keys = Object.keys(activity || {});
  if (keys.length === 0) return { current: 0, longest: 0 };
  const sorted = keys.sort();
  let longest = 0;
  let currentRun = 0;
  let prevDate = null;
  sorted.forEach((key) => {
    const count = activity[key] || 0;
    if (count <= 0) return;
    const date = new Date(`${key}T00:00:00`);
    if (prevDate) {
      const diff = Math.round((date.getTime() - prevDate.getTime()) / DAY_MS);
      if (diff === 1) {
        currentRun += 1;
      } else {
        currentRun = 1;
      }
    } else {
      currentRun = 1;
    }
    prevDate = date;
    longest = Math.max(longest, currentRun);
  });

  let current = 0;
  const todayKey = toDateKey(new Date());
  let cursor = new Date(`${todayKey}T00:00:00`);
  while (true) {
    const key = toDateKey(cursor);
    if ((activity[key] || 0) > 0) {
      current += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }
  return { current, longest };
}

const MISTAKE_MIN_ATTEMPTS = 4;
const MISTAKE_MIN_MISSES = 2;
const MISTAKE_FAIL_WEIGHT = 1.5;
const MISTAKE_ERROR_WEIGHT = 10;
const MISTAKE_LEECH_BONUS = 5;

function scoreMistake(card) {
  const success = card.success_count_total || 0;
  const failure = card.failure_count_total || 0;
  const attempts = success + failure;
  if (attempts < MISTAKE_MIN_ATTEMPTS) return null;
  if (failure < MISTAKE_MIN_MISSES) return null;
  const errorRate = attempts > 0 ? failure / attempts : 0;
  let score = failure * MISTAKE_FAIL_WEIGHT + errorRate * MISTAKE_ERROR_WEIGHT;
  if (card.is_leech) score += MISTAKE_LEECH_BONUS;
  return { score, failure, attempts };
}

function getTopMistakeCards(limit) {
  const cards = Object.values(filterCardStore(state.cards));
  const ranked = cards
    .map((card) => {
      const scored = scoreMistake(card);
      if (!scored) return null;
      return {
        cardId: card.card_id,
        count: scored.failure,
        score: scored.score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return ranked;
}

function getTopMistakePatterns(limit) {
  const cards = Object.values(filterCardStore(state.cards));
  const groupMap = {};
  FORM_GROUPS.forEach((group) => {
    group.templates.forEach((id) => {
      groupMap[id] = group.label;
    });
  });
  const aggregated = {};
  cards.forEach((card) => {
    const scored = scoreMistake(card);
    if (!scored) return;
    const templateId = card.conjugation_id;
    const label =
      groupMap[templateId] || (state.templatesById[templateId] || {}).label || templateId;
    if (!aggregated[label]) {
      aggregated[label] = { score: 0, count: 0 };
    }
    aggregated[label].score += scored.score;
    aggregated[label].count += scored.failure;
  });
  return Object.entries(aggregated)
    .map(([label, data]) => ({ label, count: data.count, score: data.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function getRecentMistakes(hours = 24) {
  const since = Date.now() - hours * 60 * 60 * 1000;
  const recent = (state.stats && state.stats.mistakeLog) || [];
  const aggregated = {};
  recent.forEach((entry) => {
    const ts = new Date(entry.ts).getTime();
    if (ts < since) return;
    const existing = aggregated[entry.cardId] || {
      count: 0,
      verb_id: entry.verb_id,
      conjugation_id: entry.conjugation_id,
      latest: ts,
    };
    existing.count += 1;
    if (ts > existing.latest) existing.latest = ts;
    aggregated[entry.cardId] = existing;
  });
  return Object.entries(aggregated)
    .map(([cardId, data]) => ({ cardId, ...data }))
    .sort((a, b) => b.latest - a.latest);
}

function simplifyTemplateLabel(label) {
  if (!label) return "";
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function buildRecentMistakeQueue(limit = 10) {
  const recent = getRecentMistakes(24);
  const items = [];
  recent.forEach((entry) => {
    if (items.length >= limit) return;
    items.push({ verb_id: entry.verb_id, conjugation_id: entry.conjugation_id });
  });
  return items;
}

function renderStatsScreen() {
  const content = document.getElementById("stats-content");
  if (!content) return;
  const sessionEl = document.getElementById("stats-session");
  if (sessionEl && !sessionEl.classList.contains("is-hidden")) {
    return;
  }
  content.classList.remove("is-hidden");

  const activity = (state.stats && state.stats.dailyActivity) || {};
  const streaks = computeStreaks(activity);
  const currentEl = document.getElementById("stats-current-streak");
  const longestEl = document.getElementById("stats-longest-streak");
  if (currentEl) currentEl.textContent = streaks.current;
  if (longestEl) longestEl.textContent = streaks.longest;

  const queueList = document.getElementById("stats-queue-list");
  if (queueList) {
    const rows = buildQueueStatus();
    const maxNew = Math.max(...rows.map((row) => row.newCount), 0);
    const peak = maxNew;
    const scaleMax =
      maxNew === 0 ? 1 : Math.max(15, Math.ceil(maxNew / 5) * 5 + 10);
    queueList.innerHTML = rows
      .map((row) => {
        const barWidth =
          row.newCount === 0
            ? 0
            : Math.max(8, Math.round((row.newCount / scaleMax) * 100));
        const classes = [
          "stats-queue-row",
          row.newCount === peak && peak > 0 ? "peak" : "",
          row.newCount === 0 ? "zero" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `
          <div class="${classes}">
            <span class="stats-queue-label">${row.label}</span>
            <div class="stats-queue-bar" style="--bar:${barWidth}%"></div>
            <span class="stats-queue-new">+${row.newCount}</span>
            <span class="stats-queue-total">${row.total}</span>
          </div>
        `;
      })
      .join("");
  }

    const topMisses = document.getElementById("stats-top-misses");
    if (topMisses) {
      const items = getTopMistakeCards(5);
      if (items.length === 0) {
        topMisses.innerHTML = `<div class="muted">No misses yet.</div>`;
      } else {
        topMisses.innerHTML = items
          .map((item) => {
            const { verbId, templateId } = parseCardId(item.cardId);
            const verb = state.verbsById[verbId];
            const template = state.templatesById[templateId];
            const label = verb ? verb.kanji || verb.kana : verbId;
            const pattern = template ? template.label : templateId;
            return `
              <div class="stats-item">
                <div class="stats-item-title">${label} &mdash; ${pattern}</div>
                <div class="stats-item-meta">${item.count} misses</div>
              </div>
            `;
          })
          .join("");
      }
    }

    const topPatterns = document.getElementById("stats-top-patterns");
    if (topPatterns) {
      const items = getTopMistakePatterns(5);
      if (items.length === 0) {
        topPatterns.innerHTML = `<div class="muted">No misses yet.</div>`;
      } else {
        topPatterns.innerHTML = items
          .map(
            (item) => `
            <div class="stats-item">
              <div class="stats-item-title">${item.label}</div>
              <div class="stats-item-meta">${item.count} misses</div>
            </div>
          `,
          )
          .join("");
      }
    }

  const stageBar = document.getElementById("stats-stage-bar");
  const stageList = document.getElementById("stats-stage-list");
  if (stageBar && stageList) {
    const counts = {
      Fresh: 0,
      "Warming up": 0,
      "Getting solid": 0,
      "Locked in": 0,
      "On autopilot": 0,
      Graduated: 0,
    };
    Object.values(state.cards).forEach((card) => {
      if (!card) return;
      const stage = card.stage;
      if (stage === "S1" || stage === "LEARNING") counts.Fresh += 1;
      else if (stage === "S2") counts["Warming up"] += 1;
      else if (stage === "S3") counts["Getting solid"] += 1;
      else if (stage === "S4") counts["Locked in"] += 1;
      else if (stage === "S5" || stage === "S6") counts["On autopilot"] += 1;
      else if (stage === "RETIRED") counts.Graduated += 1;
    });
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
    const colors = [
      "rgba(214, 162, 26, 0.35)",
      "rgba(214, 162, 26, 0.45)",
      "rgba(214, 162, 26, 0.55)",
      "rgba(47, 58, 74, 0.3)",
      "rgba(47, 58, 74, 0.45)",
      "rgba(47, 58, 74, 0.6)",
    ];
    stageBar.innerHTML = "";
    stageList.innerHTML = "";
    Object.entries(counts).forEach(([label, count], index) => {
      const seg = document.createElement("div");
      seg.className = "stats-stage-seg";
      seg.style.width = `${(count / total) * 100}%`;
      seg.style.background = colors[index % colors.length];
      stageBar.appendChild(seg);

      const row = document.createElement("div");
      row.className = "stats-stage-row";
      row.innerHTML = `<span>${label}</span><span>${count}</span>`;
      stageList.appendChild(row);
    });
  }

  const recentList = document.getElementById("stats-recent-mistakes");
    if (recentList) {
      const recent = getRecentMistakes(24);
      const displayCount = Math.min(10, recent.length);
      const visible = recent.slice(0, displayCount);
      if (visible.length === 0) {
        recentList.innerHTML = `<div class="muted">No mistakes in the last 24 hours.</div>`;
      } else {
        recentList.innerHTML = visible
          .map((entry) => {
            const verb = state.verbsById[entry.verb_id];
            const template = state.templatesById[entry.conjugation_id];
            const label = verb ? verb.kanji || verb.kana : entry.verb_id;
            const pattern = template ? simplifyTemplateLabel(template.label) : entry.conjugation_id;
            return `
              <div class="stats-item">
                <div class="stats-item-title">${label} &mdash; ${pattern}</div>
                <div class="stats-item-meta">${entry.count} misses &bull; ${timeAgo(
              entry.latest,
            )}</div>
              </div>
            `;
          })
          .join("");
      }
      const practiceBtn = document.getElementById("stats-practice-recent");
      if (practiceBtn) {
        practiceBtn.disabled = recent.length === 0;
      }
    }

  }

function renderSessionCard(session) {
  const container = session.container;
  container.innerHTML = "";
  const isReviewLike = Core.isReviewLikeMode
    ? Core.isReviewLikeMode(session.mode)
    : session.mode === "reviews" || session.mode === "focused";
  const isDrill = session.mode === "drill" || session.mode === "mistake";

  if (session.queue.length === 0) {
    let title = "Session complete";
    let body = "Great work. Your progress was saved.";
    let actionId = "";
    let actionLabel = "";
    if (session.mode === "reviews") {
      title = "All reviews complete";
      body = "You are caught up for now.";
    } else if (session.mode === "drill") {
      title = session.totalCount > 0 ? "Drill complete" : "No drill cards available";
      body =
        session.totalCount > 0
          ? "Nice work. You finished this drill set."
          : "Try selecting more conjugation forms or increasing study level.";
      actionId = "session-open-drill-setup";
      actionLabel = "Edit Drill Setup";
    } else if (session.mode === "weakness") {
      title = session.totalCount > 0 ? "Weakness session complete" : "No weakness items yet";
      body =
        session.totalCount > 0
          ? "You have finished this weakness session."
          : "Complete more reviews first to build weakness data.";
    } else if (session.mode === "mistake") {
      title = session.totalCount > 0 ? "Mistake practice complete" : "No recent mistakes";
      body =
        session.totalCount > 0
          ? "You finished reviewing your recent mistakes."
          : "No mistakes were logged in the last 24 hours.";
      actionId = "session-back-to-stats";
      actionLabel = "Back to Stats";
    }
    const done = document.createElement("div");
    done.className = "card";
    done.innerHTML = `<h3>${title}</h3><p>${body}</p>${
      actionId ? `<div class="actions"><button class="ghost" id="${actionId}">${actionLabel}</button></div>` : ""
    }`;
    container.appendChild(done);
    const drillSetupButton = done.querySelector("#session-open-drill-setup");
    if (drillSetupButton) {
      drillSetupButton.addEventListener("click", () => {
        setDrillSetupVisible(true);
      });
    }
    const statsBackButton = done.querySelector("#session-back-to-stats");
    if (statsBackButton) {
      statsBackButton.addEventListener("click", () => {
        setActiveScreen("stats");
      });
    }
    updateReviewSummary();
    if (session.mode === "reviews") {
      reviewSession = null;
      updateReviewProgress(session);
      updateHeaderForScreen("reviews");
    }
    if (session.mode === "drill") {
      setDrillSetupVisible(true);
    }
    if (session.mode === "mistake") {
      const statsContent = document.getElementById("stats-content");
      const statsSession = document.getElementById("stats-session");
      if (statsContent) statsContent.classList.remove("is-hidden");
      if (statsSession) statsSession.classList.add("is-hidden");
      renderStatsScreen();
    }
    saveCards();
    return;
  }

  if (session.mode === "reviews") {
    updateReviewProgress(session);
    updateHeaderForScreen("reviews");
  }

  const item = session.queue[0];
  const verb = state.verbsById[item.verb_id];
  const template = state.templatesById[item.conjugation_id];
  const expected = Core.conjugate(verb, template.id, state.exceptions);
  const verbDisplay = renderVerbDisplay(verb);
  const ruleDisplay = getRuleDisplay(verb, template.id);
  const showRulesInPrompt = false;
  const classLabel = showRulesInPrompt && ruleDisplay.classLabel
    ? `<span class="rule-label">${ruleDisplay.classLabel}</span>`
    : "";
  const ruleHint = showRulesInPrompt && ruleDisplay.ruleHint
    ? `<div class="rule-hint">${ruleDisplay.ruleHint}</div>`
    : "";
  const cardId = Core.makeCardId(verb.id, template.id);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="prompt-grid">
      <div class="tag">${template.label}</div>
      ${classLabel}
      <div class="prompt-kana">${verbDisplay}</div>
      <div class="prompt-gloss">${verb.gloss_en.join(", ")}</div>
      ${ruleHint}
    </div>
    <div class="actions">
      <div class="input-wrap">
        <input id="answer-input" type="text" placeholder="Type your answer..." />
        <span class="input-icon" aria-hidden="true"></span>
      </div>
      <button class="primary" id="check-answer">Check</button>
        <button class="primary" id="next-card" style="display:none">Next</button>
      </div>
    <div class="feedback" id="feedback" style="display:none"></div>
    <div class="answer-flash" id="answer-flash" aria-live="polite"></div>
    <button class="info-toggle" id="info-toggle" type="button" style="display:none">Show info</button>
  `;

  container.appendChild(card);

  const answerInput = card.querySelector("#answer-input");
  const checkButton = card.querySelector("#check-answer");
  const nextButton = card.querySelector("#next-card");
  const feedback = card.querySelector("#feedback");
  const answerFlash = card.querySelector("#answer-flash");
  const infoToggle = card.querySelector("#info-toggle");

  setupLiveKanaInput(answerInput);
  attachEnterHandler(answerInput, checkButton, nextButton);
  if (answerInput) {
    requestAnimationFrame(() => answerInput.focus());
  }

  checkButton.addEventListener("click", () => {
    const raw = answerInput.value;
    if (!isSubmitFormatValid(raw)) {
      flashInvalidFormat(answerInput);
      return;
    }
    const normalized = Core.normalizeAnswer(raw);
    const correct = normalized === expected;
    triggerHaptic(correct);
    flashInputFeedback(answerInput, correct);
    showAnswerFlash(answerFlash, correct);
    recordReviewAttempt({ verbId: verb.id, templateId: template.id, correct });
    session.answered = true;
    feedback.style.display = "block";
    session.lastResult = { item, cardId, correct };
    const detailLines = [];
    detailLines.push(`<div><strong>Answer:</strong> ${expected}</div>`);
    if (ruleDisplay.classLabel) {
      detailLines.push(`<div><strong>Verb Type:</strong> ${formatVerbTypeLabel(ruleDisplay.classLabel)}</div>`);
    }
    if (ruleDisplay.ruleHint) {
      detailLines.push(`<div><strong>Conjugation Rule:</strong> ${ruleDisplay.ruleHint}</div>`);
    }
    const exampleSentence = getExampleSentence(verb, template.id, expected);
    if (exampleSentence) {
      detailLines.push(`<div><strong>Example Sentence:</strong> ${exampleSentence}</div>`);
    }
    feedback.classList.toggle("success", correct);
    feedback.classList.toggle("error", !correct);
    feedback.innerHTML = `
      <div class="feedback-title">${correct ? "Correct!" : "Incorrect."}</div>
      <div class="feedback-details">${detailLines.join("")}</div>
    `;
    setInfoToggle(infoToggle, feedback, !correct);
    if (infoToggle) {
      infoToggle.onclick = () => {
        const open = !feedback.classList.contains("is-open");
        setInfoToggle(infoToggle, feedback, open);
      };
    }
    flashButtonFeedback(checkButton, nextButton, correct, "Next");
  });

  nextButton.addEventListener("click", () => {
    const result = session.lastResult;
    if (!result) return;

    const progress =
      session.progressById[cardId] || { scheduled: false, completed: false };

    if (isDrill) {
      if (result.correct) {
        session.completed += 1;
        session.queue.shift();
      } else {
        session.queue.shift();
        if (session.queue.length === 0) {
          session.queue.push(item);
        } else {
          const insertAt = Math.floor(Math.random() * session.queue.length) + 1;
          session.queue.splice(insertAt, 0, item);
        }
      }
    } else if (isReviewLike) {
      if (!progress.scheduled) {
        const cardRecord = ensureCard(verb.id, template.id);
        const update = Core.applyReviewResult(cardRecord, {
          correct: result.correct,
          hintUsed: session.hintUsed,
          now: new Date(),
        });
        state.cards[cardRecord.card_id] = update.card;
        progress.scheduled = true;
      }

      if (result.correct) {
        if (!progress.completed) {
          progress.completed = true;
          session.completed += 1;
        }
        session.queue.shift();
      } else {
        session.queue.shift();
        if (session.queue.length === 0) {
          session.queue.push(item);
        } else {
          const insertAt = Math.floor(Math.random() * session.queue.length) + 1;
          session.queue.splice(insertAt, 0, item);
        }
      }
    } else {
      const cardRecord = ensureCard(verb.id, template.id);
      const normalized = Core.normalizeAnswer(answerInput.value);
      const correct = normalized === expected;
      const update = Core.applyReviewResult(cardRecord, {
        correct,
        hintUsed: session.hintUsed,
        now: new Date(),
      });
      state.cards[cardRecord.card_id] = update.card;

      session.queue.shift();
      session.completed += 1;
      if (update.requeueAfter > 0) {
        const insertAt = Math.min(update.requeueAfter, session.queue.length);
        session.queue.splice(insertAt, 0, item);
      }
    }

    session.progressById[cardId] = progress;
    session.hintUsed = false;
    session.answered = false;
    session.lastResult = null;
    renderSessionCard(session);
  });
}

function updateReviewProgress(session) {
  const countEl = document.getElementById("review-progress-count");
  const percentEl = document.getElementById("review-progress-percent");
  const fillEl = document.getElementById("review-progress-fill");
  if (!countEl || !percentEl || !fillEl) return;
  const total = session.totalCount || 0;
  const completed = Math.min(session.completed || 0, total);
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  countEl.textContent = `${completed} / ${total}`;
  percentEl.textContent = `${percent}%`;
  fillEl.style.width = `${percent}%`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("is-hidden");
  setTimeout(() => {
    toast.classList.add("is-hidden");
  }, 2000);
}

function startLessonsFlow() {
  const availability = getLessonsAvailableCount();
  const count = availability.availableToday;
  const container = document.getElementById("lessons-session");
  if (!container) return;
  const templates = getLessonTemplates();
  const customMode = isCustomContentMode();

  if (customMode && templates.length === 0) {
    lessonsActive = false;
    lessonSession = null;
    container.innerHTML =
      `<div class="card"><strong>No lesson forms selected.</strong><br />` +
      `<span class="muted">Choose forms in Settings to start lessons.</span>` +
      `<div class="actions"><button class="ghost" id="lessons-forms-cta">Open Settings</button></div>` +
      `</div>`;
    const cta = container.querySelector("#lessons-forms-cta");
    if (cta) {
      cta.addEventListener("click", openStudyContentSettings);
    }
    updateHeaderForScreen("lessons");
    return;
  }

  const verbs = getLessonVerbPool();
  if (!customMode && templates.length === 0) {
    lessonsActive = false;
    lessonSession = null;
    container.innerHTML =
      `<div class="card"><strong>No lesson forms available for this study level.</strong><br />` +
      `<span class="muted">Adjust your study level in Settings.</span>` +
      `<div class="actions"><button class="ghost" id="lessons-forms-cta">Open Settings</button></div>` +
      `</div>`;
    const cta = container.querySelector("#lessons-forms-cta");
    if (cta) {
      cta.addEventListener("click", openStudyContentSettings);
    }
    updateHeaderForScreen("lessons");
    return;
  }

  if (count === 0) {
    lessonsActive = false;
    lessonSession = null;
    const nextTime = getNextUnlockTimeText(new Date());
    const message = nextTime
      ? `<strong>All lessons complete.</strong><br /><span class="muted">Next lessons unlock at ${nextTime}.</span>`
      : "<strong>All lessons complete.</strong>";
    container.innerHTML = `<div class="card">${message}</div>`;
    updateHeaderForScreen("lessons");
    return;
  }

  const candidates = [];
  for (const verb of verbs) {
    for (const tpl of templates) {
      const cardId = Core.makeCardId(verb.id, tpl.id);
      if (!state.cards[cardId]) {
        candidates.push({ verb_id: verb.id, conjugation_id: tpl.id });
      }
    }
  }
  const selected = shuffle(candidates).slice(0, Math.min(count, candidates.length));
  const queue = selected.map((item) => ({
    verb_id: item.verb_id,
    conjugation_id: item.conjugation_id,
  }));
  lessonsActive = true;
  createLessonSession(container, queue);
  updateHeaderForScreen("lessons");
}

function updateStudyContentModeUI() {
  const levelWrap = document.getElementById("settings-study-level-wrap");
  const studySelect = document.getElementById("settings-study-level");
  const formsSection = document.getElementById("settings-forms-section");
  const custom = isCustomContentMode();
  if (levelWrap) {
    levelWrap.classList.toggle("is-disabled", custom);
  }
  if (studySelect) {
    studySelect.disabled = custom;
  }
  if (formsSection) {
    formsSection.style.display = custom ? "grid" : "none";
  }
}

function populateSettingsForm() {
  const dailyInput = document.getElementById("settings-daily-lessons");
  const unlockTimeInput = document.getElementById("settings-unlock-time");
  const maxInput = document.getElementById("settings-max-reviews");
  const vibrationInput = document.getElementById("settings-vibration");
  const studySelect = document.getElementById("settings-study-level");
  const advancedContent = document.getElementById("settings-advanced-content");
  const remindersEnabledInput = document.getElementById("settings-reminders-enabled");
  const reminderTimeInput = document.getElementById("settings-reminder-time");
  const reminderLessonsInput = document.getElementById("settings-reminder-lessons");
  if (!dailyInput || !unlockTimeInput || !maxInput) return;
  dailyInput.value = state.settings.dailyLessons;
  unlockTimeInput.value = state.settings.unlockTime || "";
  maxInput.value = state.settings.maxDailyReviews || "";
  if (vibrationInput) {
    vibrationInput.checked = state.settings.vibration !== false;
  }
  if (studySelect) {
    studySelect.value = state.settings.study_level === "N5" ? "N5" : "N5_N4";
  }
  if (advancedContent) {
    advancedContent.checked = isCustomContentMode();
  }
  updateStudyContentModeUI();
  if (remindersEnabledInput) {
    remindersEnabledInput.checked = Boolean(state.settings.reminders_enabled);
  }
  if (reminderTimeInput) {
    reminderTimeInput.value = state.settings.reminders_reviews_time || "19:00";
  }
  if (reminderLessonsInput) {
    reminderLessonsInput.checked = state.settings.reminders_lessons_unlocked !== false;
  }
  renderReminderStatus(Notifications.getPlanSnapshot());
}

function renderLessonCard(session) {
  const container = session.container;
  container.innerHTML = "";

  if (session.lessons.length === 0) {
    lessonsActive = false;
    container.innerHTML = "";
    updateReviewSummary();
    updateLessonSummary();
    saveCards();
    return;
  }

  if (session.phase === "lesson") {
    const item = session.lessons[session.lessonIndex];
    const verb = state.verbsById[item.verb_id];
    const template = state.templatesById[item.conjugation_id];
    const expected = Core.conjugate(verb, template.id, state.exceptions);
    const verbDisplay = renderVerbDisplay(verb);
  const ruleDisplay = getRuleDisplay(verb, template.id);
  const classLabelText = ruleDisplay.classLabel || "";
  const ruleHintText = ruleDisplay.ruleHint || "";
  const exampleSentence = getExampleSentence(verb, template.id, expected);
  const card = document.createElement("div");
  card.className = "card lesson-card";
  card.innerHTML = `
      <div class="card-meta">
        <div class="tag">${template.label}</div>
      </div>
      <div class="lesson-main">
        <div class="lesson-answer">${verbDisplay} <span class="lesson-arrow">→</span> <span class="lesson-conjugated">${expected}</span></div>
        <div class="prompt-gloss">${verb.gloss_en.join(", ")}</div>
      </div>
      <div class="lesson-divider"></div>
      <div class="lesson-details">
        ${
          classLabelText
            ? `<div class="detail-line"><span>Verb Type:</span> ${formatVerbTypeLabel(classLabelText)}</div>`
            : ""
        }
        ${
          ruleHintText
            ? `<div class="detail-line"><span>Conjugation Rule:</span> ${ruleHintText}</div>`
            : ""
        }
        ${
          exampleSentence
            ? `<div class="detail-line"><span>Example Sentence:</span> ${exampleSentence}</div>`
            : ""
        }
      </div>
      <div class="actions lesson-actions">
        <button class="primary full-width" id="lesson-next">
          ${session.lessonIndex + 1 === session.lessons.length ? "Start Practice" : "Next Lesson"}
        </button>
      </div>
    `;
    container.appendChild(card);
    updateHeaderForScreen("lessons");
    const nextButton = card.querySelector("#lesson-next");
    nextButton.addEventListener("click", () => {
      if (session.lessonIndex + 1 === session.lessons.length) {
        session.phase = "confirm";
      } else {
        session.lessonIndex += 1;
      }
      renderLessonCard(session);
    });
    return;
  }

  if (session.phase === "confirm") {
    const card = document.createElement("div");
    card.className = "card lesson-card";
    card.innerHTML = `
      <div class="lesson-main">
        <div class="lesson-answer">Ready for the quiz?</div>
        <div class="prompt-gloss">You will review all new lessons you just learned.</div>
      </div>
      <div class="actions lesson-actions">
        <button class="primary full-width" id="lesson-start-quiz">Start Quiz</button>
      </div>
    `;
    container.appendChild(card);
    updateHeaderForScreen("lessons");
    const startButton = card.querySelector("#lesson-start-quiz");
    startButton.addEventListener("click", () => {
      session.phase = "practice";
      session.practiceQueue = session.lessons.slice();
      renderLessonCard(session);
    });
    return;
  }

  if (session.practiceQueue.length === 0) {
    lessonsActive = false;
    lessonSession = null;
    container.innerHTML = "";
    const nextTime = getNextUnlockTimeText(new Date());
    const message = nextTime
      ? `<strong>Great job!</strong><br /><span class="muted">Your next lessons will be ready at ${nextTime}.</span>`
      : "<strong>Great job!</strong>";
    container.innerHTML = `<div class="card lesson-card">${message}</div>`;
    updateHeaderForScreen("lessons");
    updateReviewSummary();
    updateLessonSummary();
    saveCards();
    return;
  }

  const item = session.practiceQueue[0];
  const verb = state.verbsById[item.verb_id];
  const template = state.templatesById[item.conjugation_id];
  const expected = Core.conjugate(verb, template.id, state.exceptions);
  const verbDisplay = renderVerbDisplay(verb);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="prompt-grid">
      <div class="tag">${template.label}</div>
      <div class="prompt-kana">${verbDisplay}</div>
      <div class="prompt-gloss">${verb.gloss_en.join(", ")}</div>
      <div class="muted">Type the ${template.label} of ${verb.kana}</div>
    </div>
    <div class="actions">
      <div class="input-wrap">
        <input id="answer-input" type="text" placeholder="Type your answer..." />
        <span class="input-icon" aria-hidden="true"></span>
      </div>
      <button class="primary" id="check-answer">Check</button>
      <button class="primary full-width" id="next-card" style="display:none">Next</button>
    </div>
    <div class="feedback" id="feedback" style="display:none"></div>
    <div class="answer-flash" id="answer-flash" aria-live="polite"></div>
    <button class="info-toggle" id="info-toggle" type="button" style="display:none">Show info</button>
  `;
  container.appendChild(card);
  updateHeaderForScreen("lessons");

  const answerInput = card.querySelector("#answer-input");
  const checkButton = card.querySelector("#check-answer");
  const nextButton = card.querySelector("#next-card");
  const feedback = card.querySelector("#feedback");
  const answerFlash = card.querySelector("#answer-flash");
  const infoToggle = card.querySelector("#info-toggle");

  if (nextButton) {
    nextButton.classList.add("primary", "full-width");
    nextButton.textContent = "Next";
  }

  const liveInput = setupLiveKanaInput(answerInput);
  attachEnterHandler(answerInput, checkButton, nextButton);
  let lastCorrect = false;
  if (answerInput) {
    requestAnimationFrame(() => answerInput.focus());
  }

  checkButton.addEventListener("click", () => {
    const raw = answerInput.value;
    if (!isSubmitFormatValid(raw)) {
      flashInvalidFormat(answerInput);
      return;
    }
    const normalized = Core.normalizeAnswer(raw);
    const correct = normalized === expected;
    triggerHaptic(correct);
    flashInputFeedback(answerInput, correct);
    showAnswerFlash(answerFlash, correct);
    recordReviewAttempt({ verbId: verb.id, templateId: template.id, correct });
    lastCorrect = correct;
    feedback.style.display = "block";
    const ruleDisplay = getRuleDisplay(verb, template.id);
    const classLabelText = ruleDisplay.classLabel || "";
    const ruleHintText = ruleDisplay.ruleHint || "";
    const exampleSentence = getExampleSentence(verb, template.id, expected);
    const detailLines = [];
    detailLines.push(`<div><strong>Answer:</strong> ${expected}</div>`);
    if (classLabelText) {
      detailLines.push(`<div><strong>Verb Type:</strong> ${formatVerbTypeLabel(classLabelText)}</div>`);
    }
    if (ruleHintText) detailLines.push(`<div><strong>Conjugation Rule:</strong> ${ruleHintText}</div>`);
    if (exampleSentence) detailLines.push(`<div><strong>Example Sentence:</strong> ${exampleSentence}</div>`);
    feedback.classList.toggle("success", correct);
    feedback.classList.toggle("error", !correct);
    feedback.innerHTML = `
      <div class="feedback-title">${correct ? "Correct!" : "Incorrect."}</div>
      <div class="feedback-details">${detailLines.join("")}</div>
    `;
    setInfoToggle(infoToggle, feedback, !correct);
    if (infoToggle) {
      infoToggle.onclick = () => {
        const open = !feedback.classList.contains("is-open");
        setInfoToggle(infoToggle, feedback, open);
      };
    }
    flashButtonFeedback(checkButton, nextButton, correct, "Next");
    if (!correct) {
      liveInput.reset();
    }
  });

  nextButton.addEventListener("click", () => {
    const now = new Date();
    const cardRecord = ensureCard(verb.id, template.id);
    const result = Core.applyReviewResult(cardRecord, {
      correct: lastCorrect,
      hintUsed: false,
      now,
    });
    result.card.stage = "S1";
    result.card.learning_step = null;
    result.card.due_at = addDays(now, 1).toISOString();
    state.cards[cardRecord.card_id] = result.card;
    decrementLessonBank(1);
    session.practiceCompleted += 1;
    session.practiceQueue.shift();
    renderLessonCard(session);
  });
}

function setupNav() {
  const buttons = document.querySelectorAll(".nav-item");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.screen;
      if (target === "reviews") {
        startReviewsSession();
        return;
      }
      setActiveScreen(target);
    });
  });
}

function setupActions() {
  document.getElementById("start-reviews").addEventListener("click", () => {
    startReviewsSession();
  });

  document.getElementById("start-drill").addEventListener("click", () => {
    const count = Number(document.getElementById("drill-count").value) || 10;
    const formIds = getDrillFormIds();
    if (formIds.length === 0) {
      updateDrillControls();
      return;
    }
    setDrillSetupVisible(false);
    const queue = buildDrillQueueFromPool(count, formIds);
    const container = document.getElementById("drill-session");
    createSession(container, queue, { mode: "drill" });
    updateHeaderForScreen("drill");
  });

  const drillSelectAll = document.getElementById("drill-select-all");
  const drillSelectNone = document.getElementById("drill-select-none");

  if (drillSelectAll) {
    drillSelectAll.addEventListener("click", () => {
      setDrillFormIds(selectableTemplates().map((tpl) => tpl.id));
    });
  }
  if (drillSelectNone) {
    drillSelectNone.addEventListener("click", () => {
      setDrillFormIds([]);
    });
  }

  const startLessonsButton = document.getElementById("home-start-lessons");
  if (startLessonsButton) {
    startLessonsButton.addEventListener("click", () => {
      setActiveScreen("lessons");
    });
  }

  document.getElementById("start-weakness").addEventListener("click", () => {
    const count = Number(document.getElementById("weakness-count").value) || 10;
    const cards = Core.buildWeaknessQueue(filterCardStore(state.cards), count);
    const queue = buildQueueFromCards(cards);
    const container = document.getElementById("weakness-session");
    createSession(container, queue, { mode: "weakness" });
    updateHeaderForScreen("weakness");
  });

  const saveSettingsButton = document.getElementById("save-settings");
    if (saveSettingsButton) {
      saveSettingsButton.addEventListener("click", async () => {
        const dailyInput = document.getElementById("settings-daily-lessons");
        const unlockTimeInput = document.getElementById("settings-unlock-time");
        const maxInput = document.getElementById("settings-max-reviews");
        const vibrationInput = document.getElementById("settings-vibration");
        const studySelect = document.getElementById("settings-study-level");
        const advancedContent = document.getElementById("settings-advanced-content");
        const remindersEnabledInput = document.getElementById("settings-reminders-enabled");
        const reminderTimeInput = document.getElementById("settings-reminder-time");
        const reminderLessonsInput = document.getElementById("settings-reminder-lessons");
        const feedback = document.getElementById("settings-feedback");
        if (!dailyInput || !unlockTimeInput || !maxInput) return;

      const daily = clampDailyLessons(dailyInput.value);
      const unlockTime = /^\d{2}:\d{2}$/.test((unlockTimeInput.value || "").trim())
        ? unlockTimeInput.value.trim()
        : "";
      const maxRaw = maxInput.value ? Number(maxInput.value) : null;
      const maxReviews = maxRaw && !isNaN(maxRaw) ? Math.max(1, Math.floor(maxRaw)) : null;
      const unlockChanged = unlockTime !== state.settings.unlockTime;

        state.settings.dailyLessons = daily;
        state.settings.unlockTime = unlockTime;
        state.settings.maxDailyReviews = maxReviews;
        if (vibrationInput) {
          state.settings.vibration = vibrationInput.checked;
        }
        if (studySelect) {
          state.settings.study_level = studySelect.value === "N5" ? "N5" : "N5_N4";
        }
        if (advancedContent) {
          state.settings.lesson_content_mode = advancedContent.checked ? "custom" : "level";
        }
        if (remindersEnabledInput) {
          state.settings.reminders_enabled = remindersEnabledInput.checked;
        }
        if (reminderTimeInput) {
          const timeValue = (reminderTimeInput.value || "").trim();
          state.settings.reminders_reviews_time = /^\d{2}:\d{2}$/.test(timeValue)
            ? timeValue
            : "19:00";
        }
        if (reminderLessonsInput) {
          state.settings.reminders_lessons_unlocked = reminderLessonsInput.checked;
        }
        if (unlockChanged) {
          state.settings.lastUnlockAt = null;
        }
        saveSettings();
        if (state.settings.reminders_enabled) {
          const permission = await Notifications.requestPermission();
          if (permission && permission !== "unsupported") {
            state.settings.reminders_permission = permission;
            saveSettings();
          }
        }
        applyLessonUnlocks(new Date());
      updateReviewSummary();
      updateLessonSummary();
      populateSettingsForm();
      await refreshReminderSchedule("settings-save");

      if (feedback) {
        feedback.textContent = "Settings saved.";
        setTimeout(() => {
          feedback.textContent = "";
        }, 2000);
      }
    });
  }

  const formsSelectAll = document.getElementById("forms-select-all");
  const formsSelectNone = document.getElementById("forms-select-none");
  const advancedContent = document.getElementById("settings-advanced-content");
  const openVerbBrowser = document.getElementById("open-verb-browser");
  const verbBrowserBack = document.getElementById("verb-browser-back");
  const verbSearch = document.getElementById("verb-search");
  const verbBrowserPrev = document.getElementById("verb-browser-prev");
  const verbBrowserNext = document.getElementById("verb-browser-next");

  if (advancedContent) {
    advancedContent.addEventListener("change", () => {
      state.settings.lesson_content_mode = advancedContent.checked ? "custom" : "level";
      updateStudyContentModeUI();
      updateFormsWarnings();
    });
  }
  if (formsSelectAll) {
    formsSelectAll.addEventListener("click", () => {
      setEnabledFormIds(selectableTemplates().map((tpl) => tpl.id));
    });
  }
  if (formsSelectNone) {
    formsSelectNone.addEventListener("click", () => {
      setEnabledFormIds([]);
    });
  }

    if (openVerbBrowser) {
      openVerbBrowser.addEventListener("click", () => {
        verbBrowserReturnScreen = currentScreen || "lessons";
        verbBrowserPage = 1;
        setActiveScreen("verb-browser");
      });
    }

    if (verbBrowserBack) {
      verbBrowserBack.addEventListener("click", () => {
        setActiveScreen(verbBrowserReturnScreen || "lessons");
      });
    }

    if (verbSearch) {
      verbSearch.addEventListener("input", () => {
        verbBrowserPage = 1;
        renderVerbBrowser();
      });
    }

    if (verbBrowserPrev) {
      verbBrowserPrev.addEventListener("click", () => {
        verbBrowserPage = Math.max(1, verbBrowserPage - 1);
        renderVerbBrowser();
      });
    }

    if (verbBrowserNext) {
      verbBrowserNext.addEventListener("click", () => {
        verbBrowserPage += 1;
        renderVerbBrowser();
      });
    }

  const resetModal = document.getElementById("reset-modal");
  const resetOpen = document.getElementById("reset-open");
  const step1 = document.getElementById("reset-step-1");
  const step2 = document.getElementById("reset-step-2");
  const step3 = document.getElementById("reset-step-3");
  const resetInput = document.getElementById("reset-confirm-input");
  const resetNext1 = document.getElementById("reset-next-1");
  const resetNext2 = document.getElementById("reset-next-2");
  const resetFinal = document.getElementById("reset-confirm-final");
  const resetCancel1 = document.getElementById("reset-cancel-1");
  const resetCancel2 = document.getElementById("reset-cancel-2");
  const resetCancel3 = document.getElementById("reset-cancel-3");

  function openResetModal() {
    if (!resetModal) return;
    resetModal.classList.remove("is-hidden");
    if (step1) step1.classList.remove("is-hidden");
    if (step2) step2.classList.add("is-hidden");
    if (step3) step3.classList.add("is-hidden");
    if (resetInput) resetInput.value = "";
    if (resetNext2) resetNext2.disabled = true;
  }

  function closeResetModal() {
    if (!resetModal) return;
    resetModal.classList.add("is-hidden");
  }

  function goToStep2() {
    if (step1) step1.classList.add("is-hidden");
    if (step2) step2.classList.remove("is-hidden");
    if (step3) step3.classList.add("is-hidden");
    if (resetInput) resetInput.focus();
  }

  function goToStep3() {
    if (step1) step1.classList.add("is-hidden");
    if (step2) step2.classList.add("is-hidden");
    if (step3) step3.classList.remove("is-hidden");
  }

  function performReset() {
    state.cards = {};
    saveCards();
    state.stats = defaultStats();
    saveStats();
    const statsContent = document.getElementById("stats-content");
    const statsSession = document.getElementById("stats-session");
    if (statsContent) statsContent.classList.remove("is-hidden");
    if (statsSession) statsSession.classList.add("is-hidden");
    if (state.settings) {
      state.settings.lessonBank = 0;
      state.settings.lastUnlockAt = null;
      saveSettings();
      applyLessonUnlocks(new Date());
    }
    lessonsActive = false;
    setLessonsView("setup");
    updateReviewSummary();
    updateLessonSummary();
    setActiveScreen("home");
    closeResetModal();
    showToast("Reset complete.");
  }

  if (resetOpen) {
    resetOpen.addEventListener("click", openResetModal);
  }
  if (resetCancel1) resetCancel1.addEventListener("click", closeResetModal);
  if (resetCancel2) resetCancel2.addEventListener("click", closeResetModal);
  if (resetCancel3) resetCancel3.addEventListener("click", closeResetModal);
  if (resetNext1) resetNext1.addEventListener("click", goToStep2);
  if (resetNext2) resetNext2.addEventListener("click", goToStep3);
  if (resetFinal) resetFinal.addEventListener("click", performReset);
    if (resetInput) {
      resetInput.addEventListener("input", () => {
        if (!resetNext2) return;
        resetNext2.disabled = resetInput.value.trim() !== "RESET";
      });
    }

    const demoLoad = document.getElementById("demo-load");
    const demoRestore = document.getElementById("demo-restore");

    if (demoLoad) {
      demoLoad.addEventListener("click", () => {
        const confirmed = window.confirm(
          "Load demo data? This will temporarily replace your current progress until you restore it.",
        );
        if (!confirmed) return;
        applyDemoData();
        refreshAfterDemoChange();
        updateDemoControls();
        showToast("Demo data loaded.");
      });
    }

    if (demoRestore) {
      demoRestore.addEventListener("click", () => {
        const restored = restoreDemoBackup();
        if (!restored) {
          showToast("No demo backup found.");
          return;
        }
        refreshAfterDemoChange();
        updateDemoControls();
        updateReviewSummary();
        updateLessonSummary();
        renderStatsScreen();
        showToast("Restored your data.");
      });
    }

    const backupExport = document.getElementById("backup-export");
    const backupImport = document.getElementById("backup-import");
    const backupFile = document.getElementById("backup-file");
    const backupStatus = document.getElementById("backup-status");

    if (backupExport) {
      backupExport.addEventListener("click", () => {
        const payload = buildBackupPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const date = new Date().toISOString().split("T")[0];
        link.download = `japanese-srs-backup-${date}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        if (backupStatus) {
          backupStatus.textContent = "Backup downloaded.";
          setTimeout(() => {
            backupStatus.textContent = "";
          }, 2000);
        }
      });
    }

    if (backupImport && backupFile) {
      backupImport.addEventListener("click", () => {
        backupFile.value = "";
        backupFile.click();
      });

      backupFile.addEventListener("change", async () => {
        const file = backupFile.files && backupFile.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          applyImportedData(parsed);
          refreshAfterDemoChange();
          updateDemoControls();
          updateReviewSummary();
          updateLessonSummary();
          renderStatsScreen();
          showToast("Backup imported.");
          if (backupStatus) {
            backupStatus.textContent = "Backup imported.";
            setTimeout(() => {
              backupStatus.textContent = "";
            }, 2000);
          }
        } catch (err) {
          console.warn("Failed to import backup", err);
          showToast("Import failed. Check file format.");
          if (backupStatus) {
            backupStatus.textContent = "Import failed. Check file format.";
            setTimeout(() => {
              backupStatus.textContent = "";
            }, 3000);
          }
        }
      });
    }

    const homeDrill = document.getElementById("home-open-drill");
    const homeWeakness = document.getElementById("home-open-weakness");
    const emptyDrill = document.getElementById("reviews-empty-drill");
  const emptyWeakness = document.getElementById("reviews-empty-weakness");
    const statsPractice = document.getElementById("stats-practice-recent");
    const statsPracticeWeakness = document.getElementById("stats-practice-weakness");

  if (homeDrill) {
    homeDrill.addEventListener("click", () => {
      setActiveScreen("drill");
    });
  }
  if (homeWeakness) {
    homeWeakness.addEventListener("click", () => {
      setActiveScreen("weakness");
    });
  }
  if (emptyDrill) {
    emptyDrill.addEventListener("click", () => {
      setActiveScreen("drill");
    });
  }
  if (emptyWeakness) {
    emptyWeakness.addEventListener("click", () => {
      setActiveScreen("weakness");
    });
  }

    if (statsPractice) {
      statsPractice.addEventListener("click", () => {
        const queue = buildRecentMistakeQueue(15);
        if (queue.length === 0) return;
      const content = document.getElementById("stats-content");
      const sessionEl = document.getElementById("stats-session");
      if (content) content.classList.add("is-hidden");
      if (sessionEl) {
        sessionEl.classList.remove("is-hidden");
        createSession(sessionEl, queue, { mode: "mistake" });
        }
      });
    }

    if (statsPracticeWeakness) {
      statsPracticeWeakness.addEventListener("click", () => {
        setActiveScreen("weakness");
      });
    }

}

async function init() {
  try {
    setStatus("Loading data...");
    state.cards = loadCards();
    state.verbs = await loadJsonl(DATA_PATHS.verbs);
    state.templates = await loadJson(DATA_PATHS.templates);
    state.exceptions = await loadJson(DATA_PATHS.exceptions);
    try {
      state.ruleHints = await loadJson(DATA_PATHS.ruleHints);
    } catch (err) {
      console.warn("Failed to load rule hints", err);
      state.ruleHints = null;
    }
    try {
      state.exampleSentences = await loadJson(DATA_PATHS.exampleSentences);
    } catch (err) {
      console.warn("Failed to load example sentences", err);
      state.exampleSentences = null;
    }
    try {
      const furiganaData = await loadJson(DATA_PATHS.furigana);
      state.furigana = furiganaData && furiganaData.entries ? furiganaData.entries : null;
    } catch (err) {
      console.warn("Failed to load furigana helper", err);
      state.furigana = null;
    }
    state.verbsById = Object.fromEntries(state.verbs.map((v) => [v.id, v]));
    state.templatesById = Object.fromEntries(state.templates.map((t) => [t.id, t]));
    state.settings = loadSettings();
    state.stats = loadStats();
    if (state.settings.lesson_content_mode !== "custom" && state.settings.lesson_content_mode !== "level") {
      const eligibleCount = selectableTemplates().length;
      const configured = Array.isArray(state.settings.enabled_conjugation_forms)
        ? state.settings.enabled_conjugation_forms.length
        : eligibleCount;
      const hasCustomSelection = configured > 0 && configured < eligibleCount;
      state.settings.lesson_content_mode = hasCustomSelection ? "custom" : "level";
    }
    const normalizedForms = getEnabledFormIds();
    state.settings.enabled_conjugation_forms = normalizedForms;
    const normalizedDrillForms = Core.normalizeEnabledForms
      ? Core.normalizeEnabledForms(state.templates, state.settings.drill_conjugation_forms)
      : normalizedForms.slice();
    state.settings.drill_conjugation_forms = normalizedDrillForms;
    saveSettings();
    applyLessonUnlocks(new Date());
    state.cards = filterCardStore(state.cards);
    saveCards();
    renderEnabledFormsUI();
    updateFormsWarnings();
    state.drillForms = normalizedDrillForms.slice();
    renderDrillFormsUI();
    updateDrillControls();
    updateReviewSummary();
      updateLessonSummary();
      populateSettingsForm();
      setupNav();
      setupActions();
    updateDemoControls();
    setLessonsView("setup");
    setActiveScreen("home");
    await refreshReminderSchedule("init");
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        queueReminderRefresh(80);
      }
    });
    window.addEventListener("focus", () => {
      queueReminderRefresh(80);
    });
    setStatus("");
    updateHeaderForScreen("home");
    renderStatsScreen();
  } catch (err) {
    console.error(err);
    setStatus("Load failed. Check console for details.");
  }
}

init();

