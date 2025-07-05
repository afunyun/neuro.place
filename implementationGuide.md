# Implementation Guide: Admin Dashboard & Features

This document outlines the new files created and existing files modified to implement the Admin Dashboard and related features for Neuro.Place.

## Overview

The primary goal was to create an admin-only dashboard (`dash.html`) for managing the Neuro.Place application. This includes viewing grid status, user activity, and performing administrative actions like sending announcements, managing users (via backend logic for admin list), and controlling grid updates.

## New Files Created

### 1. `public/dash.html`

*   **Purpose:** The main HTML file for the admin dashboard.
*   **Structure:**
    *   Standard HTML boilerplate.
    *   Links to `tailwind.css`, `style.css` (existing shared styles), and `dash.css` (dashboard-specific styles).
    *   Header: Displays dashboard title, logged-in admin username, and a logout button.
    *   Main Content Area:
        *   **Grid Preview Section:** Contains a canvas (`adminGridCanvas`) to display a snapshot of the pixel grid and an "Update Preview" button.
        *   **Live Stats Section:** Displays the number of active WebSocket connections.
        *   **Pixel Placement Log Section:** Shows a log of recent pixel placements with details (user, coordinates, color, timestamp, method).
        *   **Admin Actions Section:** Grouped controls for various administrative tasks:
            *   Force Disconnect Session (input for session ID, button).
            *   Push Toast Message (input for message, select for type, button).
            *   Push Announcement (input for message, button).
            *   Update Status Page Message (textarea for message, button).
            *   Grid Updates Control (status display, pause button, resume button).
            *   Grid Manipulation (inputs for X, Y, color; buttons for Set Pixel, Clear Pixel, Clear Entire Grid).
    *   Scripts: Loads `public/static/js/dash.js` as a module.
*   **Dependencies:**
    *   `public/static/css/tailwind.css`
    *   `public/static/css/style.css`
    *   `public/static/css/dash.css`
    *   `public/static/js/dash.js`
    *   Backend API endpoints (detailed in `src/index.js` modifications).

### 2. `public/static/js/dash.js`

*   **Purpose:** Handles all client-side logic for `dash.html`.
*   **Key Functionalities:**
    *   **Authentication (`checkAdminAuth`, `logout`):**
        *   Retrieves `discord_token` and `user_data` from `localStorage`.
        *   If no token, redirects to `/index.html`.
        *   Makes a GET request to `/admin/auth-check` (backend) with the token.
        *   If token is invalid or user is not an admin (401/403 from backend), redirects to `/index.html` or `/filtered.html` respectively.
        *   Displays admin username if authenticated.
        *   `logout()` clears `localStorage` and redirects to `/index.html`.
    *   **Grid Preview (`fetchAndDrawGridPreview`, `drawGridPreview`, `assembleChunks`):**
        *   `fetchAndDrawGridPreview`: Called on "Update Preview" click. Fetches data from `/admin/grid-snapshot`.
        *   `assembleChunks`: Helper to reconstruct the full grid if the backend returns chunked data (as the `/admin/grid-snapshot` endpoint is currently configured to do).
        *   `drawGridPreview`: Renders the fetched grid data onto the `adminGridCanvas`.
    *   **Stats Fetching (`fetchStats`, `renderPixelLog`):**
        *   `fetchStats`: Periodically (and initially) calls:
            *   `/admin/connections-count` to get active WebSocket user count.
            *   `/admin/pixel-log` to get recent pixel placements.
        *   `renderPixelLog`: Formats and displays pixel log entries.
    *   **Admin Action Handlers:**
        *   Each admin action button in `dash.html` has a corresponding handler function (e.g., `handleForceDisconnect`, `handlePushToast`).
        *   These handlers typically:
            *   Read values from input fields.
            *   Call the generic `handleAdminAction` function.
    *   **`handleAdminAction(endpoint, body, successMessage, method)`:**
        *   A generic helper to make `fetch` requests to the specified backend admin `endpoint`.
        *   Sends the `discord_token` in the `Authorization` header.
        *   Displays success or error messages using `alert()`.
    *   **Grid Update Status (`toggleGridUpdates`, `updateGridUpdateStatusDisplay`, `fetchGridUpdateStatus`):**
        *   `toggleGridUpdates`: Calls `/admin/pause-updates` with `pause: true/false`.
        *   `fetchGridUpdateStatus`: Fetches current status from `/admin/pause-status`.
        *   `updateGridUpdateStatusDisplay`: Updates UI elements based on fetched status.
    *   **Grid Manipulation (`handleSetPixel`, `handleClearPixel`, `handleClearFullGrid`):**
        *   `handleSetPixel`: Calls `/admin/grid-manipulate` with `action: "set_pixel"`.
        *   `handleClearPixel`: Calls `/admin/grid-manipulate` to set pixel to white.
        *   `handleClearFullGrid`: Calls `/admin/grid-clear` (POST request). Requires confirmation.
    *   **Initialization (`init`):**
        *   Runs `checkAdminAuth`.
        *   If admin, sets up event listeners and performs initial data fetches.
