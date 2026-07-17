import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// pushManager.subscribe()/unsubscribe() rejecting used to throw out of an unhandled
// await in NotificationSettingsSection.handleToggle, permanently stuck on
// "กำลังทำรายการ..." since setBusy(false) was never reached. subscribeToPush/
// unsubscribeFromPush must always resolve to a normal result, never reject.

const originalNavigator = globalThis.navigator;
const originalNotification = (globalThis as unknown as { Notification?: unknown }).Notification;
const originalWindow = (globalThis as unknown as { window?: unknown }).window;
const originalPushManager = (globalThis as unknown as { PushManager?: unknown }).PushManager;
const originalFetch = globalThis.fetch;

function installBrowserGlobals(overrides: {
  requestPermission?: () => Promise<NotificationPermission>;
  getSubscription?: () => Promise<unknown>;
  subscribe?: () => Promise<unknown>;
  unsubscribe?: () => Promise<boolean>;
  readyPromise?: Promise<unknown>;
  fetchImpl?: typeof fetch;
}) {
  const pushManager = {
    getSubscription: overrides.getSubscription ?? (async () => null),
    subscribe: overrides.subscribe ?? (async () => ({ toJSON: () => ({ endpoint: "https://push.example/1", keys: {} }) })),
  };

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        ready: overrides.readyPromise ?? Promise.resolve({ pushManager }),
      },
    },
  });

  (globalThis as unknown as { Notification: unknown }).Notification = {
    permission: "default",
    requestPermission: overrides.requestPermission ?? (async () => "granted" as NotificationPermission),
  };

  // getPushSupportState() feature-detects via `"PushManager" in window` and bails out
  // with typeof window === "undefined" first — this test environment is Node, not
  // jsdom, so `window` doesn't exist unless stubbed here too.
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { PushManager: unknown }).PushManager = function () {};

  globalThis.fetch = overrides.fetchImpl
    ?? (vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch);
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
});

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  (globalThis as unknown as { Notification?: unknown }).Notification = originalNotification;
  (globalThis as unknown as { window?: unknown }).window = originalWindow;
  (globalThis as unknown as { PushManager?: unknown }).PushManager = originalPushManager;
  globalThis.fetch = originalFetch;
  vi.resetModules();
});

describe("subscribeToPush", () => {
  it("resolves ok:false instead of throwing when pushManager.subscribe() rejects", async () => {
    installBrowserGlobals({
      subscribe: async () => {
        throw new Error("NotAllowedError");
      },
    });
    const { subscribeToPush } = await import("@/lib/push/subscribeClient");

    const result = await subscribeToPush();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  it("resolves ok:false instead of throwing when Notification.requestPermission() rejects", async () => {
    installBrowserGlobals({
      requestPermission: async () => {
        throw new Error("blocked");
      },
    });
    const { subscribeToPush } = await import("@/lib/push/subscribeClient");

    const result = await subscribeToPush();
    expect(result.ok).toBe(false);
  });

  it("resolves ok:true on a normal successful subscribe", async () => {
    installBrowserGlobals({});
    const { subscribeToPush } = await import("@/lib/push/subscribeClient");

    const result = await subscribeToPush();
    expect(result.ok).toBe(true);
  });

  it("times out instead of hanging forever when serviceWorker.ready never settles", async () => {
    // The reported real-world bug: a silently-broken service worker (never
    // registers/activates/claims control) leaves navigator.serviceWorker.ready
    // permanently pending — neither resolving nor rejecting, so a plain try/catch
    // can't rescue it. Only a timeout can.
    vi.useFakeTimers();
    try {
      const neverSettles = new Promise(() => {});
      installBrowserGlobals({ readyPromise: neverSettles });
      const { subscribeToPush } = await import("@/lib/push/subscribeClient");

      const pending = subscribeToPush();
      await vi.advanceTimersByTimeAsync(9000);
      const result = await pending;

      expect(result.ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out instead of hanging forever when the subscribe API fetch() never settles", async () => {
    // Gap found after the serviceWorker.ready fix shipped and the toggle still hung:
    // the fetch("/api/push/subscribe", ...) call itself had no timeout at all, so a
    // dropped connection or a hung server request could still leave the button stuck.
    vi.useFakeTimers();
    try {
      const neverSettlingFetch = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ) as unknown as typeof fetch;
      installBrowserGlobals({ fetchImpl: neverSettlingFetch });
      const { subscribeToPush } = await import("@/lib/push/subscribeClient");

      const pending = subscribeToPush();
      await vi.advanceTimersByTimeAsync(9000);
      const result = await pending;

      expect(result.ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("unsubscribeFromPush", () => {
  it("resolves ok:false instead of throwing when subscription.unsubscribe() rejects", async () => {
    installBrowserGlobals({
      getSubscription: async () => ({
        endpoint: "https://push.example/1",
        unsubscribe: async () => {
          throw new Error("network error");
        },
      }),
    });
    const { unsubscribeFromPush } = await import("@/lib/push/subscribeClient");

    const result = await unsubscribeFromPush();
    expect(result.ok).toBe(false);
  });

  it("resolves ok:true when there is no active subscription", async () => {
    installBrowserGlobals({ getSubscription: async () => null });
    const { unsubscribeFromPush } = await import("@/lib/push/subscribeClient");

    const result = await unsubscribeFromPush();
    expect(result.ok).toBe(true);
  });
});
