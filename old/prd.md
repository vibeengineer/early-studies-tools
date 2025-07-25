# PRD: Screenshot Overlay Service

## Overview
We are adding a new feature to the project: an HTTP endpoint `/screenshot` that will:
1. Accept a web page URL and an optional template image identifier.
2. Queue a job to capture a screenshot of the web page.
3. Utilize a **Screenshot Durable Object** to manage and reuse Cloudflare Browser Rendering sessions (Puppeteer) for efficient screenshot capture, working around Browser Rendering's concurrent launch limits.
4. Overlay the captured screenshot onto a specified template/background image using Cloudflare Images' "draw" functionality.
5. Serve the final composited image to the user.

This service leverages Cloudflare Queues for robust job management, Durable Objects for scalable browser session handling, and Cloudflare Images for powerful image manipulation, all running on Cloudflare's edge infrastructure.

## Goals
- **Fast, reliable, and scalable screenshot capture** of arbitrary web pages, respecting platform concurrency limits.
- **Efficient browser session management** using Durable Objects to maximize reuse and performance.
- **Flexible image compositing**: Overlay screenshots onto various templates.
- **Stateless, scalable API**: No server-side state outside of job queues, caches, and DO state.
- **Cost-effective**: Minimize infrastructure overhead.

## Functional Requirements

### 1. Endpoint
- `GET /screenshot?url=<targetURL>&template=<templateKey>`
- Accepts:
  - `url` (string, required): The web page URL to screenshot.
  - `template` (string, optional): The key/identifier of the template/background image. If omitted, a default template will be used.
- Behavior:
  - The endpoint will ideally appear synchronous to the user, returning the final image.
  - Internally, it will submit a job to `SCREENSHOT_QUEUE`. The worker handling the HTTP request will await the result of this queued job (within reasonable timeouts) before responding.
  - If immediate synchronous processing isn't feasible due to longer queue times, this might be revised to return a job ID for polling. (Initial aim: synchronous appearance).

### 2. Screenshot Job Queuing
- Screenshot requests will be pushed as messages to a **Cloudflare Queue** (`SCREENSHOT_QUEUE`).
- This manages the load on the Browser Rendering service, ensuring that requests are processed without exceeding concurrency limits (e.g., the 2 concurrent `puppeteer.launch` calls per DO namespace, and 6 total for the account).

### 3. Screenshot Capture via Durable Object
- A **Screenshot Durable Object (DO)** will be responsible for handling screenshot tasks from the queue.
- The DO will:
  - Manage a pool of long-lived browser instances/sessions, launched via its own `env.MYBROWSER` binding using `puppeteer.launch()`.
  - Reuse existing browser sessions whenever possible to improve performance and reduce `puppeteer.launch()` calls.
  - Use **Durable Object Storage** to maintain state about its managed browser sessions (e.g., busy/free status, last used timestamp, session ID) and manage their lifecycle using DO alarms (e.g., for keep-alive or cleanup).
  - Receive a job from the queue consumer, select/launch a browser session, navigate to the URL, and capture the screenshot.
  - The captured screenshot (image buffer) will be returned to the queue consumer/worker.

### 4. Image Compositing
- Once the screenshot is captured, the worker will:
  - Fetch the specified (or default) template image (e.g., from R2 via `SCREENSHOTS_BUCKET`).
  - Use Cloudflare Images' "draw" API to overlay the screenshot onto the template image.
  - Allow for configuration of overlay position, size, etc., as needed.

### 5. Response
- Return the final composited image (e.g., PNG or JPEG).
- Set appropriate HTTP cache headers (`Cache-Control`, `ETag`) to leverage browser and CDN caching.

### 6. Error Handling
- Validate input `url` and `template` parameters.
- Handle errors from the queue, Durable Object, screenshot process, and image compositing.
- Return clear, user-friendly error messages with appropriate HTTP status codes.

## Non-Functional Requirements

### 1. Performance
- Sub-second response for fully cached composited images.
- Target P95 for initial screenshot and compositing (cold cache for screenshot, template cached) within 5-7 seconds. Durable Object session reuse is key here.

### 2. Security
- Prevent SSRF by validating and sanitizing input URLs.
- Restrict template images to a known set or secure storage (e.g., specific R2 bucket path).

### 3. Scalability
- The system should scale with increasing request volume, managed by Cloudflare Queues and the stateless nature of the main worker, with Durable Objects handling browser session scaling.

### 4. Observability
- Log all requests, queue job statuses, DO operations, errors, and performance metrics.

## Technical Architecture

1. **Cloudflare Worker (`src/index.ts`)**:
  - Handles incoming `GET /screenshot` requests.
  - Validates inputs.
  - Sends a job message to `SCREENSHOT_QUEUE`.
  - Awaits job completion (or handles async polling if necessary).
  - Receives the raw screenshot from the completed job.
  - Orchestrates image compositing using Cloudflare Images.
  - Returns the final image.
  - Acts as the consumer for `SCREENSHOT_QUEUE`, forwarding jobs to the Screenshot Durable Object.