*   **Dependencies:**
    *   `public/dash.html` (for DOM elements).
    *   Backend API endpoints (detailed in `src/index.js` modifications).

### 3. `public/static/css/dash.css`

*   **Purpose:** Provides specific styling for `dash.html` elements to ensure a consistent admin theme, distinct from the main site if necessary.
*   **Content:**
    *   General dark theme styles for the dashboard body, panels, headers.
    *   Styling for input fields, buttons (primary, danger, warning, success, info).
    *   Specific styles for the grid preview canvas, pixel placement log container.
    *   Styles for the `filtered.html` page (centered text with glow).
    *   Styles for the admin message box on `status.html`.
    *   Responsive adjustments for smaller screens.
*   **Dependencies:** Used by `dash.html`, `filtered.html`, and `status.html`.

### 4. `public/filtered.html`

*   **Purpose:** A simple page displayed to users who try to access `dash.html` but are not authenticated as admins.
*   **Content:**
    *   Minimal HTML.
    *   Displays the text "Filtered." in the center of the page.
    *   Styled with white text and a pink glow effect (styles primarily from `dash.css`, with some inline fallback/enhancements).
*   **Dependencies:** `public/static/css/dash.css`.

## Existing Files Modified

### 1. `src/index.js` (Backend Worker / Durable Object `GridDurableObject`)

*   **Purpose:** The core backend logic. Modified to add admin functionalities.
*   **Key Modifications:**
    *   **Durable Object State:**
        *   Added new properties: `pixelPlacementLog` (Array), `MAX_PIXEL_LOG_ENTRIES` (Number), `gridUpdatesPaused` (Boolean), `statusPageMessage` (String).
        *   `initialize()`: Now loads these new state variables from `this.state.storage` (e.g., `loadPixelLog`, `loadGridUpdateStatus`, `loadStatusPageMessage`).
        *   Added corresponding `savePixelLog`, `saveGridUpdateStatus`, `saveStatusPageMessage` methods to persist these to storage.
        *   `addPixelLogEntry()`: Manages adding to `pixelPlacementLog`, capping its size, and calling `savePixelLog`.
    *   **Admin Route Registration:**
        *   The `app.all(p, ...)` loop now includes all new admin-specific paths (e.g., `/admin/auth-check`, `/admin/grid-snapshot`, etc.) to ensure they are routed to the Durable Object.
    *   **Admin Endpoints (within `GridDurableObject.fetch()`):**
        *   **`/admin/auth-check` (GET):**
            *   Requires Bearer token.
            *   Validates token using `validateDiscordToken`.
            *   Checks if user ID is in `this.adminUserIds`.
            *   Returns `{ isAdmin: true/false }` or 401/403.
        *   **`/admin/grid-snapshot` (GET):**
            *   Admin protected.
            *   Returns grid data. Supports `?chunk=N` parameter, similar to the public `/grid` endpoint. This allows the admin dashboard to fetch the grid efficiently if needed, without loading the entire grid into DO memory at once for the response.
        *   **`/admin/connections-count` (GET):**
            *   Admin protected.
            *   Returns `{ count: this.sessions.size }`.
        *   **`/admin/pixel-log` (GET):**
            *   Admin protected.
            *   Returns a slice of `this.pixelPlacementLog` (e.g., the latest 50 entries).
        *   **`/admin/disconnect-session` (POST):**
            *   Admin protected.
            *   Accepts `{ sessionId }`.
            *   **Note:** Current implementation is a placeholder. True session disconnect requires mapping client-generated session IDs to server-side WebSocket objects, which is not yet implemented. It currently logs the request.
        *   **`/admin/toast` (POST):**
            *   Admin protected.
            *   Accepts `{ message, type }`.
            *   Broadcasts a message of type `broadcast` to all connected WebSocket clients.
        *   **`/admin/status-update` (POST):**
            *   Admin protected.
            *   Accepts `{ message }`.
            *   Updates `this.statusPageMessage` and saves it to storage.
        *   **`/admin/pause-updates` (POST):**
            *   Admin protected.
            *   Accepts `{ pause: true/false }`.
            *   Sets `this.gridUpdatesPaused` flag and saves it.
            *   Broadcasts a `grid_pause_status` message to clients.
        *   **`/admin/pause-status` (GET):**
            *   Admin protected.
            *   Returns `{ updatesPaused: this.gridUpdatesPaused }`.
        *   **`/admin/grid-manipulate` (POST):**
            *   Admin protected.
            *   Accepts `{ action, x, y, color }`.
            *   Currently handles `action: "set_pixel"`:
                *   Updates the specified pixel in the KV store (similar to `/pixel` endpoint).
                *   Broadcasts the pixel update to clients.
                *   Logs the action to the admin console and the main pixel log.
        *   **`/admin/grid-clear` (POST):** (This endpoint was already present but is used by the new dash)
            *   Admin protected.
            *   Clears all pixels in the KV store to white.
            *   Broadcasts a `grid-refreshed` message.
    *   **`/pixel` Endpoint Modification:**
        *   Checks `this.gridUpdatesPaused`. If true, returns a 503 error, preventing pixel placements.
        *   When a pixel is placed, it now calls `this.addPixelLogEntry()` to record the placement with details including `inputMethod` and `sessionId` (if provided in the request body from the client).
    *   **`/api/status-message` (GET):**
        *   A new **public** endpoint.
        *   Returns `{ message: this.statusPageMessage }`. Used by `status.html`.
    *   **Security:** All admin endpoints perform an admin check using the Discord token and `this.adminUserIds`.
    *   **Logging:** Enhanced logging to `this.logToConsole` (which sends to connected admin WebSockets) for various admin actions.
