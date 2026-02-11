(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.JapaneseSrsLessonEngine = factory();
  }
})(typeof window !== "undefined" ? window : global, function () {
  function toIso(value) {
    if (!value) return new Date().toISOString();
    if (typeof value === "string") return value;
    return new Date(value).toISOString();
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function dayDiffInclusive(startIso, nowIso) {
    const start = new Date(startIso);
    const now = new Date(nowIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(now.getTime())) return 1;
    const diffMs = Math.max(0, now.getTime() - start.getTime());
    return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  }

  function normalizePathState(pathState, nowIso) {
    const now = toIso(nowIso);
    const base = {
      stage_index: 0,
      stage_started_at: now,
      failed_gate_count: 0,
      hold_until: null,
      completed: false,
    };
    const merged = { ...base, ...(pathState || {}) };
    if (!merged.stage_started_at) merged.stage_started_at = now;
    if (typeof merged.stage_index !== "number" || merged.stage_index < 0) merged.stage_index = 0;
    if (typeof merged.failed_gate_count !== "number" || merged.failed_gate_count < 0) {
      merged.failed_gate_count = 0;
    }
    if (
      merged.hold_until != null &&
      (typeof merged.hold_until !== "string" || Number.isNaN(new Date(merged.hold_until).getTime()))
    ) {
      merged.hold_until = null;
    }
    merged.completed = Boolean(merged.completed);
    return merged;
  }

  function getCurrentStage(pathConfig, pathState) {
    const stages = Array.isArray(pathConfig && pathConfig.stages) ? pathConfig.stages : [];
    if (stages.length === 0) return null;
    const idx = Math.min(Math.max(0, pathState.stage_index || 0), stages.length - 1);
    return stages[idx];
  }

  function getUnlockedTemplateIds(pathConfig, pathState) {
    const stages = Array.isArray(pathConfig && pathConfig.stages) ? pathConfig.stages : [];
    if (stages.length === 0) return [];
    const maxIdx = Math.min(Math.max(0, pathState.stage_index || 0), stages.length - 1);
    const out = [];
    for (let i = 0; i <= maxIdx; i += 1) {
      const stage = stages[i];
      const templateIds = Array.isArray(stage.template_ids) ? stage.template_ids : [];
      templateIds.forEach((tid) => {
        if (!out.includes(tid)) out.push(tid);
      });
    }
    return out;
  }

  function getRecentTemplateIds(pathConfig, pathState, stageWindow) {
    const stages = Array.isArray(pathConfig && pathConfig.stages) ? pathConfig.stages : [];
    if (stages.length === 0) return [];
    const maxIdx = Math.min(Math.max(0, pathState.stage_index || 0), stages.length - 1);
    const minIdx = Math.max(0, maxIdx - stageWindow + 1);
    const out = [];
    for (let i = minIdx; i <= maxIdx; i += 1) {
      const templateIds = Array.isArray(stages[i].template_ids) ? stages[i].template_ids : [];
      templateIds.forEach((tid) => {
        if (!out.includes(tid)) out.push(tid);
      });
    }
    return out;
  }

  function clampCounts(counts, dailyCount) {
    const out = { ...counts };
    const keys = Object.keys(out);
    keys.forEach((key) => {
      out[key] = Math.max(0, Math.floor(out[key] || 0));
    });
    let total = keys.reduce((acc, key) => acc + out[key], 0);
    while (total > dailyCount) {
      for (const key of ["previous", "recent", "weakness", "current"]) {
        if (total <= dailyCount) break;
        if (out[key] > 0) {
          out[key] -= 1;
          total -= 1;
        }
      }
    }
    return out;
  }

  function computeCompositionWindow(input) {
    const pathType = input.pathType || "guided";
    const pathConfig = input.pathConfig || {};
    const pathState = normalizePathState(input.pathState, input.nowIso);
    const dailyCount = Math.max(1, Math.floor(input.dailyCount || 10));
    const daysInStage = dayDiffInclusive(pathState.stage_started_at, toIso(input.nowIso));
    const windows = pathConfig.windows || {};
    const unlockedStageCount = Math.max(1, (pathState.stage_index || 0) + 1);

    let counts;
    if (
      pathType === "guided" &&
      unlockedStageCount >= (windows.mid_course_unlocked_forms || Number.MAX_SAFE_INTEGER)
    ) {
      counts = { ...(windows.counts_mid_course || { current: 2, recent: 5, weakness: 3 }) };
    } else if (daysInStage <= (windows.intro_days || 2)) {
      counts = { ...(windows.counts_intro || { current: 6, previous: 3, weakness: 1 }) };
    } else if (daysInStage <= (windows.consolidation_days || 6)) {
      counts = { ...(windows.counts_consolidation || { current: 4, previous: 4, weakness: 2 }) };
    } else {
      counts = { ...(windows.counts_maintenance || { current: 3, previous: 5, weakness: 2 }) };
    }

    const failBoost = pathState.failed_gate_count > 0 ? 1 : 0;
    if (failBoost > 0) {
      counts.weakness = (counts.weakness || 0) + failBoost;
    }

    const clamped = clampCounts(counts, dailyCount);
    return {
      daysInStage,
      unlockedStageCount,
      counts: clamped,
    };
  }

  function randomIndex(max, rng) {
    if (max <= 1) return 0;
    const value = typeof rng === "function" ? rng() : Math.random();
    return Math.floor(value * max);
  }

  function shuffle(list, rng) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = randomIndex(i + 1, rng);
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  function cardAttempts(card) {
    const success = Number(card && card.success_count_total) || 0;
    const failure = Number(card && card.failure_count_total) || 0;
    return { success, failure, total: success + failure };
  }

  function addDaysIso(iso, days) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return toIso();
    }
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }

  function selectWeaknessTemplates(input) {
    const allowed = new Set(input.allowedTemplateIds || []);
    const cardsById = input.cardsById || {};
    const mistakeTemplateCounts = input.mistakeTemplateCounts || {};
    const metrics = {};

    Object.keys(cardsById).forEach((cardId) => {
      const card = cardsById[cardId];
      const tid = card && card.conjugation_id;
      if (!tid || !allowed.has(tid)) return;
      const attempts = cardAttempts(card);
      if (!metrics[tid]) {
        metrics[tid] = { templateId: tid, success: 0, failure: 0, attempts: 0, score: 0 };
      }
      metrics[tid].success += attempts.success;
      metrics[tid].failure += attempts.failure;
      metrics[tid].attempts += attempts.total;
    });

    Object.keys(mistakeTemplateCounts).forEach((tid) => {
      if (!allowed.has(tid)) return;
      if (!metrics[tid]) {
        metrics[tid] = { templateId: tid, success: 0, failure: 0, attempts: 0, score: 0 };
      }
      metrics[tid].failure += Number(mistakeTemplateCounts[tid]) || 0;
      metrics[tid].attempts += Number(mistakeTemplateCounts[tid]) || 0;
    });

    const ranked = Object.values(metrics)
      .map((item) => {
        const accuracy = item.attempts > 0 ? item.success / item.attempts : 1;
        const missWeight = item.failure;
        const lowAccuracyWeight = Math.max(0, 1 - accuracy) * 10;
        return { ...item, score: missWeight + lowAccuracyWeight };
      })
      .sort((a, b) => b.score - a.score || b.failure - a.failure || a.templateId.localeCompare(b.templateId));

    const limit = Math.max(0, Math.floor(input.limit || 3));
    return ranked.slice(0, limit).map((item) => item.templateId);
  }

  function applyConfusablePairBoost(input) {
    const base = Array.isArray(input.baseTemplateIds) ? input.baseTemplateIds.slice() : [];
    const pairs = Array.isArray(input.confusablePairs) ? input.confusablePairs : [];
    const triggerErrors = Math.max(1, Math.floor(input.triggerErrors || 2));
    const mistakeTemplateCounts = input.mistakeTemplateCounts || {};
    const allowed = new Set(input.allowedTemplateIds || []);
    const boosted = new Set(base);

    pairs.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2) return;
      const first = pair[0];
      const second = pair[1];
      const firstErrors = Number(mistakeTemplateCounts[first] || 0);
      const secondErrors = Number(mistakeTemplateCounts[second] || 0);
      if (firstErrors >= triggerErrors && allowed.has(second)) boosted.add(second);
      if (secondErrors >= triggerErrors && allowed.has(first)) boosted.add(first);
    });

    return Array.from(boosted);
  }

  function evaluatePathAdvance(input) {
    const pathConfig = input.pathConfig || {};
    const cardsById = input.cardsById || {};
    const verbsById = input.verbsById || {};
    const nowIso = toIso(input.nowIso);
    const state = normalizePathState(input.pathState, nowIso);
    const stages = Array.isArray(pathConfig.stages) ? pathConfig.stages : [];

    if (stages.length === 0) {
      return {
        pathState: { ...state, completed: true },
        advanced: false,
        completed: true,
        gate: { passed: true, reason: "no_stages" },
      };
    }

    const stageIndex = Math.min(Math.max(0, state.stage_index), stages.length - 1);
    const currentStage = stages[stageIndex];
    const templateSet = new Set(currentStage.template_ids || []);
    const gates = pathConfig.gates || {};
    const minAnswered = Number(gates.min_answered || 0);
    const minAccuracy = Number(gates.min_accuracy || 0);
    const classThresholds = gates.min_accuracy_by_class || {};
    const holdDaysOnFail = Math.max(0, Number(gates.hold_days_on_fail || 0));

    if (state.hold_until && new Date(nowIso).getTime() < new Date(state.hold_until).getTime()) {
      return {
        pathState: state,
        advanced: false,
        completed: false,
        gate: { passed: false, reason: "hold_active" },
      };
    }

    let success = 0;
    let failure = 0;
    const byClass = {
      godan: { success: 0, failure: 0 },
      ichidan: { success: 0, failure: 0 },
      irregular: { success: 0, failure: 0 },
    };

    Object.keys(cardsById).forEach((cardId) => {
      const card = cardsById[cardId];
      if (!card || !templateSet.has(card.conjugation_id)) return;
      const attempts = cardAttempts(card);
      if (attempts.total <= 0) return;
      success += attempts.success;
      failure += attempts.failure;
      const verbClass = verbsById[card.verb_id] ? verbsById[card.verb_id].verb_class : "";
      if (byClass[verbClass]) {
        byClass[verbClass].success += attempts.success;
        byClass[verbClass].failure += attempts.failure;
      }
    });

    const answered = success + failure;
    const accuracy = answered > 0 ? success / answered : 0;
    let classPass = true;
    Object.keys(classThresholds).forEach((verbClass) => {
      const threshold = Number(classThresholds[verbClass]);
      if (Number.isNaN(threshold)) return;
      const m = byClass[verbClass] || { success: 0, failure: 0 };
      const total = m.success + m.failure;
      if (total <= 0) {
        classPass = false;
        return;
      }
      const acc = m.success / total;
      if (acc < threshold) classPass = false;
    });

    const passed = answered >= minAnswered && accuracy >= minAccuracy && classPass;

    if (passed) {
      if (stageIndex >= stages.length - 1) {
        return {
          pathState: {
            ...state,
            stage_index: stageIndex,
            completed: true,
            failed_gate_count: 0,
            hold_until: null,
          },
          advanced: false,
          completed: true,
          gate: { passed: true, answered, accuracy },
        };
      }
      return {
        pathState: {
          ...state,
          stage_index: stageIndex + 1,
          stage_started_at: nowIso,
          failed_gate_count: 0,
          hold_until: null,
          completed: false,
        },
        advanced: true,
        completed: false,
        gate: { passed: true, answered, accuracy },
      };
    }

    const nextFailed = answered >= minAnswered ? state.failed_gate_count + 1 : state.failed_gate_count;
    const holdUntil =
      answered >= minAnswered && holdDaysOnFail > 0 ? addDaysIso(nowIso, holdDaysOnFail) : state.hold_until || null;
    return {
      pathState: {
        ...state,
        failed_gate_count: nextFailed,
        hold_until: holdUntil,
        completed: false,
      },
      advanced: false,
      completed: false,
      gate: { passed: false, answered, accuracy },
    };
  }

  function pickFromPool(queue, pool, count, recentVerbWindow, rng) {
    const picked = [];
    const shuffled = shuffle(pool, rng);
    for (const item of shuffled) {
      if (picked.length >= count) break;
      const recent = queue.slice(-recentVerbWindow);
      const dup = recent.some((entry) => entry.verb_id === item.verb_id);
      if (dup) continue;
      if (queue.some((entry) => entry.verb_id === item.verb_id && entry.conjugation_id === item.conjugation_id)) {
        continue;
      }
      queue.push(item);
      picked.push(item);
    }
    return picked;
  }

  function buildLessonQueue(input) {
    const pathType = input.pathType || "guided";
    const pathConfig = input.pathConfig || {};
    const nowIso = toIso(input.nowIso);
    const pathState = normalizePathState(input.pathState, nowIso);
    const unseenPairs = Array.isArray(input.unseenPairs) ? input.unseenPairs : [];
    const dailyCount = Math.max(1, Math.floor(input.dailyCount || 10));
    const rng = input.rng;

    const currentStage = getCurrentStage(pathConfig, pathState);
    const currentTemplateIds = currentStage ? currentStage.template_ids || [] : [];
    const unlockedTemplateIds = getUnlockedTemplateIds(pathConfig, pathState);
    const previousTemplateIds = unlockedTemplateIds.filter((tid) => !currentTemplateIds.includes(tid));
    const recentTemplateIds = getRecentTemplateIds(pathConfig, pathState, 5);

    const composition = computeCompositionWindow({
      pathType,
      pathConfig,
      pathState,
      dailyCount,
      nowIso,
    });

    const weaknessBase = selectWeaknessTemplates({
      allowedTemplateIds: unlockedTemplateIds,
      cardsById: input.cardsById || {},
      mistakeTemplateCounts: input.mistakeTemplateCounts || {},
      limit: 8,
    });
    const weaknessTemplateIds = applyConfusablePairBoost({
      baseTemplateIds: weaknessBase,
      confusablePairs: pathConfig.confusable_pairs || [],
      triggerErrors: pathConfig.confusion_pair_trigger_errors || 2,
      mistakeTemplateCounts: input.mistakeTemplateCounts || {},
      allowedTemplateIds: unlockedTemplateIds,
    });

    const sourceForPrevious =
      pathType === "guided" && composition.unlockedStageCount >= ((pathConfig.windows || {}).mid_course_unlocked_forms || Number.MAX_SAFE_INTEGER)
        ? recentTemplateIds
        : previousTemplateIds;

    const queue = [];
    const recentVerbWindow = 5;
    const currentPool = unseenPairs.filter((item) => currentTemplateIds.includes(item.conjugation_id));
    const previousPool = unseenPairs.filter((item) => sourceForPrevious.includes(item.conjugation_id));
    const weaknessPool = unseenPairs.filter((item) => weaknessTemplateIds.includes(item.conjugation_id));
    const unlockedPool = unseenPairs.filter((item) => unlockedTemplateIds.includes(item.conjugation_id));

    pickFromPool(queue, currentPool, composition.counts.current || 0, recentVerbWindow, rng);
    if (pathType === "guided" && composition.counts.recent) {
      pickFromPool(queue, previousPool, composition.counts.recent, recentVerbWindow, rng);
    } else {
      pickFromPool(queue, previousPool, composition.counts.previous || 0, recentVerbWindow, rng);
    }
    pickFromPool(queue, weaknessPool, composition.counts.weakness || 0, recentVerbWindow, rng);

    if (queue.length < dailyCount) {
      pickFromPool(queue, unlockedPool, dailyCount - queue.length, recentVerbWindow, rng);
    }

    return {
      queue: queue.slice(0, dailyCount),
      details: {
        currentStageId: currentStage ? currentStage.id : null,
        currentTemplateIds,
        unlockedTemplateIds,
        weaknessTemplateIds,
        composition,
      },
    };
  }

  return {
    normalizePathState,
    getCurrentStage,
    getUnlockedTemplateIds,
    getRecentTemplateIds,
    computeCompositionWindow,
    selectWeaknessTemplates,
    applyConfusablePairBoost,
    evaluatePathAdvance,
    buildLessonQueue,
  };
});