2. **Cloudflare Queues (`SCREENSHOT_QUEUE`)**:
  - Bound in `wrangler.jsonc`.
  - Decouples HTTP requests from the actual screenshot process.
  - Manages the flow of screenshot tasks *to the Screenshot Durable Object*, effectively serializing requests and helping the DO manage its browser instances within Browser Rendering's concurrent *launch* limits.

3. **Screenshot Durable Object (DO)**:
  - A new class, e.g., `ScreenshotBrowserDO`.
  - Binding to be defined in `wrangler.jsonc`.
  - Manages one or more long-lived browser instances (a pool) obtained via `puppeteer.launch(this.env.MYBROWSER)` (where `this.env.MYBROWSER` is the Browser Rendering binding available to the DO).
  - Uses its own storage (`this.state.storage`) to track session availability, metadata, and to manage browser instance lifecycle with DO alarms (e.g., `this.state.storage.setAlarm()`).
  - Exposes a method (e.g., via its `fetch` handler) to take a screenshot given a URL using one of its managed browser sessions.

4. **Cloudflare Browser Rendering (`MYBROWSER` binding)**:
  - Used by the Screenshot DO to launch and interact with headless browsers.

5. **Cloudflare Images**:
  - Used for the "draw" operation to composite the screenshot onto a template.

6. **Storage**:
  - **R2 (`SCREENSHOTS_BUCKET`)**:
    - Store template images.
    - Potentially store intermediate raw screenshots (if the DO passes data via R2 instead of directly).
    - Cache final composited images.
  - **KV (Optional)**:
    - Cache final composited image metadata or URLs (if serving from R2).
    - Alternative for caching final images if preferred over R2 for this specific cache.
  - **Durable Object Storage**:
    - Used by `ScreenshotBrowserDO` to store state about its managed browser sessions (e.g., session IDs, busy status, last-used timestamps) and for managing DO alarms related to browser session lifecycle.

## Example Flow
1. User calls `GET /screenshot?url=https://example.com&template=phone-frame`.
2. The main Cloudflare Worker (`src/index.ts`) validates the request and sends a message to `SCREENSHOT_QUEUE` containing `{ url: "https://example.com", templateKey: "phone-frame" }`.
3. The Worker (acting as a queue consumer or a dedicated consumer worker) receives the job from `SCREENSHOT_QUEUE`.
4. The consumer worker gets/creates an instance of `ScreenshotBrowserDO` (e.g., using `idFromName("singleton-browser-manager")` or a sharded approach).
5. The consumer invokes a method on the `ScreenshotBrowserDO` (e.g., `DO.fetch(jobDetailsRequest)`).
6. The `ScreenshotBrowserDO` checks its internal storage for an available browser session. If none are suitable (or its pool is not at capacity), it *launches a new browser instance using `this.env.MYBROWSER`*. It updates its storage with the session status and potentially sets/resets a keep-alive alarm for the session/instance.
7. The DO navigates to `https://example.com` using a managed browser session and captures the screenshot.
8. The screenshot data (e.g., buffer) is returned from the DO to the consumer worker. The DO marks the browser session as available in its storage and might adjust its keep-alive alarm.
9. The consumer worker (or the original HTTP handler if it awaited this process) fetches the `phone-frame` template from R2 (`SCREENSHOTS_BUCKET`).
10. It calls the Cloudflare Images API to draw the screenshot onto the template.
11. The final composited image is returned to the user with appropriate cache headers.
12. The final image might also be cached in R2 or KV for subsequent identical requests.

## References
- [Cloudflare Images Docs](https://developers.cloudflare.com/images/)
- [Cloudflare Browser Rendering Docs](https://developers.cloudflare.com/browser-rendering/) ([especially with Durable Objects](https://developers.cloudflare.com/browser-rendering/get-started/browser-rendering-with-do/))
- [Cloudflare Durable Objects Docs](https://developers.cloudflare.com/durable-objects/) ([including Storage](https://developers.cloudflare.com/durable-objects/api/transactional-storage-api/))
- [Cloudflare Queues Docs](https://developers.cloudflare.com/queues/)
- [src/index.ts](mdc:src/index.ts)
- [src/services/screenshot/](mdc:src/services/screenshot/) (to be adapted or augmented with DO logic)
- [wrangler.jsonc](mdc:wrangler.jsonc)

## Open Questions
- What specific templates should be supported initially? How are they identified/stored?
- Detailed overlay parameters for Cloudflare Images "draw" (position, size, opacity)?
- Strategy for DO sharding/naming if a single DO becomes a bottleneck for browser management.
- Specific cache TTLs for raw screenshots, templates, and final composites.

## Acceptance Criteria
- [ ] `GET /screenshot` endpoint successfully queues a job and returns a composited image.
- [ ] `SCREENSHOT_QUEUE` effectively manages concurrent screenshot operations.
- [ ] `ScreenshotBrowserDO` reuses browser sessions and manages their lifecycle using DO storage.
- [ ] Cloudflare Images "draw" functionality correctly overlays screenshots on templates.
- [ ] Screenshots and final images are cached appropriately (R2/KV and HTTP headers).
- [ ] Only whitelisted/valid templates can be used.
- [ ] Input validation and error handling are robust across all components.
- [ ] All code is covered by automated tests.