*   **Dependencies:**
    *   Cloudflare Worker environment (for `env` bindings like KV stores, Durable Objects, `ADMIN_USER_IDS`).
    *   Discord OAuth for token validation (`validateDiscordToken`).

### 2. `public/status.html`

*   **Purpose:** Displays the general status of the backend services. Modified to also show a custom message set by admins.
*   **Key Modifications:**
    *   **HTML:**
        *   Added a new `div` with `id="adminMessageBox"` to display the admin message. This box is hidden by default.
        *   It includes an icon and a `div` with `id="adminMessageContent"` for the message text.
    *   **JavaScript:**
        *   Added `adminMessageBox` and `adminMessageContent` DOM element selectors.
        *   Created `fetchAdminMessage()`:
            *   Makes a GET request to the new `/api/status-message` endpoint.
            *   If the response contains a non-empty message, it populates `adminMessageContent` and makes `adminMessageBox` visible.
            *   If the message is empty or the fetch fails, it hides `adminMessageBox`.
        *   `checkBackendStatus()`: Now calls `fetchAdminMessage()` at the beginning of its execution to update the admin message alongside other status checks.
    *   **CSS:** Linked `dash.css` to use its panel styling for the admin message box, with some inline style overrides/defaults for specific colors if needed.
*   **Dependencies:**
    *   `/api/status-message` backend endpoint.
    *   `public/static/css/dash.css` (for styling the admin message box).

## Workflow & Interactions

1.  **Admin Access to Dashboard:**
    *   Admin navigates to `dash.html`.
    *   `dash.js` checks for `localStorage` token.
    *   If token exists, `dash.js` calls `/admin/auth-check` with the token.
    *   `src/index.js` validates the token and checks if the user ID is in `ADMIN_USER_IDS`.
    *   If valid admin, `dash.js` loads dashboard UI. Otherwise, redirect to `/index.html` (no/invalid token) or `/filtered.html` (not an admin).
2.  **Fetching Data on Dashboard:**
    *   Grid Preview: Button click -> `dash.js` calls `/admin/grid-snapshot` -> `src/index.js` returns grid data -> `dash.js` renders on canvas.
    *   Stats: `dash.js` periodically calls `/admin/connections-count` and `/admin/pixel-log` -> `src/index.js` returns data -> `dash.js` updates UI.
3.  **Performing Admin Actions:**
    *   Admin interacts with UI elements in `dash.html`.
    *   `dash.js` handlers call respective `/admin/*` endpoints on `src/index.js` with necessary data and auth token.
    *   `src/index.js` performs the action (e.g., updates KV, broadcasts to clients, modifies DO state) and returns a success/error response.
    *   `dash.js` shows feedback to the admin.
4.  **Status Page Message:**
    *   Admin uses "Update Status Page Message" on `dash.html`.
    *   `dash.js` calls `/admin/status-update` with the message.
    *   `src/index.js` saves the message to Durable Object storage.
    *   Users visiting `status.html`:
        *   `status.html`'s JavaScript calls `/api/status-message`.
        *   `src/index.js` returns the stored message.
        *   `status.html` displays the message.
5.  **Pausing Grid Updates:**
    *   Admin clicks "Pause Updates" on `dash.html`.
    *   `dash.js` calls `/admin/pause-updates` with `{ pause: true }`.
    *   `src/index.js` sets `this.gridUpdatesPaused = true`, saves it, and broadcasts the status.
    *   Subsequent calls to `/pixel` on `src/index.js` will be rejected with a 503 error until resumed.

## Environment Variables (Review from `src/index.js`)

*   `DISCORD_CLIENT_ID`: Used for Discord OAuth.
*   `DISCORD_CLIENT_SECRET`: Used for Discord OAuth.
*   `ADMIN_USER_IDS`: Comma-separated string of Discord User IDs who are considered admins. Crucial for dashboard access. Loaded into `this.adminUserIds` in the DO, also synced to `PALETTE_KV` under `admin_users`.
*   `PALETTE_KV`: KV Namespace binding for storing grid data (chunks), admin user list, and potentially other persistent settings.
*   `GRID_STATE`: Durable Object binding for `GridDurableObject`.
*   `ASSETS`: Binding for serving static assets.
*   `DISCORD_WEBHOOK_URL`: For sending notifications of pixel placements.
*   `DISCORD_DEPLOYMENT_WEBHOOK_URL`: (Optional) For deployment notifications.
*   `onEventStore`: (If Analytics Engine is used) For custom analytics.

This guide should provide a comprehensive understanding of the implemented admin dashboard features.
