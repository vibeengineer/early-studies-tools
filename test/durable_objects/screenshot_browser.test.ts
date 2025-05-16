import type { Browser as PuppeteerBrowser, Page as PuppeteerPage } from "@cloudflare/puppeteer";
import puppeteer from "@cloudflare/puppeteer"; // Import for type usage
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BrowserSession,
  ScreenshotBrowserDO,
} from "../../src/durable-objects/screenshot-browser"; // Adjusted path

// Mock @cloudflare/puppeteer
const mockPage = {
  setViewport: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-screenshot")),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  isConnected: vi.fn().mockReturnValue(true),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  wsEndpoint: vi.fn().mockReturnValue("ws://fake-endpoint"),
};

vi.mock("@cloudflare/puppeteer", () => ({
  default: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

// Mock DurableObjectState and Env
const mockStorage = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  getAlarm: vi.fn().mockResolvedValue(null),
  setAlarm: vi.fn().mockResolvedValue(undefined),
  deleteAlarm: vi.fn().mockResolvedValue(undefined),
  sync: vi.fn().mockResolvedValue(undefined),
  deleteAll: vi.fn().mockResolvedValue(undefined), // Added deleteAll
  getWebSockets: vi.fn().mockReturnValue([]), // Added getWebSockets
  setWebSocketAutoResponse: vi.fn(), // Added setWebSocketAutoResponse
  getTags: vi.fn().mockResolvedValue([]), // Added getTags
  setTags: vi.fn().mockResolvedValue(undefined), // Added setTags
  deleteTags: vi.fn().mockResolvedValue(undefined), // Added deleteTags
};

const mockState = {
  storage: mockStorage,
  id: {
    toString: () => "test-do-id",
    name: "test-do",
    equals: vi.fn((otherId) => otherId.toString() === "test-do-id"),
    fromName: vi.fn().mockReturnThis(),
  }, // Expanded id mock
  waitUntil: vi.fn(),
  blockConcurrencyWhile: vi.fn(async (callback) => callback()),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(), // Added removeEventListener
  acceptWebSocket: vi.fn(), // Added acceptWebSocket
  getWebSockets: vi.fn().mockReturnValue([]), // Added getWebSockets
  sendSignal: vi.fn(), // Added sendSignal
};

const mockEnv = {
  BROWSER: {} as Fetcher,
  // ... other env bindings
};

describe("ScreenshotBrowserDO", () => {
  let doInstance: ScreenshotBrowserDO;
  // @ts-ignore Accessing private member for test
  let internalSessionsMap: Map<string, BrowserSession>; // To directly manipulate sessions for testing

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.storage.getAlarm.mockResolvedValue(null);
    // @ts-ignore
    doInstance = new ScreenshotBrowserDO(
      mockState as unknown as DurableObjectState,
      mockEnv as Env
    );
    // @ts-ignore Accessing private member for test
    internalSessionsMap = doInstance.sessions;
  });

  describe("constructor", () => {
    it("should initialize an empty session map", () => {
      // @ts-ignore
      expect(doInstance.sessions.size).toBe(0);
    });

    it("should set an alarm if none exists", async () => {
      // blockConcurrencyWhile is called in constructor, ensure it resolves
      await mockState.blockConcurrencyWhile(async () => {}); // simulate its execution
      expect(mockState.storage.getAlarm).toHaveBeenCalled();
      expect(mockState.storage.setAlarm).toHaveBeenCalled();
    });

    it("should not set an alarm if one already exists", async () => {
      mockState.storage.getAlarm.mockResolvedValue(Date.now() + 10000);
      // @ts-ignore
      const newInstance = new ScreenshotBrowserDO(
        mockState as unknown as DurableObjectState,
        mockEnv as Env
      );
      // simulate blockConcurrencyWhile execution for the new instance
      await mockState.blockConcurrencyWhile(async () => {});
      // setAlarm for the newInstance should not have been called if getAlarm returned a value
      // We need to check the mock associated with *this specific call path* if mocks are shared across instances, or ensure mocks are reset/scoped.
      // For simplicity, assuming setAlarm is checked on the shared mock, it should not be called *again* for this setup.
      // The initial call in beforeEach would have happened. So we expect it to be called once from beforeEach, not again.
      expect(mockState.storage.setAlarm).toHaveBeenCalledTimes(1); // Only from the beforeEach setup, not this new instance
    });
  });

  describe("fetch handler", () => {
    it("should return 404 for unknown paths", async () => {
      const request = new Request("http://localhost/unknown");
      const response = await doInstance.fetch(request);
      expect(response.status).toBe(404);
    });

    it("should return 400 if targetUrl is missing for /screenshot", async () => {
      const request = new Request("http://localhost/screenshot");
      const response = await doInstance.fetch(request);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe("Missing target URL parameter");
    });

    // Test successful screenshot call
    it("should call _takeScreenshot and return image on success", async () => {
      const targetUrl = "https://example.com";
      const request = new Request(
        `http://localhost/screenshot?url=${encodeURIComponent(targetUrl)}`
      );
      const fakeImageBuffer = Buffer.from("fake-screenshot-data").buffer as ArrayBuffer;

      const takeScreenshotSpy = vi
        //biome-ignore lint/suspicious/noExplicitAny:
        .spyOn(doInstance as any, "_takeScreenshot")
        .mockResolvedValue(fakeImageBuffer);

      const response = await doInstance.fetch(request);

      expect(takeScreenshotSpy).toHaveBeenCalledWith(targetUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/png");
      const responseBuffer = await response.arrayBuffer();
      expect(responseBuffer).toEqual(fakeImageBuffer);

      takeScreenshotSpy.mockRestore();
    });

    it("should return 500 if screenshot capture fails", async () => {
      const targetUrl = "https://example.com/fail";
      const request = new Request(
        `http://localhost/screenshot?url=${encodeURIComponent(targetUrl)}`
      );
      const errorMessage = "Screenshot failed badly";

      const takeScreenshotSpy = vi
        //biome-ignore lint/suspicious/noExplicitAny:
        .spyOn(doInstance as any, "_takeScreenshot")
        .mockRejectedValue(new Error(errorMessage));

      const response = await doInstance.fetch(request);

      expect(takeScreenshotSpy).toHaveBeenCalledWith(targetUrl);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe(errorMessage);

      takeScreenshotSpy.mockRestore();
    });
  });

  describe("getAvailableSession", () => {
    it("should reuse an existing idle and connected session", async () => {
      const mockExistingBrowser1 = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        isConnected: vi.fn().mockReturnValue(true),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const sessionId1 = "existing-idle-session-1";
      const mockIdleSession1: BrowserSession = {
        id: sessionId1,
        browser: mockExistingBrowser1 as unknown as PuppeteerBrowser,
        status: "idle",
        lastUsed: Date.now() - 10000,
      };
      internalSessionsMap.set(sessionId1, mockIdleSession1);
      // @ts-ignore - Accessing private method for test
      const session = await doInstance.getAvailableSession();
      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionId1);
      if (mockIdleSession1.browser) {
        expect(mockIdleSession1.browser.isConnected).toHaveBeenCalled();
      }
      expect(session?.lastUsed).toBeGreaterThan(mockIdleSession1.lastUsed);
    });

    it("should launch a new session if under MAX_SESSIONS and no idle session available", async () => {
      internalSessionsMap.clear();
      const puppeteerLaunchSpy = vi.mocked(require("@cloudflare/puppeteer").default.launch);
      puppeteerLaunchSpy.mockResolvedValue(mockBrowser as unknown as PuppeteerBrowser);
      // @ts-ignore - Accessing private method for test
      const session = await doInstance.getAvailableSession();
      expect(session).not.toBeNull();
      if (session) {
        expect(puppeteerLaunchSpy).toHaveBeenCalled();
        expect(internalSessionsMap.size).toBe(1);
        const newSessionEntry = internalSessionsMap.get(session.id);
        expect(newSessionEntry).toBeDefined();
        expect(newSessionEntry?.status).toBe("idle");
        expect(newSessionEntry?.browser).toEqual(mockBrowser);
      } else {
        throw new Error("Test failed: session was unexpectedly null.");
      }
    });

    it("should wait and reuse a session if MAX_SESSIONS reached but one becomes idle", async () => {
      vi.useFakeTimers();
      internalSessionsMap.clear();
      // @ts-ignore - Accessing private member for test setup
      const maxSessions = doInstance.MAX_SESSIONS;
      const puppeteerLaunchSpy = vi.mocked(require("@cloudflare/puppeteer").default.launch);
      for (let i = 0; i < maxSessions; i++) {
        const busySessionId = `busy-session-${i}`;
        const mockBusyBrowser = {
          isConnected: vi.fn().mockReturnValue(true),
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn().mockResolvedValue(undefined),
        };
        internalSessionsMap.set(busySessionId, {
          id: busySessionId,
          browser: mockBusyBrowser as unknown as PuppeteerBrowser,
          status: "busy",
          lastUsed: Date.now(),
        });
      }
      const sessionToBecomeIdleId = "busy-session-0";
      setTimeout(() => {
        const sessionToModify = internalSessionsMap.get(sessionToBecomeIdleId);
        if (sessionToModify && sessionToModify.browser) {
          sessionToModify.status = "idle";
          sessionToModify.lastUsed = Date.now();
          // biome-ignore lint/style/noNonNullAssertion: Trusting test setup that isConnected is a mock fn
          const isConnectedMock = sessionToModify.browser.isConnected! as ReturnType<typeof vi.fn>;
          isConnectedMock.mockReturnValue(true);
        }
      }, 1000);
      // @ts-ignore - Accessing private method for test
      const promise = doInstance.getAvailableSession();
      await vi.advanceTimersByTimeAsync(1600);
      const session = await promise;
      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionToBecomeIdleId);
      expect(session?.status).toBe("idle");
      expect(puppeteerLaunchSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("should return null if all sessions remain busy after retries", async () => {
      vi.useFakeTimers();
      internalSessionsMap.clear();
      // @ts-ignore - Accessing private member for test setup
      const maxSessions = doInstance.MAX_SESSIONS;
      const puppeteerLaunchSpy = vi.mocked(require("@cloudflare/puppeteer").default.launch);
      for (let i = 0; i < maxSessions; i++) {
        const busySessionId = `busy-session-${i}`;
        const mockBusyBrowser = {
          isConnected: vi.fn().mockReturnValue(true),
          newPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn().mockResolvedValue(undefined),
        };
        internalSessionsMap.set(busySessionId, {
          id: busySessionId,
          browser: mockBusyBrowser as unknown as PuppeteerBrowser,
          status: "busy",
          lastUsed: Date.now(),
        });
      }
      // @ts-ignore - Accessing private method for test
      const promise = doInstance.getAvailableSession();
      await vi.advanceTimersByTimeAsync(5000);
      const session = await promise;
      expect(session).toBeNull();
      expect(puppeteerLaunchSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("should clean up a disconnected session and launch a new one if a slot opens up", async () => {
      internalSessionsMap.clear();
      // @ts-ignore - Spying on private method
      const cleanupSessionSpy = vi.spyOn(doInstance, "cleanupSession").mockResolvedValue(undefined);
      const puppeteerLaunchSpy = vi.mocked(require("@cloudflare/puppeteer").default.launch);
      puppeteerLaunchSpy.mockResolvedValue(mockBrowser as unknown as PuppeteerBrowser);

      const disconnectedSessionId = "disconnected-session";
      const mockDisconnectedBrowser = {
        newPage: vi.fn(),
        isConnected: vi.fn().mockReturnValue(false),
        close: vi.fn().mockResolvedValue(undefined),
      };
      internalSessionsMap.set(disconnectedSessionId, {
        id: disconnectedSessionId,
        browser: mockDisconnectedBrowser as unknown as PuppeteerBrowser,
        status: "idle",
        // @ts-ignore - Accessing private member for test setup
        lastUsed: Date.now() - (doInstance.SESSION_TTL_MS + 10000),
      });

      // @ts-ignore - Accessing private member for test setup
      expect(doInstance.MAX_SESSIONS).toBeGreaterThanOrEqual(1);

      // @ts-ignore - Accessing private method for test
      const session = await doInstance.getAvailableSession();

      expect(cleanupSessionSpy).toHaveBeenCalledWith(disconnectedSessionId, true);
      expect(internalSessionsMap.has(disconnectedSessionId)).toBe(false);
      expect(puppeteerLaunchSpy).toHaveBeenCalledTimes(1);
      expect(session).not.toBeNull();
      expect(session?.status).toBe("idle");
      expect(internalSessionsMap.size).toBe(1);

      cleanupSessionSpy.mockRestore();
    });
  });

  describe("_takeScreenshot", () => {
    let mockValidSession: BrowserSession;
    let puppeteerLaunchSpy: ReturnType<typeof vi.mocked<typeof puppeteer.launch>>;
    // @ts-ignore - Spying on private method
    let cleanupSessionSpy: ReturnType<typeof vi.spyOn>;
    // @ts-ignore - Spy for private method
    let getAvailableSessionSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.mocked(mockPage.setViewport).mockClear().mockResolvedValue(undefined);
      vi.mocked(mockPage.goto).mockClear().mockResolvedValue(undefined);
      vi.mocked(mockPage.screenshot)
        .mockClear()
        .mockResolvedValue(Buffer.from("fake-screenshot-data-for-take-screenshot"));
      vi.mocked(mockPage.close).mockClear().mockResolvedValue(undefined);

      vi.mocked(mockBrowser.newPage)
        .mockClear()
        .mockResolvedValue(mockPage as unknown as PuppeteerPage);
      vi.mocked(mockBrowser.isConnected).mockClear().mockReturnValue(true);
      vi.mocked(mockBrowser.close).mockClear().mockResolvedValue(undefined);

      puppeteerLaunchSpy = vi.mocked(puppeteer.launch, true);
      puppeteerLaunchSpy.mockClear();

      const browserInstance = mockBrowser as unknown as PuppeteerBrowser;
      mockValidSession = {
        id: "valid-session-for-screenshot",
        browser: browserInstance,
        status: "idle",
        lastUsed: Date.now() - 5000,
      };

      // @ts-ignore - Spying on private method
      cleanupSessionSpy = vi.spyOn(doInstance, "cleanupSession").mockResolvedValue(undefined);
      // @ts-ignore - Mocking getAvailableSession for _takeScreenshot tests
      getAvailableSessionSpy = vi
        .spyOn(doInstance as any, "getAvailableSession")
        .mockResolvedValue(mockValidSession);
    });

    afterEach(() => {
      cleanupSessionSpy?.mockRestore(); // Use optional chaining in case it wasn't set
      getAvailableSessionSpy?.mockRestore(); // Use optional chaining
    });

    it("should successfully take a screenshot", async () => {
      const targetUrl = "https://example.com/goodpage";
      // @ts-ignore - Calling private method
      const resultBuffer = await doInstance._takeScreenshot(targetUrl);

      expect(mockBrowser.newPage).toHaveBeenCalledTimes(1);
      expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 1920, height: 1080 });
      expect(mockPage.goto).toHaveBeenCalledWith(targetUrl, { waitUntil: "networkidle0" });
      expect(mockPage.screenshot).toHaveBeenCalledTimes(1);
      expect(mockPage.close).toHaveBeenCalledTimes(1);
      const expectedBuffer = Buffer.from("fake-screenshot-data-for-take-screenshot").buffer;
      expect(resultBuffer).toEqual(expectedBuffer);
      expect(mockValidSession.status).toBe("idle");
      expect(mockValidSession.lastUsed).toBeGreaterThan(mockValidSession.lastUsed - 1000);
      expect(puppeteerLaunchSpy).not.toHaveBeenCalled();
    });

    it("should handle errors during puppeteer operations (e.g., page.goto fails)", async () => {
      const targetUrl = "https://example.com/badpage";
      const gotoError = new Error("Failed to navigate to page");
      vi.mocked(mockPage.goto).mockRejectedValue(gotoError);

      await expect(
        // @ts-ignore - Calling private method
        doInstance._takeScreenshot(targetUrl)
      ).rejects.toThrow(gotoError);

      expect(mockBrowser.newPage).toHaveBeenCalledTimes(1);
      expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 1920, height: 1080 });
      expect(mockPage.goto).toHaveBeenCalledWith(targetUrl, { waitUntil: "networkidle0" });
      expect(mockPage.screenshot).not.toHaveBeenCalled();
      expect(mockPage.close).toHaveBeenCalledTimes(1);
      expect(mockValidSession.status).toBe("terminating");
      expect(cleanupSessionSpy).toHaveBeenCalledWith(mockValidSession.id, true);
    });
  });

  describe("launchNewSessionWithTimeout", () => {
    let puppeteerLaunchSpyL: ReturnType<typeof vi.mocked<typeof puppeteer.launch>>;

    beforeEach(() => {
      puppeteerLaunchSpyL = vi.mocked(puppeteer.launch, true);
      puppeteerLaunchSpyL.mockClear();
      internalSessionsMap.clear();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should successfully launch a new session and add it to the map", async () => {
      puppeteerLaunchSpyL.mockResolvedValue(mockBrowser as unknown as PuppeteerBrowser);
      const sessionId = "new-session-id";
      const session = await (doInstance as any).launchNewSessionWithTimeout(sessionId);
      expect(puppeteerLaunchSpyL).toHaveBeenCalledWith(mockEnv.BROWSER);
      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionId);
      expect(session?.status).toBe("idle");
      expect(session?.browser).toEqual(mockBrowser);
      expect(internalSessionsMap.has(sessionId)).toBe(true);
      expect(internalSessionsMap.get(sessionId)).toEqual(session);
    });

    it("should handle puppeteer.launch failure and not add session to map", async () => {
      const launchError = new Error("Puppeteer launch failed");
      puppeteerLaunchSpyL.mockRejectedValue(launchError);
      const sessionId = "failed-launch-id";
      await expect((doInstance as any).launchNewSessionWithTimeout(sessionId)).rejects.toThrow(
        launchError
      );
      expect(puppeteerLaunchSpyL).toHaveBeenCalledWith(mockEnv.BROWSER);
      expect(internalSessionsMap.has(sessionId)).toBe(false);
    });

    it("should timeout if puppeteer.launch takes too long", async () => {
      const sessionId = "timeout-launch-id";
      puppeteerLaunchSpyL.mockImplementation(() => new Promise(() => {}));
      const promise = (doInstance as any).launchNewSessionWithTimeout(sessionId);
      // @ts-ignore
      await vi.advanceTimersByTimeAsync(doInstance.LAUNCH_TIMEOUT_MS + 100);
      await expect(promise).rejects.toThrow(/Browser launch timed out/);
      const sessionEntry = internalSessionsMap.get(sessionId);
      expect(sessionEntry).toBeDefined();
      expect(sessionEntry?.status).toBe("failed");
    });
  });

  describe("cleanupSession", () => {
    let mockSessionToClean: BrowserSession;
    let closeSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      internalSessionsMap.clear();
      // @ts-ignore - Accessing private method for test
      vi.spyOn(doInstance, "cleanupSession").callThrough(); // Spy but ensure original is called

      closeSpy = vi.fn().mockResolvedValue(undefined);
      const browserInstance = {
        ...mockBrowser, // Spread existing mockBrowser properties
        close: closeSpy,
        isConnected: vi.fn().mockReturnValue(true), // Default to connected
      } as unknown as PuppeteerBrowser;

      mockSessionToClean = {
        id: "session-to-clean",
        browser: browserInstance,
        status: "idle",
        lastUsed: Date.now() - ((doInstance as any).SESSION_TTL_MS + 1000), // Ensure it's past TTL
      };
      internalSessionsMap.set(mockSessionToClean.id, mockSessionToClean);
    });

    it("should close browser and remove session if idle past TTL", async () => {
      // @ts-ignore - Calling private method
      await doInstance.cleanupSession(mockSessionToClean.id, false);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(internalSessionsMap.has(mockSessionToClean.id)).toBe(false);
    });

    it("should close browser and remove session if forced, even if not past TTL", async () => {
      mockSessionToClean.lastUsed = Date.now(); // Not past TTL
      internalSessionsMap.set(mockSessionToClean.id, mockSessionToClean);

      // @ts-ignore - Calling private method
      await doInstance.cleanupSession(mockSessionToClean.id, true); // Force = true
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(internalSessionsMap.has(mockSessionToClean.id)).toBe(false);
    });

    it("should remove session if status is terminating", async () => {
      mockSessionToClean.status = "terminating";
      internalSessionsMap.set(mockSessionToClean.id, mockSessionToClean);
      // @ts-ignore - Calling private method
      await doInstance.cleanupSession(mockSessionToClean.id, false);
      expect(closeSpy).toHaveBeenCalledTimes(1); // Should still attempt to close browser
      expect(internalSessionsMap.has(mockSessionToClean.id)).toBe(false);
    });

    it("should remove session if status is failed", async () => {
      mockSessionToClean.status = "failed";
      internalSessionsMap.set(mockSessionToClean.id, mockSessionToClean);
      // @ts-ignore - Calling private method
      await doInstance.cleanupSession(mockSessionToClean.id, false);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(internalSessionsMap.has(mockSessionToClean.id)).toBe(false);
    });

    it("should remove session if browser is disconnected", async () => {
      if (mockSessionToClean.browser) {
        vi.mocked(mockSessionToClean.browser.isConnected).mockReturnValue(false);
      }
      internalSessionsMap.set(mockSessionToClean.id, mockSessionToClean);
      // @ts-ignore - Calling private method
      await doInstance.cleanupSession(mockSessionToClean.id, false);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(internalSessionsMap.has(mockSessionToClean.id)).toBe(false);
    });

    it("should NOT clean up an idle session within TTL if not forced", async () => {
      mockSessionToClean.lastUsed = Date.now() - 1000; // Within TTL
      mockSessionToClean.status = "idle";
      internalSessionsMap.set(mockSessionToClean.id, mockSessionToClean);
      // @ts-ignore - Calling private method
      await doInstance.cleanupSession(mockSessionToClean.id, false);
      expect(closeSpy).not.toHaveBeenCalled();
      expect(internalSessionsMap.has(mockSessionToClean.id)).toBe(true);
    });

    it("should NOT clean up a busy session if not forced", async () => {
      mockSessionToClean.status = "busy";
      mockSessionToClean.lastUsed = Date.now() - ((doInstance as any).SESSION_TTL_MS + 1000); // Past TTL but busy
      internalSessionsMap.set(mockSessionToClean.id, mockSessionToClean);
      // @ts-ignore - Calling private method
      await doInstance.cleanupSession(mockSessionToClean.id, false);
      expect(closeSpy).not.toHaveBeenCalled();
      expect(internalSessionsMap.has(mockSessionToClean.id)).toBe(true);
    });

    it("should handle errors if browser.close fails", async () => {
      const closeError = new Error("Failed to close browser");
      closeSpy.mockRejectedValue(closeError);
      console.warn = vi.fn(); // Mock console.warn to check if it's called

      // @ts-ignore - Calling private method
      await doInstance.cleanupSession(mockSessionToClean.id, true); // Force cleanup

      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Error closing browser"),
        closeError
      );
      // Session should still be removed from tracking even if close fails
      expect(internalSessionsMap.has(mockSessionToClean.id)).toBe(false);
    });

    it("should do nothing if session not found", async () => {
      // @ts-ignore - Calling private method
      await doInstance.cleanupSession("non-existent-session-id", true);
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  describe("alarm", () => {
    let cleanupSessionSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      internalSessionsMap.clear();
      // @ts-ignore - Spying on private method
      cleanupSessionSpy = vi.spyOn(doInstance, "cleanupSession").mockResolvedValue(undefined);
      mockState.storage.setAlarm.mockClear(); // Clear setAlarm mock before each test
    });

    afterEach(() => {
      cleanupSessionSpy.mockRestore();
      vi.useRealTimers();
    });

    it("should call cleanupSession for each session and reschedule alarm", async () => {
      const session1Id = "session-alarm-1";
      const session2Id = "session-alarm-2";
      internalSessionsMap.set(session1Id, {
        id: session1Id,
        browser: null,
        status: "idle",
        lastUsed: Date.now(),
      });
      internalSessionsMap.set(session2Id, {
        id: session2Id,
        browser: null,
        status: "busy",
        lastUsed: Date.now(),
      });

      // @ts-ignore - Calling private method (which alarm is effectively)
      await doInstance.alarm();

      expect(cleanupSessionSpy).toHaveBeenCalledWith(session1Id);
      expect(cleanupSessionSpy).toHaveBeenCalledWith(session2Id);
      expect(cleanupSessionSpy).toHaveBeenCalledTimes(2);
      expect(mockState.storage.setAlarm).toHaveBeenCalledTimes(1);
      // Check that setAlarm was called with a time in the future
      const expectedAlarmTime = Date.now() + (doInstance as any).ALARM_INTERVAL_MS;
      expect(mockState.storage.setAlarm).toHaveBeenCalledWith(expect.any(Number));
      const actualAlarmTime = mockState.storage.setAlarm.mock.calls[0][0];
      expect(actualAlarmTime).toBeGreaterThanOrEqual(Date.now()); // It will be slightly greater due to execution time
      expect(actualAlarmTime).toBeLessThanOrEqual(expectedAlarmTime + 100); // Allow small delta for execution
    });

    it("should correctly pass through calls from alarm to cleanupSession (integration detail)", async () => {
      // This test relies on cleanupSession's internal logic, which is already tested separately.
      // Here we just ensure alarm iterates and calls cleanup.
      const pastTTL = Date.now() - ((doInstance as any).SESSION_TTL_MS + 1000);
      const withinTTL = Date.now() - 1000;

      const sessionPastTTL: BrowserSession = {
        id: "s1",
        browser: mockBrowser as any,
        status: "idle",
        lastUsed: pastTTL,
      };
      const sessionWithinTTL: BrowserSession = {
        id: "s2",
        browser: mockBrowser as any,
        status: "idle",
        lastUsed: withinTTL,
      };
      const sessionBusy: BrowserSession = {
        id: "s3",
        browser: mockBrowser as any,
        status: "busy",
        lastUsed: pastTTL,
      };

      internalSessionsMap.set(sessionPastTTL.id, sessionPastTTL);
      internalSessionsMap.set(sessionWithinTTL.id, sessionWithinTTL);
      internalSessionsMap.set(sessionBusy.id, sessionBusy);

      // Restore original cleanupSession to test the full flow via alarm
      cleanupSessionSpy.mockRestore();
      // @ts-ignore - Spy on the actual instance method again, but allow it to run
      const realCleanupSpy = vi.spyOn(doInstance, "cleanupSession").callThrough();

      // @ts-ignore
      await doInstance.alarm();

      expect(realCleanupSpy).toHaveBeenCalledWith(sessionPastTTL.id); // Should be cleaned
      expect(realCleanupSpy).toHaveBeenCalledWith(sessionWithinTTL.id); // Will be checked, not necessarily cleaned if TTL not met
      expect(realCleanupSpy).toHaveBeenCalledWith(sessionBusy.id); // Will be checked, not cleaned if busy & not forced
      expect(realCleanupSpy).toHaveBeenCalledTimes(3);

      // Check actual outcome based on cleanupSession logic
      expect(internalSessionsMap.has(sessionPastTTL.id)).toBe(false); // Past TTL, idle -> cleaned
      expect(internalSessionsMap.has(sessionWithinTTL.id)).toBe(true); // Within TTL, idle -> not cleaned by alarm default
      expect(internalSessionsMap.has(sessionBusy.id)).toBe(true); // Busy -> not cleaned by alarm default

      expect(mockState.storage.setAlarm).toHaveBeenCalledTimes(1);
      realCleanupSpy.mockRestore();
    });

    it("should reschedule alarm even if no sessions exist to ensure future checks", async () => {
      internalSessionsMap.clear(); // No sessions
      // @ts-ignore
      await doInstance.alarm();
      expect(cleanupSessionSpy).not.toHaveBeenCalled(); // No sessions to clean
      expect(mockState.storage.setAlarm).toHaveBeenCalledTimes(1);
    });
  });

  // TODO: More describe blocks for:
  // - _takeScreenshot (detailed puppeteer interactions)
  // - launchNewSessionWithTimeout (success, failure, timeout)
  // - cleanupSession
  // - alarm
});
