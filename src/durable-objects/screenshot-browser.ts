import puppeteer, {
  type Browser as PuppeteerBrowser,
  type Page as PuppeteerPage,
} from "@cloudflare/puppeteer";

export interface BrowserSession {
  id: string; // Our internal ID for this session slot
  browser: PuppeteerBrowser | null;
  status: "idle" | "busy" | "launching" | "terminating" | "failed";
  lastUsed: number;
}

// Helper type for serializing session metadata
interface BrowserSessionMeta {
  id: string;
  status: "idle" | "busy" | "launching" | "terminating" | "failed";
  lastUsed: number;
}

class NoAvailableSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoAvailableSessionError";
  }
}

export class ScreenshotBrowserDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env; // Env is globally available from worker-configuration.d.ts
  private sessions: Map<string, BrowserSession>;
  private readonly MAX_SESSIONS = 2; // Configurable: Max concurrent browser instances
  private readonly SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes: Time an idle session can live
  private readonly ALARM_INTERVAL_MS = 1 * 60 * 1000; // 1 minute: How often to check for idle sessions
  private readonly LAUNCH_TIMEOUT_MS = 30 * 1000; // 30 seconds: Max time to wait for a browser to launch
  private readonly SCREENSHOT_TIMEOUT_MS = 30 * 1000; // 30 seconds: Max time for screenshot operation

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map<string, BrowserSession>();

    this.state.blockConcurrencyWhile(async () => {
      // Restore session metadata from storage
      const storedSessions: BrowserSessionMeta[] = (await this.state.storage.get("sessions")) || [];
      for (const meta of storedSessions) {
        this.sessions.set(meta.id, {
          id: meta.id,
          browser: null, // Browsers are not persisted; will be re-launched as needed
          status: meta.status,
          lastUsed: meta.lastUsed,
        });
      }
      const currentAlarm = await this.state.storage.getAlarm();
      if (currentAlarm === null) {
        console.log("No alarm set, setting initial alarm.");
        await this.state.storage.setAlarm(Date.now() + this.ALARM_INTERVAL_MS);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/screenshot") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response("Missing target URL parameter", { status: 400 });
      }
      try {
        console.log(`Received screenshot request for: ${targetUrl}`);
        const imageBuffer = await this.captureScreenshotWithTimeout(targetUrl);
        return new Response(imageBuffer, { headers: { "Content-Type": "image/png" } });
      } catch (error) {
        console.error(`Screenshot capture failed for ${targetUrl}:`, error);
        if (error instanceof NoAvailableSessionError) {
          return new Response(
            error.message,
            { status: 503, headers: { "Retry-After": "30" } } // Suggest retrying after 30 seconds
          );
        }
        return new Response(
          error instanceof Error ? error.message : "Failed to capture screenshot",
          { status: 500 }
        );
      }
    }
    return new Response("Not found - use /screenshot?url=...", { status: 404 });
  }

  private captureScreenshotWithTimeout(targetUrl: string): Promise<ArrayBuffer> {
    //biome-ignore lint/suspicious/noAsyncPromiseExecutor:
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Screenshot operation timed out for ${targetUrl} after ${this.SCREENSHOT_TIMEOUT_MS / 1000}s`
          )
        );
      }, this.SCREENSHOT_TIMEOUT_MS);

      try {
        const result = await this._takeScreenshot(targetUrl);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private async _takeScreenshot(targetUrl: string): Promise<ArrayBuffer> {
    const session = await this.getAvailableSession();
    if (!session || !session.browser) {
      throw new Error("No available browser session found or browser not launched.");
    }

    const page: PuppeteerPage = await session.browser.newPage();
    console.log(`Session ${session.id}: New page created for ${targetUrl}`);
    try {
      session.status = "busy";
      this.sessions.set(session.id, { ...session });

      await page.setViewport({ width: 1920, height: 1080 });
      console.log(`Session ${session.id}: Viewport set for ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: "networkidle0" });
      console.log(`Session ${session.id}: Navigated to ${targetUrl}`);
      const puppeteerBuffer = await page.screenshot();
      console.log(`Session ${session.id}: Screenshot captured for ${targetUrl}`);

      session.lastUsed = Date.now();
      session.status = "idle";
      this.sessions.set(session.id, { ...session });
      await this.saveSessionsToStorage();
      return puppeteerBuffer.buffer as ArrayBuffer;
    } catch (error) {
      console.error(`Session ${session.id}: Error during screenshot for ${targetUrl}:`, error);
      session.status = "terminating";
      this.sessions.set(session.id, { ...session });
      await this.cleanupSession(session.id, true);
      throw error;
    } finally {
      try {
        await page.close();
        console.log(`Session ${session.id}: Page closed for ${targetUrl}`);
      } catch (pageCloseError) {
        console.warn(
          `Session ${session.id}: Failed to close page for ${targetUrl}:`,
          pageCloseError
        );
      }
      if (this.sessions.has(session.id)) {
        const currentSession = this.sessions.get(session.id);
        if (currentSession && currentSession.status === "busy") {
          currentSession.status = "idle";
          currentSession.lastUsed = Date.now();
          this.sessions.set(session.id, currentSession);
        }
      }
      await this.saveSessionsToStorage();
    }
  }

  private async getAvailableSession(): Promise<BrowserSession | null> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1500;
    const HEALTH_CHECK_TIMEOUT_MS = 5000; // 5 seconds timeout for health check

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Check for existing idle session
      for (const session of this.sessions.values()) {
        if (session.status === "idle" && session.browser) {
          if (session.browser.connected) {
            // Perform a quick health check by opening and closing a blank page.
            let healthCheckPassed = false;
            let healthCheckError: Error | undefined;
            const healthCheckTimeoutId = setTimeout(() => {
              healthCheckError = new Error("Health check (newPage/close) timed out.");
            }, HEALTH_CHECK_TIMEOUT_MS);
            try {
              const testPage = await session.browser.newPage();
              await testPage.close();
              clearTimeout(healthCheckTimeoutId);
              healthCheckPassed = true;
            } catch (e) {
              clearTimeout(healthCheckTimeoutId);
              healthCheckError =
                e instanceof Error ? e : new Error("Health check failed (unknown error).");
            }

            if (healthCheckPassed) {
              console.log(
                `Attempt ${attempt}: Reusing idle session (health check passed): ${session.id}`
              );
              session.lastUsed = Date.now();
              await this.saveSessionsToStorage();
              return session;
            }
            // If health check failed, mark for cleanup
            console.warn(
              `Attempt ${attempt}: Idle session ${session.id} failed health check: ${healthCheckError?.message}. Cleaning up.`
            );
            session.status = "terminating";
            this.sessions.set(session.id, session);
            await this.cleanupSession(session.id, true); // Force cleanup.
          } else {
            // Browser is not connected, clean it up.
            console.warn(
              `Attempt ${attempt}: Found disconnected browser in session ${session.id}. Cleaning up.`
            );
            await this.cleanupSession(session.id, true);
          }
        }
        // Cleanup disconnected browsers found during iteration (redundant now, but kept for clarity)
        if (session.browser && !session.browser.connected) {
          console.warn(
            `Attempt ${attempt}: Found disconnected browser in session ${session.id}. Cleaning up.`
          );
          await this.cleanupSession(session.id, true);
        }
      }

      // Try to launch a new session if below max capacity
      if (this.sessions.size < this.MAX_SESSIONS) {
        const newSessionId = crypto.randomUUID();
        console.log(
          `Attempt ${attempt}: Trying to launch new session (current: ${this.sessions.size}, max: ${this.MAX_SESSIONS}): ${newSessionId}`
        );
        const newSession = await this.launchNewSessionWithTimeout(newSessionId);
        if (newSession) {
          await this.saveSessionsToStorage();
          return newSession; // Successfully launched
        }
        // If launch failed, it's logged in launchNewSessionWithTimeout, loop will continue if attempts left
      }

      // If max sessions reached or launch failed, and more attempts left, wait and retry
      if (attempt < MAX_RETRIES) {
        console.warn(
          `Attempt ${attempt}: No session available (Max: ${this.MAX_SESSIONS}, Current: ${this.sessions.size}). Waiting ${RETRY_DELAY_MS}ms before retry ${attempt + 1}.`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        console.error(`Failed to get an available session after ${MAX_RETRIES} attempts.`);
      }
    }
    throw new NoAvailableSessionError(
      `Failed to get an available session after ${MAX_RETRIES} attempts. Max sessions: ${this.MAX_SESSIONS}.`
    );
  }

  private launchNewSessionWithTimeout(sessionId: string): Promise<BrowserSession | null> {
    //biome-ignore lint/suspicious/noAsyncPromiseExecutor:
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.sessions.has(sessionId)) {
          const session = this.sessions.get(sessionId);
          if (session && session.status === "launching") {
            session.status = "failed";
            this.sessions.set(sessionId, session);
          }
        }
        reject(
          new Error(
            `Browser launch timed out for session ${sessionId} after ${this.LAUNCH_TIMEOUT_MS / 1000}s`
          )
        );
      }, this.LAUNCH_TIMEOUT_MS);

      this.sessions.set(sessionId, {
        id: sessionId,
        browser: null,
        status: "launching",
        lastUsed: Date.now(),
      });
      await this.saveSessionsToStorage();
      try {
        console.log(`Session ${sessionId}: Launching new browser instance via Puppeteer.`);
        const browser = await puppeteer.launch(this.env.BROWSER);
        console.log(
          `Session ${sessionId}: Browser instance launched. Connected: ${browser.connected}`
        );

        clearTimeout(timeoutId);

        const newSession: BrowserSession = {
          id: sessionId,
          browser: browser,
          status: "idle",
          lastUsed: Date.now(),
        };
        this.sessions.set(sessionId, newSession);
        await this.saveSessionsToStorage();
        resolve(newSession);
      } catch (error) {
        console.error(`Session ${sessionId}: Failed to launch browser instance:`, error);
        clearTimeout(timeoutId);
        this.sessions.delete(sessionId);
        await this.saveSessionsToStorage();
        reject(error);
      }
    });
  }

  private async cleanupSession(sessionId: string, force = false): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`Cleanup: Session ${sessionId} not found.`);
      return;
    }

    const idleTime = Date.now() - session.lastUsed;
    const shouldCleanup =
      force ||
      session.status === "terminating" ||
      session.status === "failed" ||
      (session.status === "idle" && idleTime > this.SESSION_TTL_MS) ||
      (session.browser && !session.browser.connected);

    if (shouldCleanup) {
      console.log(
        `Cleaning up session ${sessionId}. Force: ${force}, Status: ${session.status}, Idle: ${idleTime}ms, Connected: ${session.browser?.connected}`
      );
      if (session.browser) {
        try {
          console.log(`Session ${sessionId}: Closing browser.`);
          await session.browser.close();
          console.log(`Session ${sessionId}: Browser closed.`);
        } catch (error) {
          console.warn(`Session ${sessionId}: Error closing browser:`, error);
        }
      }
      this.sessions.delete(sessionId);
      await this.saveSessionsToStorage();
      console.log(`Session ${sessionId}: Removed from tracking.`);
    } else {
      // console.log(`Session ${sessionId}: No cleanup needed. Status: ${session.status}, Idle: ${idleTime}ms`);
    }
  }

  async alarm(): Promise<void> {
    console.log("Durable Object alarm: Running cleanup for idle/stale sessions.");
    let activeKnownSessions = 0;
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.cleanupSession(sessionId);
      if (this.sessions.has(sessionId)) {
        activeKnownSessions++;
      }
    }
    console.log(`Alarm: Cleanup finished. ${activeKnownSessions} sessions potentially remaining.`);

    await this.state.storage.setAlarm(Date.now() + this.ALARM_INTERVAL_MS);
    console.log(`Alarm: Rescheduled for ${this.ALARM_INTERVAL_MS / 1000}s later.`);
  }

  // Save session metadata to storage (call after any session add/update/delete)
  private async saveSessionsToStorage() {
    const sessionMeta: BrowserSessionMeta[] = Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      status: s.status,
      lastUsed: s.lastUsed,
    }));
    await this.state.storage.put("sessions", sessionMeta);
  }
}
