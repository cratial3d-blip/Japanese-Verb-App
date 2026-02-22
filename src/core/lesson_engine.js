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

  function asNumber(value, fallback) {
    const next = Number(value);
    return Number.isNaN(next) ? fallback : next;
  }

  function isValidIso(value) {
    if (!value || typeof value !== "string") return false;
    return !Number.isNaN(new Date(value).getTime());
  }

  function normalizePathState(pathState, nowIso) {
    const now = toIso(nowIso);
    const base = {
      stage_index: 0,
      stage_started_at: now,
      failed_gate_count: 0,
      hold_until: null,
      completed: false,
      lesson_session_count: 0,
      last_iku_session: 0,
      stabilization_until: null,
      relaxed_accuracy_mode: false,
    };
    const merged = { ...base, ...(pathState || {}) };
    if (!merged.stage_started_at) merged.stage_started_at = now;
    if (typeof merged.stage_index !== "number" || merged.stage_index < 0) merged.stage_index = 0;
    if (typeof merged.failed_gate_count !== "number" || merged.failed_gate_count < 0) {
      merged.failed_gate_count = 0;
    }
    if (typeof merged.lesson_session_count !== "number" || merged.lesson_session_count < 0) {
      merged.lesson_session_count = 0;
    }
    if (typeof merged.last_iku_session !== "number" || merged.last_iku_session < 0) {
      merged.last_iku_session = 0;
    }
    if (!isValidIso(merged.hold_until)) {
      merged.hold_until = null;
    }
    if (!isValidIso(merged.stabilization_until)) {
      merged.stabilization_until = null;
    }
    merged.completed = Boolean(merged.completed);
    merged.relaxed_accuracy_mode = Boolean(merged.relaxed_accuracy_mode);
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

  function mergeGateProfile(baseProfile, overrides) {
    const base = baseProfile || {};
    const next = overrides || {};
    const merged = { ...base, ...next };
    merged.min_accuracy_by_class = {
      ...(base.min_accuracy_by_class || {}),
      ...(next.min_accuracy_by_class || {}),
    };
    return merged;
  }

  function resolveGateProfile(pathConfig, stageIndex) {
    const base = clone(pathConfig && pathConfig.gates ? pathConfig.gates : {});
    const stageNumber = Math.max(1, Math.floor(stageIndex || 0) + 1);
    const bands = Array.isArray(pathConfig && pathConfig.gate_bands) ? pathConfig.gate_bands : [];
    let matchedBand = null;
    for (let i = 0; i < bands.length; i += 1) {
      const band = bands[i];
      if (!band || typeof band !== "object") continue;
      const minStage = Math.max(1, Math.floor(asNumber(band.min_stage, 1)));
      const maxStage = Math.max(minStage, Math.floor(asNumber(band.max_stage, minStage)));
      if (stageNumber >= minStage && stageNumber <= maxStage) {
        matchedBand = band;
        break;
      }
    }

    if (!matchedBand) {
      return {
        ...base,
        band_id: null,
      };
    }

    const overrides = matchedBand.gates || matchedBand.overrides || {};
    const merged = mergeGateProfile(base, overrides);
    merged.band_id = matchedBand.id || null;
    merged.band_label = matchedBand.label || null;
    merged.band_range = {
      min_stage: Math.max(1, Math.floor(asNumber(matchedBand.min_stage, 1))),
      max_stage: Math.max(1, Math.floor(asNumber(matchedBand.max_stage, 1))),
    };
    return merged;
  }

  function clampCounts(counts, dailyCount, options) {
    const out = { ...counts };
    const keys = Object.keys(out);
    const minByKey = (options && options.minByKey) || {};
    keys.forEach((key) => {
      out[key] = Math.max(0, Math.floor(out[key] || 0));
    });
    let total = keys.reduce((acc, key) => acc + out[key], 0);
    while (total > dailyCount) {
      let reduced = false;
      for (const key of ["previous", "recent", "weakness", "current"]) {
        if (total <= dailyCount) break;
        const floor = Math.max(0, Math.floor(minByKey[key] || 0));
        if (out[key] > floor) {
          out[key] -= 1;
          total -= 1;
          reduced = true;
        }
      }
      if (!reduced) {
        for (const key of ["weakness", "current", "previous", "recent"]) {
          if (total <= dailyCount) break;
          if (out[key] > 0) {
            out[key] -= 1;
            total -= 1;
          }
        }
      }
      if (total > dailyCount && keys.every((key) => out[key] <= 0)) break;
    }
    return out;
  }

  function deriveGateBoost(gateDiagnostics) {
    const out = {
      weaknessExtra: 0,
      classBias: {
        godan: 0,
        ichidan: 0,
        irregular: 0,
      },
    };
    const reasons = Array.isArray(gateDiagnostics && gateDiagnostics.failed_reasons)
      ? gateDiagnostics.failed_reasons
      : [];
    reasons.forEach((reason) => {
      if (reason === "min_accuracy") {
        out.weaknessExtra += 1;
      } else if (reason === "class_accuracy_godan") {
        out.weaknessExtra += 1;
        out.classBias.godan += 2;
      } else if (reason === "class_accuracy_ichidan") {
        out.weaknessExtra += 1;
        out.classBias.ichidan += 2;
      } else if (reason === "class_accuracy_irregular") {
        out.weaknessExtra += 1;
        out.classBias.irregular += 2;
      }
    });
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
    const currentStageTemplateCount = Array.isArray(input.currentStage && input.currentStage.template_ids)
      ? input.currentStage.template_ids.length
      : 0;
    const stageIsNarrow = currentStageTemplateCount <= 1;

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

    const gateBoost = deriveGateBoost(input.gateDiagnostics || null);
    const failBoost = pathState.failed_gate_count > 0 ? 1 : 0;
    counts.weakness = (counts.weakness || 0) + failBoost + gateBoost.weaknessExtra;

    const nowTs = new Date(toIso(input.nowIso)).getTime();
    const stabilizationActive =
      pathState.stabilization_until &&
      !Number.isNaN(new Date(pathState.stabilization_until).getTime()) &&
      nowTs < new Date(pathState.stabilization_until).getTime();
    if (stabilizationActive) {
      counts.weakness = (counts.weakness || 0) + 2;
    }

    const minByKey = {};
    if (pathType === "guided" && stageIsNarrow && daysInStage > 2) {
      const previousKey = Object.prototype.hasOwnProperty.call(counts, "recent") ? "recent" : "previous";
      minByKey[previousKey] = Math.ceil(dailyCount * 0.5);
    }

    const clamped = clampCounts(counts, dailyCount, { minByKey });
    return {
      daysInStage,
      unlockedStageCount,
      stageIsNarrow,
      stabilizationActive,
      boost: gateBoost,
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
    let state = normalizePathState(input.pathState, nowIso);
    const stages = Array.isArray(pathConfig.stages) ? pathConfig.stages : [];

    if (stages.length === 0) {
      return {
        pathState: { ...state, completed: true },
        advanced: false,
        completed: true,
        gate: { passed: true, reason: "no_stages", failed_reasons: [] },
      };
    }

    const stageIndex = Math.min(Math.max(0, state.stage_index), stages.length - 1);
    const currentStage = stages[stageIndex];
    const templateSet = new Set(currentStage.template_ids || []);
    const profile = resolveGateProfile(pathConfig, stageIndex);
    const minAnswered = Math.max(0, Number(profile.min_answered || 0));
    const minAccuracy = Math.max(0, Math.min(1, Number(profile.min_accuracy || 0)));
    const classThresholds = profile.min_accuracy_by_class || {};
    const holdDaysOnFail = Math.max(0, Number(profile.hold_days_on_fail || 0));
    const minDaysInStage = Math.max(0, Number(profile.min_days_in_stage || 0));
    const maxDaysInStage = Math.max(0, Number(profile.max_days_in_stage || 0));
    const stabilizationDaysOnStall = Math.max(1, Number(profile.stabilization_days_on_stall || 2));
    const relaxedAccuracyDelta = Math.max(0, Number(profile.relaxed_accuracy_delta || 0));
    const daysInStage = dayDiffInclusive(state.stage_started_at, nowIso);

    if (
      state.stabilization_until &&
      new Date(nowIso).getTime() >= new Date(state.stabilization_until).getTime()
    ) {
      state = {
        ...state,
        stabilization_until: null,
        relaxed_accuracy_mode: true,
      };
    }

    if (state.hold_until && new Date(nowIso).getTime() < new Date(state.hold_until).getTime()) {
      return {
        pathState: state,
        advanced: false,
        completed: false,
        gate: {
          passed: false,
          reason: "hold_active",
          failed_reasons: ["hold_active"],
          days_in_stage: daysInStage,
          failed_gate_count: state.failed_gate_count,
          profile,
          class_accuracy: {},
          answered: 0,
          accuracy: 0,
        },
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
      const verbClass = verbsById[card.verb_id] ? String(verbsById[card.verb_id].verb_class || "").toLowerCase() : "";
      if (byClass[verbClass]) {
        byClass[verbClass].success += attempts.success;
        byClass[verbClass].failure += attempts.failure;
      }
    });

    const answered = success + failure;
    const accuracy = answered > 0 ? success / answered : 0;
    const effectiveMinAccuracy = state.relaxed_accuracy_mode
      ? Math.max(0, minAccuracy - relaxedAccuracyDelta)
      : minAccuracy;
    const classAccuracy = {};
    const failedReasons = [];

    if (answered < minAnswered) {
      failedReasons.push("min_answered");
    }
    if (accuracy < effectiveMinAccuracy) {
      failedReasons.push("min_accuracy");
    }
    if (daysInStage < minDaysInStage) {
      failedReasons.push("min_days_in_stage");
    }

    Object.keys(classThresholds).forEach((verbClass) => {
      const threshold = Number(classThresholds[verbClass]);
      if (Number.isNaN(threshold)) return;
      const normalizedClass = String(verbClass || "").toLowerCase();
      const m = byClass[normalizedClass] || { success: 0, failure: 0 };
      const total = m.success + m.failure;
      const acc = total > 0 ? m.success / total : 0;
      classAccuracy[normalizedClass] = acc;
      if (total <= 0 || acc < threshold) {
        failedReasons.push(`class_accuracy_${normalizedClass}`);
      }
    });

    const passed = failedReasons.length === 0;

    if (passed) {
      if (stageIndex >= stages.length - 1) {
        return {
          pathState: {
            ...state,
            stage_index: stageIndex,
            completed: true,
            failed_gate_count: 0,
            hold_until: null,
            stabilization_until: null,
            relaxed_accuracy_mode: false,
          },
          advanced: false,
          completed: true,
          gate: {
            passed: true,
            reason: "passed",
            failed_reasons: [],
            answered,
            accuracy,
            class_accuracy: classAccuracy,
            days_in_stage: daysInStage,
            failed_gate_count: 0,
            profile,
          },
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
          stabilization_until: null,
          relaxed_accuracy_mode: false,
        },
        advanced: true,
        completed: false,
        gate: {
          passed: true,
          reason: "passed",
          failed_reasons: [],
          answered,
          accuracy,
          class_accuracy: classAccuracy,
          days_in_stage: daysInStage,
          failed_gate_count: 0,
          profile,
        },
      };
    }

    const gateHadEnoughAnswered = answered >= minAnswered;
    const nextFailed = gateHadEnoughAnswered ? state.failed_gate_count + 1 : state.failed_gate_count;
    const holdUntil =
      gateHadEnoughAnswered && holdDaysOnFail > 0 ? addDaysIso(nowIso, holdDaysOnFail) : state.hold_until || null;

    let stabilizationUntil = state.stabilization_until || null;
    if (
      maxDaysInStage > 0 &&
      daysInStage >= maxDaysInStage &&
      !stabilizationUntil &&
      !state.relaxed_accuracy_mode
    ) {
      stabilizationUntil = addDaysIso(nowIso, stabilizationDaysOnStall);
    }

    const nextState = {
      ...state,
      failed_gate_count: nextFailed,
      hold_until: holdUntil,
      completed: false,
      stabilization_until: stabilizationUntil,
      relaxed_accuracy_mode: state.relaxed_accuracy_mode,
    };

    return {
      pathState: nextState,
      advanced: false,
      completed: false,
      gate: {
        passed: false,
        reason: failedReasons[0] || "failed",
        failed_reasons: failedReasons,
        answered,
        accuracy,
        class_accuracy: classAccuracy,
        days_in_stage: daysInStage,
        failed_gate_count: nextFailed,
        profile,
      },
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

  function getVerbClassForItem(item, verbsById) {
    if (!item) return "";
    const verb = verbsById[item.verb_id];
    return String((verb && verb.verb_class) || "").toLowerCase();
  }

  function buildClassTargets(count, classBias) {
    const safeCount = Math.max(0, Math.floor(count || 0));
    if (safeCount === 0) return { godan: 0, ichidan: 0, irregular: 0 };
    const weights = {
      godan: 0.6,
      ichidan: 0.33,
      irregular: 0.07,
    };
    const bias = classBias || {};
    weights.godan += 0.08 * Math.max(0, asNumber(bias.godan, 0));
    weights.ichidan += 0.08 * Math.max(0, asNumber(bias.ichidan, 0));
    weights.irregular += 0.08 * Math.max(0, asNumber(bias.irregular, 0));
    const weightSum = weights.godan + weights.ichidan + weights.irregular;
    const raw = {
      godan: (safeCount * weights.godan) / weightSum,
      ichidan: (safeCount * weights.ichidan) / weightSum,
      irregular: (safeCount * weights.irregular) / weightSum,
    };
    const targets = {
      godan: Math.floor(raw.godan),
      ichidan: Math.floor(raw.ichidan),
      irregular: Math.floor(raw.irregular),
    };
    let remainder = safeCount - (targets.godan + targets.ichidan + targets.irregular);
    const order = ["godan", "ichidan", "irregular"].sort(
      (a, b) => (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a]))
    );
    for (let i = 0; i < order.length && remainder > 0; i += 1) {
      targets[order[i]] += 1;
      remainder -= 1;
    }
    return targets;
  }

  function pickWithClassTargets(queue, pool, count, recentVerbWindow, rng, verbsById, classBias) {
    const wanted = Math.max(0, Math.floor(count || 0));
    if (wanted <= 0) return [];
    const classPools = {
      godan: pool.filter((item) => getVerbClassForItem(item, verbsById) === "godan"),
      ichidan: pool.filter((item) => getVerbClassForItem(item, verbsById) === "ichidan"),
      irregular: pool.filter((item) => getVerbClassForItem(item, verbsById) === "irregular"),
    };
    const targets = buildClassTargets(wanted, classBias);
    const picked = [];

    ["godan", "ichidan", "irregular"].forEach((verbClass) => {
      if (targets[verbClass] <= 0) return;
      const subset = pickFromPool(queue, classPools[verbClass], targets[verbClass], recentVerbWindow, rng);
      subset.forEach((item) => picked.push(item));
    });

    if (picked.length < wanted) {
      const remainder = pickFromPool(queue, pool, wanted - picked.length, recentVerbWindow, rng);
      remainder.forEach((item) => picked.push(item));
    }
    return picked;
  }

  function pickWithClassBias(queue, pool, count, recentVerbWindow, rng, verbsById, classBias) {
    const wanted = Math.max(0, Math.floor(count || 0));
    if (wanted <= 0) return [];
    const bias = classBias || {};
    const picked = [];
    const orderedBias = ["irregular", "godan", "ichidan"]
      .map((verbClass) => ({
        verbClass,
        amount: Math.max(0, Math.floor(asNumber(bias[verbClass], 0))),
      }))
      .filter((entry) => entry.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    orderedBias.forEach((entry) => {
      if (picked.length >= wanted) return;
      const classPool = pool.filter((item) => getVerbClassForItem(item, verbsById) === entry.verbClass);
      const subset = pickFromPool(
        queue,
        classPool,
        Math.min(entry.amount, wanted - picked.length),
        recentVerbWindow,
        rng
      );
      subset.forEach((item) => picked.push(item));
    });

    if (picked.length < wanted) {
      const remainder = pickFromPool(queue, pool, wanted - picked.length, recentVerbWindow, rng);
      remainder.forEach((item) => picked.push(item));
    }
    return picked;
  }

  function getStageCurrentTemplateIds(pathConfig, currentStage, daysInStage) {
    const templateIds = Array.isArray(currentStage && currentStage.template_ids)
      ? currentStage.template_ids.slice()
      : [];
    if (!currentStage || !pathConfig || !pathConfig.stage_overrides) {
      return templateIds;
    }
    const overrides = pathConfig.stage_overrides[currentStage.id];
    if (!overrides || typeof overrides !== "object") {
      return templateIds;
    }
    const introTemplates = Array.isArray(overrides.intro_template_ids)
      ? overrides.intro_template_ids.filter((templateId) => templateIds.includes(templateId))
      : [];
    const unlockDay = Math.max(1, Math.floor(asNumber(overrides.subphase_unlock_day, 0)));
    if (introTemplates.length > 0 && unlockDay > 1 && daysInStage < unlockDay) {
      return introTemplates;
    }
    return templateIds;
  }

  function findVerbIdsByKana(verbsById, kana) {
    const ids = [];
    Object.keys(verbsById || {}).forEach((verbId) => {
      const verb = verbsById[verbId];
      if (verb && verb.kana === kana) {
        ids.push(verbId);
      }
    });
    return ids;
  }

  function selectCandidate(pool, queue, predicate, preferredTemplateIds, rng) {
    const templates = Array.isArray(preferredTemplateIds) ? preferredTemplateIds : [];
    const preferredSet = new Set(templates);
    const filtered = pool.filter((item) => {
      if (predicate && !predicate(item)) return false;
      if (queue.some((q) => q.verb_id === item.verb_id && q.conjugation_id === item.conjugation_id)) {
        return false;
      }
      return true;
    });
    if (filtered.length === 0) return null;
    const preferred = filtered.filter((item) => preferredSet.has(item.conjugation_id));
    const source = preferred.length > 0 ? preferred : filtered;
    return shuffle(source, rng)[0] || null;
  }

  function findReplaceIndexForQuota(queue, verbsById) {
    const sourceOrder = ["fallback", "previous", "recent", "weakness", "current"];
    for (let i = 0; i < sourceOrder.length; i += 1) {
      const source = sourceOrder[i];
      const index = queue.findIndex((item) => {
        const verbClass = getVerbClassForItem(item, verbsById);
        return verbClass !== "irregular" && (item.source_bucket || "fallback") === source;
      });
      if (index >= 0) return index;
    }
    return queue.findIndex((item) => getVerbClassForItem(item, verbsById) !== "irregular");
  }

  function ensureCardInQueue(queue, card, dailyCount, verbsById) {
    if (!card) return false;
    if (
      queue.some(
        (item) =>
          item.verb_id === card.verb_id && item.conjugation_id === card.conjugation_id
      )
    ) {
      return true;
    }
    if (queue.length < dailyCount) {
      queue.push(card);
      return true;
    }
    const replaceIndex = findReplaceIndexForQuota(queue, verbsById);
    if (replaceIndex < 0) return false;
    queue.splice(replaceIndex, 1, card);
    return true;
  }

  function countIrregular(queue, verbsById) {
    return queue.filter((item) => getVerbClassForItem(item, verbsById) === "irregular").length;
  }

  function enforceIrregularPolicy(input) {
    const policy = input.policy || null;
    const queue = input.queue || [];
    const dailyCount = Math.max(1, Math.floor(input.dailyCount || queue.length || 10));
    const unlockedSet = new Set(input.unlockedTemplateIds || []);
    const unseenPairs = Array.isArray(input.unseenPairs) ? input.unseenPairs : [];
    const verbsById = input.verbsById || {};
    const rng = input.rng;
    const pathState = normalizePathState(input.pathState || {}, input.nowIso);
    const currentTemplateIds = Array.isArray(input.currentTemplateIds) ? input.currentTemplateIds : [];

    const patch = {
      lesson_session_count: pathState.lesson_session_count + 1,
    };

    if (!policy || policy.enabled === false) {
      return { queue, pathStatePatch: patch, ikuInjected: false };
    }

    const irregularPool = unseenPairs
      .filter((item) => unlockedSet.has(item.conjugation_id))
      .filter((item) => getVerbClassForItem(item, verbsById) === "irregular")
      .map((item) => ({ ...item, source_bucket: "irregular_quota" }));
    const minIrregular = Math.max(0, Math.floor(asNumber(policy.min_per_session, 2)));
    const primaryKana = Array.isArray(policy.primary_kana) ? policy.primary_kana : ["する", "くる"];

    if (irregularPool.length > 0 && minIrregular > 0) {
      let irregularCount = countIrregular(queue, verbsById);
      for (let i = 0; i < primaryKana.length && irregularCount < minIrregular; i += 1) {
        const verbIds = findVerbIdsByKana(verbsById, primaryKana[i]);
        if (verbIds.length === 0) continue;
        const candidate = selectCandidate(
          irregularPool,
          queue,
          (item) => verbIds.includes(item.verb_id),
          currentTemplateIds,
          rng
        );
        if (ensureCardInQueue(queue, candidate, dailyCount, verbsById)) {
          irregularCount = countIrregular(queue, verbsById);
        }
      }
      while (irregularCount < minIrregular) {
        const candidate = selectCandidate(irregularPool, queue, null, currentTemplateIds, rng);
        if (!ensureCardInQueue(queue, candidate, dailyCount, verbsById)) {
          break;
        }
        irregularCount = countIrregular(queue, verbsById);
      }
    }

    const ikuSpecialTemplates = new Set(
      Array.isArray(policy.iku_special_templates) ? policy.iku_special_templates : []
    );
    const requiresIku = currentTemplateIds.some((templateId) => ikuSpecialTemplates.has(templateId));
    const ikuEverySessions = Math.max(1, Math.floor(asNumber(policy.iku_every_n_sessions, 2)));
    const sessionCount = patch.lesson_session_count;
    const lastIkuSession = Math.max(0, Math.floor(asNumber(pathState.last_iku_session, 0)));
    const ikuDue = requiresIku && sessionCount - lastIkuSession >= ikuEverySessions;
    let ikuInjected = false;

    if (ikuDue) {
      const ikuVerbIds = findVerbIdsByKana(verbsById, "いく");
      if (ikuVerbIds.length > 0) {
        const ikuPool = unseenPairs
          .filter((item) => unlockedSet.has(item.conjugation_id))
          .filter((item) => ikuVerbIds.includes(item.verb_id))
          .map((item) => ({ ...item, source_bucket: "iku_quota" }));
        const candidate = selectCandidate(
          ikuPool,
          queue,
          null,
          Array.from(ikuSpecialTemplates),
          rng
        );
        ikuInjected = ensureCardInQueue(queue, candidate, dailyCount, verbsById);
        if (ikuInjected) {
          patch.last_iku_session = sessionCount;
        }
      }
    }

    return {
      queue,
      pathStatePatch: patch,
      ikuInjected,
    };
  }

  function summarizeBucketCounts(queue) {
    const counts = {};
    queue.forEach((item) => {
      const key = item && item.source_bucket ? item.source_bucket : "fallback";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function buildLessonQueue(input) {
    const pathType = input.pathType || "guided";
    const pathConfig = input.pathConfig || {};
    const nowIso = toIso(input.nowIso);
    const pathState = normalizePathState(input.pathState, nowIso);
    const unseenPairs = Array.isArray(input.unseenPairs) ? input.unseenPairs : [];
    const dailyCount = Math.max(1, Math.floor(input.dailyCount || 10));
    const rng = input.rng;
    const verbsById = input.verbsById || {};

    const currentStage = getCurrentStage(pathConfig, pathState);
    const stageIndex = Math.max(0, Math.floor(pathState.stage_index || 0));
    const daysInStage = dayDiffInclusive(pathState.stage_started_at, nowIso);
    const currentTemplateIds = currentStage ? currentStage.template_ids || [] : [];
    const activeCurrentTemplateIds = getStageCurrentTemplateIds(pathConfig, currentStage, daysInStage);
    const unlockedTemplateIds = getUnlockedTemplateIds(pathConfig, pathState);
    const deferredCurrentTemplateIds = currentTemplateIds.filter(
      (templateId) => !activeCurrentTemplateIds.includes(templateId)
    );
    const effectiveUnlockedTemplateIds = unlockedTemplateIds.filter(
      (templateId) => !deferredCurrentTemplateIds.includes(templateId)
    );
    const previousTemplateIds = effectiveUnlockedTemplateIds.filter((tid) => !activeCurrentTemplateIds.includes(tid));
    const recentTemplateIds = getRecentTemplateIds(pathConfig, pathState, 5);

    const composition = computeCompositionWindow({
      pathType,
      pathConfig,
      pathState,
      dailyCount,
      nowIso,
      currentStage,
      gateDiagnostics: input.gateDiagnostics || null,
    });

    const weaknessBase = selectWeaknessTemplates({
      allowedTemplateIds: effectiveUnlockedTemplateIds,
      cardsById: input.cardsById || {},
      mistakeTemplateCounts: input.mistakeTemplateCounts || {},
      limit: 8,
    });
    const weaknessTemplateIds = applyConfusablePairBoost({
      baseTemplateIds: weaknessBase,
      confusablePairs: pathConfig.confusable_pairs || [],
      triggerErrors: pathConfig.confusion_pair_trigger_errors || 2,
      mistakeTemplateCounts: input.mistakeTemplateCounts || {},
      allowedTemplateIds: effectiveUnlockedTemplateIds,
    });

    const sourceForPrevious =
      pathType === "guided" && composition.unlockedStageCount >= ((pathConfig.windows || {}).mid_course_unlocked_forms || Number.MAX_SAFE_INTEGER)
        ? recentTemplateIds
        : previousTemplateIds;

    const queue = [];
    const recentVerbWindow = 5;
    const currentPool = unseenPairs
      .filter((item) => activeCurrentTemplateIds.includes(item.conjugation_id))
      .map((item) => ({ ...item, source_bucket: "current" }));
    const previousPool = unseenPairs
      .filter((item) => sourceForPrevious.includes(item.conjugation_id))
      .map((item) => ({ ...item, source_bucket: composition.counts.recent ? "recent" : "previous" }));
    const weaknessPool = unseenPairs
      .filter((item) => weaknessTemplateIds.includes(item.conjugation_id))
      .map((item) => ({ ...item, source_bucket: "weakness" }));
    const unlockedPool = unseenPairs
      .filter((item) => effectiveUnlockedTemplateIds.includes(item.conjugation_id))
      .map((item) => ({ ...item, source_bucket: "fallback" }));

    pickWithClassTargets(
      queue,
      currentPool,
      composition.counts.current || 0,
      recentVerbWindow,
      rng,
      verbsById,
      composition.boost.classBias
    );
    if (pathType === "guided" && composition.counts.recent) {
      pickWithClassBias(
        queue,
        previousPool,
        composition.counts.recent,
        recentVerbWindow,
        rng,
        verbsById,
        composition.boost.classBias
      );
    } else {
      pickWithClassBias(
        queue,
        previousPool,
        composition.counts.previous || 0,
        recentVerbWindow,
        rng,
        verbsById,
        composition.boost.classBias
      );
    }
    pickWithClassBias(
      queue,
      weaknessPool,
      composition.counts.weakness || 0,
      recentVerbWindow,
      rng,
      verbsById,
      composition.boost.classBias
    );

    if (queue.length < dailyCount) {
      pickFromPool(queue, unlockedPool, dailyCount - queue.length, recentVerbWindow, rng);
    }

    const irregularPolicyResult = enforceIrregularPolicy({
      policy: pathConfig.irregular_policy || null,
      queue,
      dailyCount,
      unseenPairs,
      unlockedTemplateIds: effectiveUnlockedTemplateIds,
      currentTemplateIds: activeCurrentTemplateIds,
      verbsById,
      pathState,
      nowIso,
      rng,
    });

    return {
      queue: irregularPolicyResult.queue.slice(0, dailyCount),
      pathStatePatch: irregularPolicyResult.pathStatePatch || null,
      details: {
        currentStageId: currentStage ? currentStage.id : null,
        currentStageIndex: stageIndex,
        currentTemplateIds,
        activeCurrentTemplateIds,
        unlockedTemplateIds: effectiveUnlockedTemplateIds,
        weaknessTemplateIds,
        composition,
        bucketCounts: summarizeBucketCounts(irregularPolicyResult.queue.slice(0, dailyCount)),
        irregularPolicy: {
          enabled: Boolean(pathConfig.irregular_policy && pathConfig.irregular_policy.enabled !== false),
          ikuInjected: Boolean(irregularPolicyResult.ikuInjected),
        },
      },
    };
  }

  return {
    normalizePathState,
    getCurrentStage,
    getUnlockedTemplateIds,
    getRecentTemplateIds,
    resolveGateProfile,
    computeCompositionWindow,
    selectWeaknessTemplates,
    applyConfusablePairBoost,
    evaluatePathAdvance,
    buildLessonQueue,
  };
});
