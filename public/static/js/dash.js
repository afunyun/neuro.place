document.addEventListener("DOMContentLoaded", () => {
    const IS_DEV_MODE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const BACKEND_URL = `${window.location.origin}`;

    const userNameEl = document.getElementById("userName");
    const logoutBtn = document.getElementById("logoutBtn");

    const adminGridCanvas = document.getElementById("adminGridCanvas");
    const adminGridCtx = adminGridCanvas?.getContext("2d");
    const updatePreviewBtn = document.getElementById("updatePreviewBtn");

    const activeConnectionsCountEl = document.getElementById("activeConnectionsCount");
    const pixelPlacementLogEl = document.getElementById("pixelPlacementLog");

    const disconnectSessionIdInput = document.getElementById("disconnectSessionId");
    const forceDisconnectBtn = document.getElementById("forceDisconnectBtn");

    const toastMessageInput = document.getElementById("toastMessage");
    const toastTypeSelect = document.getElementById("toastType");
    const pushToastBtn = document.getElementById("pushToastBtn");

    const announcementMessageInput = document.getElementById("announcementMessage");
    const pushAnnouncementBtn = document.getElementById("pushAnnouncementBtn");

    const statusPageMessageInput = document.getElementById("statusPageMessage");
    const updateStatusMsgBtn = document.getElementById("updateStatusMsgBtn");

    const gridUpdateStatusEl = document.getElementById("gridUpdateStatus");
    const pauseUpdatesBtn = document.getElementById("pauseUpdatesBtn");
    const resumeUpdatesBtn = document.getElementById("resumeUpdatesBtn");

    const gridManipXInput = document.getElementById("gridManipX");
    const gridManipYInput = document.getElementById("gridManipY");
    const gridManipColorInput = document.getElementById("gridManipColor");
    const setPixelBtn = document.getElementById("setPixelBtn");
    const clearPixelBtn = document.getElementById("clearPixelBtn");
    const clearFullGridBtn = document.getElementById("clearFullGridBtn");


    let userToken = localStorage.getItem("discord_token");
    let userData = JSON.parse(localStorage.getItem("user_data") || "null");

    const GRID_PREVIEW_SIZE = 250; // Match canvas element size in HTML/CSS
    const PIXEL_SIZE_PREVIEW = 1; // Draw 1:1 pixel, canvas scaling will handle visual size


    async function checkAdminAuth() {
        if (!userToken || !userData) {
            console.log("Dash: No token or user data, redirecting to index.html for login.");
            window.location.href = "/index.html";
            return false;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/admin/auth-check`, {
                headers: {
                    "Authorization": `Bearer ${userToken}`
                }
            });

            if (response.status === 401) {
                console.log("Dash: Token invalid, redirecting to index.html for re-login.");
                logout(); // Clear stored token/data
                window.location.href = "/index.html";
                return false;
            }

            if (response.status === 403) {
                console.log("Dash: User is not an admin, redirecting to filtered.html.");
                window.location.href = "/filtered.html";
                return false;
            }

            if (!response.ok) {
                console.error("Dash: Error checking admin status.", response.status);
                // Potentially redirect to index or show error, for now, assume not admin.
                window.location.href = "/filtered.html";
                return false;
            }

            const authResult = await response.json();
            if (authResult.isAdmin) {
                console.log("Dash: Admin access verified.");
                if (userNameEl) userNameEl.textContent = `${userData.username}#${userData.discriminator}`;
                return true;
            } else {
                console.log("Dash: User is not an admin (server check), redirecting to filtered.html.");
                window.location.href = "/filtered.html";
                return false;
            }

        } catch (error) {
            console.error("Dash: Exception during admin auth check.", error);
            // Fallback: redirect to filtered or index.
            window.location.href = "/index.html";
            return false;
        }
    }

    function logout() {
        localStorage.removeItem("discord_token");
        localStorage.removeItem("user_data");
        userToken = null;
        userData = null;
        console.log("Dash: Logged out, redirecting to index.html.");
        window.location.href = "/index.html";
    }

    function setupEventListeners() {
        if (logoutBtn) {
            logoutBtn.addEventListener("click", logout);
        }

        if (updatePreviewBtn) {
            updatePreviewBtn.addEventListener("click", fetchAndDrawGridPreview);
        }

        if (forceDisconnectBtn) {
            forceDisconnectBtn.addEventListener("click", handleForceDisconnect);
        }

        if (pushToastBtn) {
            pushToastBtn.addEventListener("click", handlePushToast);
        }

        if (pushAnnouncementBtn) {
            pushAnnouncementBtn.addEventListener("click", handlePushAnnouncement);
        }

        if (updateStatusMsgBtn) {
            updateStatusMsgBtn.addEventListener("click", handleUpdateStatusMessage);
        }

        if (pauseUpdatesBtn) {
            pauseUpdatesBtn.addEventListener("click", () => toggleGridUpdates(true));
        }
        if (resumeUpdatesBtn) {
            resumeUpdatesBtn.addEventListener("click", () => toggleGridUpdates(false));
        }

        if(setPixelBtn) {
            setPixelBtn.addEventListener("click", handleSetPixel);
        }
        if(clearPixelBtn) {
            clearPixelBtn.addEventListener("click", handleClearPixel);
        }
        if(clearFullGridBtn) {
            clearFullGridBtn.addEventListener("click", handleClearFullGrid);
        }
    }

    async function fetchAndDrawGridPreview() {
        if (!adminGridCtx) {
            console.error("Dash: Admin grid canvas context not found.");
            return;
        }
        console.log("Dash: Fetching grid preview...");
        try {
            const response = await fetch(`${BACKEND_URL}/admin/grid-snapshot`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch grid snapshot: ${response.status}`);
            }
            const gridData = await response.json();

            if (gridData && gridData.grid && gridData.grid.length === 500 && gridData.grid[0].length === 500) {
                 drawGridPreview(gridData.grid);
            } else if (gridData && gridData.data && gridData.totalChunks) { // Handle chunked response if backend sends that
                console.log("Dash: Received chunked grid data for preview, attempting to assemble.");
                const assembledGrid = await assembleChunks(gridData.totalChunks);
                if (assembledGrid) {
                    drawGridPreview(assembledGrid);
                } else {
                    console.error("Dash: Failed to assemble chunks for preview.");
                    adminGridCtx.fillStyle = "red";
                    adminGridCtx.fillRect(0, 0, GRID_PREVIEW_SIZE, GRID_PREVIEW_SIZE);
                    adminGridCtx.fillStyle = "white";
                    adminGridCtx.fillText("Error loading preview", 10, 20);
                }
            }
             else {
                console.error("Dash: Invalid grid data received for preview.", gridData);
                adminGridCtx.fillStyle = "red";
                adminGridCtx.fillRect(0, 0, GRID_PREVIEW_SIZE, GRID_PREVIEW_SIZE);
                adminGridCtx.fillStyle = "white";
                adminGridCtx.fillText("Error loading preview", 10, 20);
            }

        } catch (error) {
            console.error("Dash: Error fetching grid preview:", error);
            adminGridCtx.fillStyle = "rgba(255,0,0,0.5)";
            adminGridCtx.fillRect(0, 0, GRID_PREVIEW_SIZE, GRID_PREVIEW_SIZE);
            adminGridCtx.font = "12px Inter";
            adminGridCtx.fillStyle = "white";
            adminGridCtx.textAlign = "center";
            adminGridCtx.fillText("Error loading preview", GRID_PREVIEW_SIZE / 2, GRID_PREVIEW_SIZE / 2);
        }
    }

    async function assembleChunks(totalChunks) {
        const assembledGrid = Array(500).fill(null).map(() => Array(500).fill("#FFFFFF"));
        try {
            for (let i = 0; i < totalChunks; i++) {
                const response = await fetch(`${BACKEND_URL}/admin/grid-snapshot?chunk=${i}`, {
                     headers: { "Authorization": `Bearer ${userToken}` }
                });
                if (!response.ok) throw new Error(`Failed to fetch chunk ${i}`);
                const chunk = await response.json();
                for (let localRow = 0; localRow < chunk.data.length; localRow++) {
                    const globalRow = chunk.startRow + localRow;
                    if (globalRow < 500) {
                        assembledGrid[globalRow] = chunk.data[localRow];
                    }
                }
            }
            return assembledGrid;
        } catch (error) {
            console.error("Dash: Error assembling chunks:", error);
            return null;
        }
    }


    function drawGridPreview(grid) {
        if (!adminGridCtx || !adminGridCanvas) return;

        adminGridCanvas.width = GRID_PREVIEW_SIZE;
        adminGridCanvas.height = GRID_PREVIEW_SIZE;

        const cellWidth = GRID_PREVIEW_SIZE / 500; // Assuming 500x500 grid
        const cellHeight = GRID_PREVIEW_SIZE / 500;

        for (let y = 0; y < 500; y++) {
            for (let x = 0; x < 500; x++) {
                adminGridCtx.fillStyle = grid[y][x] || "#FFFFFF";
                adminGridCtx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
            }
        }
        console.log("Dash: Grid preview drawn.");
    }

    async function fetchStats() {
        try {
            // Fetch active connections
            const connectionsResponse = await fetch(`${BACKEND_URL}/admin/connections-count`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!connectionsResponse.ok) throw new Error(`Failed to fetch connections count: ${connectionsResponse.status}`);
            const connectionsData = await connectionsResponse.json();
            if (activeConnectionsCountEl) activeConnectionsCountEl.textContent = connectionsData.count !== undefined ? connectionsData.count : "Error";

            // Fetch pixel log
            const pixelLogResponse = await fetch(`${BACKEND_URL}/admin/pixel-log`, {
                headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!pixelLogResponse.ok) throw new Error(`Failed to fetch pixel log: ${pixelLogResponse.status}`);
            const pixelLogData = await pixelLogResponse.json();
            renderPixelLog(pixelLogData.log);

        } catch (error) {
            console.error("Dash: Error fetching stats:", error);
            if (activeConnectionsCountEl) activeConnectionsCountEl.textContent = "Error";
            if (pixelPlacementLogEl) pixelPlacementLogEl.innerHTML = `<p class="text-red-400">Error loading log.</p>`;
        }
    }

    function renderPixelLog(logEntries) {
        if (!pixelPlacementLogEl) return;
        if (!logEntries || logEntries.length === 0) {
            pixelPlacementLogEl.innerHTML = `<p class="text-gray-400">No pixel placements recorded recently.</p>`;
            return;
        }

        pixelPlacementLogEl.innerHTML = logEntries.map(entry => {
            const userDisplay = entry.user ? `${entry.user.username} (${entry.user.id.substring(0,6)}...)` : (entry.sessionId || "Anonymous");
            const timestamp = new Date(entry.timestamp).toLocaleString();
            return `
                <div class="log-item">
                    <strong>[${timestamp}]</strong> User: ${userDisplay}
                    placed <span style="color:${entry.color}; background-color: #2d3748; padding: 0 2px;">${entry.color}</span>
                    at (${entry.x}, ${entry.y})
                    via ${entry.method || 'unknown'}
                </div>`;
        }).join("");
    }

    async function handleAdminAction(endpoint, body, successMessage, method = "POST") {
        try {
            const response = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: method,
                headers: {
                    "Authorization": `Bearer ${userToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });
            const responseData = await response.json();
            if (!response.ok) {
                throw new Error(responseData.message || `Failed action: ${response.status}`);
            }
            alert(responseData.message || successMessage);
            return responseData;
        } catch (error) {
            console.error(`Dash: Error with action ${endpoint}:`, error);
            alert(`Error: ${error.message}`);
            return null;
        }
    }

    async function handleForceDisconnect() {
        const sessionId = disconnectSessionIdInput.value.trim();
        if (!sessionId) {
            alert("Please enter a Session ID.");
            return;
        }
        await handleAdminAction("/admin/disconnect-session", { sessionId }, "Session disconnect request sent.");
        disconnectSessionIdInput.value = "";
    }

    async function handlePushToast() {
        const message = toastMessageInput.value.trim();
        const type = toastTypeSelect.value;
        if (!message) {
            alert("Please enter a toast message.");
            return;
        }
        await handleAdminAction("/admin/toast", { message, type }, "Toast message sent.");
        toastMessageInput.value = "";
    }

    async function handlePushAnnouncement() {
        const message = announcementMessageInput.value.trim();
        // No specific validation for empty, as backend might allow clearing announcement
        await handleAdminAction("/admin/announcement", { announcement: message }, "Announcement updated.");
        // announcementMessageInput.value = ""; // Keep message for potential edits
    }

    async function handleUpdateStatusMessage() {
        const message = statusPageMessageInput.value; // Allow empty to clear
        await handleAdminAction("/admin/status-update", { message }, "Status page message updated.");
    }

    async function toggleGridUpdates(pause) {
        const action = pause ? "pause" : "resume";
        const response = await handleAdminAction("/admin/pause-updates", { pause }, `Grid updates ${action}d.`);
        if (response && response.updatesPaused !== undefined) {
            updateGridUpdateStatusDisplay(response.updatesPaused);
        }
    }

    function updateGridUpdateStatusDisplay(isPaused) {
        if (gridUpdateStatusEl) {
            gridUpdateStatusEl.textContent = `Status: ${isPaused ? "Paused" : "Active"}`;
            gridUpdateStatusEl.className = isPaused ? "text-red-400" : "text-green-400";
        }
        if (pauseUpdatesBtn) pauseUpdatesBtn.disabled = isPaused;
        if (resumeUpdatesBtn) resumeUpdatesBtn.disabled = !isPaused;
    }

    async function fetchGridUpdateStatus() {
        try {
            const response = await fetch(`${BACKEND_URL}/admin/pause-status`, { // Assuming this new endpoint
                 headers: { "Authorization": `Bearer ${userToken}` }
            });
            if (!response.ok) throw new Error("Failed to fetch grid update status");
            const data = await response.json();
            updateGridUpdateStatusDisplay(data.updatesPaused);
        } catch (error) {
            console.error("Dash: Error fetching grid update status:", error);
            if (gridUpdateStatusEl) gridUpdateStatusEl.textContent = "Status: Error";
        }
    }

    async function handleSetPixel() {
        const x = parseInt(gridManipXInput.value);
        const y = parseInt(gridManipYInput.value);
        const color = gridManipColorInput.value;

        if (isNaN(x) || isNaN(y) || x < 0 || x >= 500 || y < 0 || y >= 500) {
            alert("Invalid coordinates. X and Y must be between 0 and 499.");
            return;
        }
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
            alert("Invalid color format. Must be hex #RRGGBB.");
            return;
        }
        await handleAdminAction("/admin/grid-manipulate", { action: "set_pixel", x, y, color }, "Set pixel request sent.");
        fetchAndDrawGridPreview(); // Refresh preview
    }

    async function handleClearPixel() {
        const x = parseInt(gridManipXInput.value);
        const y = parseInt(gridManipYInput.value);
        if (isNaN(x) || isNaN(y) || x < 0 || x >= 500 || y < 0 || y >= 500) {
            alert("Invalid coordinates. X and Y must be between 0 and 499.");
            return;
        }
        await handleAdminAction("/admin/grid-manipulate", { action: "set_pixel", x, y, color: "#FFFFFF" }, "Clear pixel request sent.");
        fetchAndDrawGridPreview(); // Refresh preview
    }

    async function handleClearFullGrid() {
        if (!confirm("Are you sure you want to clear the ENTIRE grid? This cannot be undone easily.")) {
            return;
        }
        await handleAdminAction("/admin/grid-clear", {}, "Full grid clear request sent.", "POST"); // Ensure POST for destructive actions
        fetchAndDrawGridPreview(); // Refresh preview
    }


    async function init() {
        const isAdmin = await checkAdminAuth();
        if (!isAdmin) {
            // checkAdminAuth function handles redirection, so nothing more to do here.
            return;
        }

        setupEventListeners();

        // Initial data fetch
        fetchAndDrawGridPreview();
        fetchStats(); // Also fetches pixel log
        fetchGridUpdateStatus();


        // Periodically update stats (e.g., every 30 seconds)
        setInterval(fetchStats, 30000);
        // No periodic update for preview unless button is pressed to save resources
    }

    init();
});
