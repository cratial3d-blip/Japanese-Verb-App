(function attachNotifications(global) {
  const PLAN_KEY = "japanese_srs_notification_plan_v1";

  function hasBrowserNotifications() {
    return typeof global.Notification !== "undefined";
  }

  function getPermission() {
    if (!hasBrowserNotifications()) return "unsupported";
    return global.Notification.permission || "default";
  }

  function parseTimeString(value) {
    if (!value || typeof value !== "string") return null;
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return { hours, minutes };
  }

  function getNextOccurrence(time, now) {
    const next = new Date(now.getTime());
    next.setHours(time.hours, time.minutes, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  function formatNotificationTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString([], {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function hashPlan(plan) {
    return plan
      .map((item) => `${item.id}:${item.next_at}:${item.title}`)
      .join("|");
  }

  function persistPlanSnapshot(snapshot) {
    try {
      global.localStorage.setItem(PLAN_KEY, JSON.stringify(snapshot));
    } catch (err) {
      console.warn("Failed to persist notification plan snapshot", err);
    }
  }

  function buildPlan(settings, context) {
    const now = context && context.now ? new Date(context.now) : new Date();
    const dueCount = Math.max(0, Number(context && context.dueCount) || 0);
    const lessonCount = Math.max(0, Number(context && context.lessonsAvailable) || 0);
    const plan = [];

    if (!settings || !settings.reminders_enabled) {
      return plan;
    }

    const reviewsTime = parseTimeString(settings.reminders_reviews_time || "19:00");
    if (reviewsTime) {
      const next = getNextOccurrence(reviewsTime, now).toISOString();
      plan.push({
        id: "reviews_due",
        next_at: next,
        title: "Daily Reviews",
        body:
          dueCount > 0
            ? `${dueCount} review${dueCount === 1 ? "" : "s"} due now.`
            : "No reviews due right now.",
      });
    }

    if (settings.reminders_lessons_unlocked && settings.unlockTime) {
      const unlockTime = parseTimeString(settings.unlockTime);
      if (unlockTime) {
        const next = getNextOccurrence(unlockTime, now).toISOString();
        plan.push({
          id: "lessons_unlocked",
          next_at: next,
          title: "New Lessons",
          body:
            lessonCount > 0
              ? `${lessonCount} lesson${lessonCount === 1 ? "" : "s"} available.`
              : "Lessons have unlocked.",
        });
      }
    }

    return plan;
  }

  async function requestPermission() {
    if (!hasBrowserNotifications()) return "unsupported";
    try {
      const permission = await global.Notification.requestPermission();
      return permission || getPermission();
    } catch (err) {
      console.warn("Notification permission request failed", err);
      return getPermission();
    }
  }

  async function reschedule(settings, context) {
    const permission = getPermission();
    const plan = buildPlan(settings, context);
    const snapshot = {
      provider: "web_stub",
      updated_at: new Date().toISOString(),
      permission,
      plan_hash: hashPlan(plan),
      plan,
    };
    persistPlanSnapshot(snapshot);
    return snapshot;
  }

  function getPlanSnapshot() {
    try {
      const raw = global.localStorage.getItem(PLAN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn("Failed to parse notification plan snapshot", err);
      return null;
    }
  }

  function formatPlanSummary(snapshot, settings) {
    if (!snapshot) return "";
    if (snapshot.permission === "unsupported") {
      return "Notifications are not supported in this browser.";
    }
    if (!settings || !settings.reminders_enabled) {
      return "Reminders are off.";
    }
    if (snapshot.permission === "denied") {
      return "Notifications are blocked. Allow notifications in browser/device settings.";
    }
    if (snapshot.permission === "default") {
      return "Permission pending. Enable notifications to receive reminders.";
    }
    if (!Array.isArray(snapshot.plan) || snapshot.plan.length === 0) {
      return "No reminders scheduled.";
    }
    const labels = snapshot.plan.map((item) => {
      const label = item.id === "reviews_due" ? "Reviews" : "Lessons";
      return `${label}: ${formatNotificationTime(item.next_at)}`;
    });
    return `Scheduled: ${labels.join(" | ")}`;
  }

  global.JapaneseSrsNotifications = {
    getPermission,
    requestPermission,
    reschedule,
    getPlanSnapshot,
    formatPlanSummary,
  };
})(window);
