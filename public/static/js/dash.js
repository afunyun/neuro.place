/**
 * Admin Dashboard Script - Refactored
 * Uses modular components for WebSocket and Error handling
 * Maintains all existing admin functionality while improving code organization
 */

// Import modules (using dynamic imports for browser compatibility)
let WebSocketManager, ErrorHandler;
let adminWSManager, errorHandler;

// Dashboard constants
const IS_DEV_MODE =
	window.location.hostname === "localhost" ||
	window.location.hostname === "127.0.0.1";

// Dashboard state
let adminData = null;
let pixelLogEntries = [];
const _csrfToken = null;
const MAX_PIXEL_LOG_ENTRIES = 50;
const SANITY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Intervals
let sanityCheckInterval = null;

/**
 * Initialize the admin dashboard
 */
async function init() {
	try {
		console.log("Initializing admin dashboard...");

		// Load modules
		await loadModules();

		// Initialize error handler
		errorHandler = new ErrorHandler({
			defaultTimeout: 5000,
			logToConsole: true,
			errorPrefix: "AdminDash",
		});

		// Set admin user data and validate permissions
		await setAdminUserData();
		console.log("Admin user data set:", adminData);

		// Show dashboard UI
		showDashboard();
		console.log("Dashboard shown");

		// Setup event listeners
		setupEventListeners();
		console.log("Event listeners set up");

		// Initialize WebSocket connection
		initializeWebSocket();
		console.log("WebSocket connection initiated");

		// Start periodic checks
		startSanityCheck();
		console.log("Sanity check started");

		// Fetch initial data
		await fetchGridUpdateStatus();
		console.log("Grid update status fetched");

		// Render initial pixel log
		renderPixelLog(pixelLogEntries);
		console.log("Pixel log rendered");

		console.log("Dashboard initialization completed successfully");
	} catch (error) {
		console.error("Dashboard initialization failed:", error);
		showInitializationError(error);
	}
}

/**
 * Load required modules
 */
async function loadModules() {
	try {
		// Import WebSocket manager
		const wsModule = await import("./websocket-manager.js");
		WebSocketManager = wsModule.default;

		// Import Error handler
		const errorModule = await import("./error-handler.js");
		ErrorHandler = errorModule.default;
	} catch (error) {
		console.error("Failed to load modules:", error);
		throw new Error("Module loading failed");
	}
}

/**
 * Set admin user data and validate permissions
 */
async function setAdminUserData() {
	// Check for token in URL params (OAuth redirect)
	const urlParams = new URLSearchParams(window.location.search);
	const tokenParam = urlParams.get("token");

	if (tokenParam) {
		localStorage.setItem("discord_token", tokenParam);
		window.history.replaceState({}, document.title, window.location.pathname);
	}

	// Get user data from localStorage
	const userData = localStorage.getItem("user_data");

	if (userData) {
		try {
			const user = JSON.parse(userData);
			adminData = {
				isAdmin: true,
				username: user.username || "Admin",
				userId: user.id,
				avatar: user.avatar,
			};
		} catch (e) {
			console.warn("Failed to parse user data:", e);
			adminData = {
				isAdmin: true,
				username: "Admin",
			};
		}
	} else {
		// Default admin data
		adminData = {
			isAdmin: true,
			username: "Admin",
		};
	}

	// Validate admin permissions (this should be done server-side as well)
	const token = localStorage.getItem("discord_token");
	if (token) {
		try {
			await validateAdminPermissions(token);
		} catch (error) {
			console.error("Admin validation failed:", error);
			redirectToLogin();
			throw error;
		}
	}
}

/**
 * Validate admin permissions with server
 */
async function validateAdminPermissions(token) {
	try {
		const response = await fetch("/admin/validate", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			throw new Error("Admin validation failed");
		}

		const data = await response.json();
		return data.isAdmin;
	} catch (error) {
		console.error("Failed to validate admin permissions:", error);
		throw error;
	}
}

/**
 * Initialize WebSocket connection
 */
function initializeWebSocket() {
	const websocketUrl = IS_DEV_MODE
		? `ws://${window.location.host}/ws`
		: `wss://${window.location.host}/ws`;

	const callbacks = {
		onOpen: handleWebSocketOpen,
		onMessage: handleWebSocketMessage,
		onClose: handleWebSocketClose,
		onError: handleWebSocketError,
		onReconnect: handleWebSocketReconnect,
		onReconnectFailed: handleWebSocketReconnectFailed,
	};

	const config = {
		url: websocketUrl,
		maxReconnectAttempts: 5,
		reconnectDelay: 1000,
		pingInterval: 30000,
		isAdmin: true,
	};

	adminWSManager = new WebSocketManager(config, callbacks);
	adminWSManager.connect();
}

/**
 * WebSocket event handlers
 */
function handleWebSocketOpen(_event) {
	console.log("Admin WebSocket connected");

	// Authenticate as admin
	const token = localStorage.getItem("discord_token");
	if (token) {
		adminWSManager.sendMessage({
			type: "authenticate",
			token: token,
			isAdmin: true,
		});
	}

	updateConnectionStatus("connected");
}

function handleWebSocketMessage(data, _event) {
	try {
		switch (data.type) {
			case "pixelUpdate":
				handlePixelUpdate(data);
				break;

			case "activeUsers":
				renderActiveUsers(data.users);
				break;

			case "adminStats":
				updateAdminStats(data.stats);
				break;

			case "gridUpdateStatus":
				updateGridUpdateStatus(data.enabled, data.message);
				break;

			case "announcement":
				handleAnnouncement(data.message);
				break;

			case "error":
				errorHandler.showError(data.message);
				break;

			case "adminResponse":
				handleAdminResponse(data);
				break;

			default:
				console.log("Unknown admin message type:", data.type);
		}
	} catch (error) {
		errorHandler.handleError(error, { type: "admin_websocket_message" });
	}
}

function handleWebSocketClose(_event) {
	console.log("Admin WebSocket disconnected");
	updateConnectionStatus("disconnected");
}

function handleWebSocketError(event) {
	console.error("Admin WebSocket error:", event);
	errorHandler.handleError(event, { type: "admin_websocket" });
	updateConnectionStatus("error");
}

function handleWebSocketReconnect(attempts) {
	console.log(`Admin WebSocket reconnecting... (${attempts})`);
	updateConnectionStatus("reconnecting");
}

function handleWebSocketReconnectFailed() {
	console.error("Admin WebSocket reconnection failed");
	errorHandler.showError("Admin connection lost. Please refresh the page.");
	updateConnectionStatus("failed");
}

/**
 * Data handlers
 */
function handlePixelUpdate(data) {
	const { x, y, color, username, userId, timestamp } = data;

	// Add to pixel log
	const logEntry = {
		x,
		y,
		color,
		username: username || "Anonymous",
		userId,
		timestamp: timestamp || Date.now(),
	};

	// Add to front of array
	pixelLogEntries.unshift(logEntry);

	// Limit entries
	if (pixelLogEntries.length > MAX_PIXEL_LOG_ENTRIES) {
		pixelLogEntries = pixelLogEntries.slice(0, MAX_PIXEL_LOG_ENTRIES);
	}

	// Re-render pixel log
	renderPixelLog(pixelLogEntries);

	// Update admin grid if available
	updateAdminGrid(x, y, color);
}

function handleAnnouncement(message) {
	errorHandler.showInfo(`Server: ${message}`, { timeout: 10000 });
}

function handleAdminResponse(data) {
	if (data.success) {
		errorHandler.showSuccess(data.message || "Action completed successfully");
	} else {
		errorHandler.showError(data.message || "Action failed");
	}
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
	// Grid management buttons
	const clearGridBtn = document.getElementById("clearGridBtn");
	if (clearGridBtn) {
		clearGridBtn.addEventListener("click", () => {
			if (
				confirm(
					"Are you sure you want to clear the entire grid? This cannot be undone.",
				)
			) {
				sendGridUpdate("clear");
			}
		});
	}

	const backupGridBtn = document.getElementById("backupGridBtn");
	if (backupGridBtn) {
		backupGridBtn.addEventListener("click", () => sendGridUpdate("backup"));
	}

	const restoreGridBtn = document.getElementById("restoreGridBtn");
	if (restoreGridBtn) {
		restoreGridBtn.addEventListener("click", () => {
			if (
				confirm(
					"Are you sure you want to restore from backup? Current grid will be lost.",
				)
			) {
				sendGridUpdate("restore");
			}
		});
	}

	// Broadcast message
	const broadcastBtn = document.getElementById("broadcastBtn");
	const broadcastInput = document.getElementById("broadcastMessage");
	if (broadcastBtn && broadcastInput) {
		broadcastBtn.addEventListener("click", () => {
			const message = broadcastInput.value.trim();
			if (message) {
				broadcastMessage(message);
				broadcastInput.value = "";
			}
		});

		broadcastInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				broadcastBtn.click();
			}
		});
	}

	// User management
	const banUserBtn = document.getElementById("banUserBtn");
	const banUserInput = document.getElementById("banUserId");
	if (banUserBtn && banUserInput) {
		banUserBtn.addEventListener("click", () => {
			const userId = banUserInput.value.trim();
			if (userId) {
				handleUserAction("ban", userId);
				banUserInput.value = "";
			}
		});
	}

	const unbanUserBtn = document.getElementById("unbanUserBtn");
	const unbanUserInput = document.getElementById("unbanUserId");
	if (unbanUserBtn && unbanUserInput) {
		unbanUserBtn.addEventListener("click", () => {
			const userId = unbanUserInput.value.trim();
			if (userId) {
				handleUserAction("unban", userId);
				unbanUserInput.value = "";
			}
		});
	}

	// Navigation
	const backToMainBtn = document.getElementById("backToMainBtn");
	if (backToMainBtn) {
		backToMainBtn.addEventListener("click", () => {
			window.location.href = "/";
		});
	}
}

/**
 * Admin action functions
 */
function sendGridUpdate(action, data = {}) {
	if (!adminWSManager || !adminWSManager.isConnected()) {
		errorHandler.showError("Not connected to server");
		return;
	}

	adminWSManager.sendMessage({
		type: "gridUpdate",
		action,
		data,
		timestamp: Date.now(),
	});

	errorHandler.showInfo(`Grid ${action} initiated...`);
}

function broadcastMessage(message) {
	if (!adminWSManager || !adminWSManager.isConnected()) {
		errorHandler.showError("Not connected to server");
		return;
	}

	adminWSManager.sendMessage({
		type: "broadcast",
		message,
		timestamp: Date.now(),
	});

	errorHandler.showSuccess("Broadcast message sent");
}

function handleUserAction(action, userId) {
	if (!adminWSManager || !adminWSManager.isConnected()) {
		errorHandler.showError("Not connected to server");
		return;
	}

	adminWSManager.sendMessage({
		type: "userAction",
		action,
		userId,
		timestamp: Date.now(),
	});

	errorHandler.showInfo(`User ${action} action sent for ${userId}`);
}

/**
 * UI update functions
 */
function showDashboard() {
	const loadingScreen = document.getElementById("loadingScreen");
	const dashboardContainer = document.getElementById("dashboardContainer");

	if (loadingScreen) {
		loadingScreen.style.display = "none";
	}

	if (dashboardContainer) {
		dashboardContainer.classList.add("loaded");
		dashboardContainer.style.visibility = "visible";
	}

	// Update admin info display
	updateAdminInfo();
}

function updateAdminInfo() {
	const adminUsername = document.getElementById("adminUsername");
	if (adminUsername && adminData) {
		adminUsername.textContent = adminData.username;
	}

	const adminAvatar = document.getElementById("adminAvatar");
	if (adminAvatar && adminData && adminData.avatar) {
		adminAvatar.src = adminData.avatar;
		adminAvatar.style.display = "block";
	}
}

function renderPixelLog(entries) {
	const pixelLogContainer = document.getElementById("pixelLogContainer");
	if (!pixelLogContainer) return;

	pixelLogContainer.innerHTML = "";

	entries.forEach((entry, index) => {
		const logElement = document.createElement("div");
		logElement.className = "pixel-log-entry";
		if (index === 0) logElement.classList.add("new");

		const colorDiv = document.createElement("div");
		colorDiv.className = "pixel-color";
		colorDiv.style.backgroundColor = entry.color;

		const coords = document.createElement("span");
		coords.className = "pixel-coords";
		coords.textContent = `(${entry.x}, ${entry.y})`;

		const username = document.createElement("span");
		username.textContent = entry.username;

		const timestamp = document.createElement("span");
		timestamp.className = "pixel-timestamp";
		timestamp.textContent = new Date(entry.timestamp).toLocaleTimeString();

		logElement.appendChild(colorDiv);
		logElement.appendChild(coords);
		logElement.appendChild(username);
		logElement.appendChild(timestamp);

		pixelLogContainer.appendChild(logElement);
	});
}

function renderActiveUsers(users) {
	const activeUsersContainer = document.getElementById("activeUsersContainer");
	if (!activeUsersContainer) return;

	activeUsersContainer.innerHTML = "";

	if (!users || users.length === 0) {
		activeUsersContainer.innerHTML =
			'<p class="text-center text-muted">No active users</p>';
		return;
	}

	users.forEach((user) => {
		const userElement = document.createElement("div");
		userElement.className = "active-user";

		if (user.avatar) {
			const avatar = document.createElement("img");
			avatar.className = "user-avatar";
			avatar.src = user.avatar;
			avatar.alt = user.username;
			userElement.appendChild(avatar);
		}

		const userInfo = document.createElement("div");
		userInfo.className = "user-info";

		const userName = document.createElement("div");
		userName.className = "user-name";
		userName.textContent = user.username;

		const userDetails = document.createElement("div");
		userDetails.className = "user-device";
		userDetails.textContent = `${user.deviceType || "unknown"} • ${user.id || "N/A"}`;

		userInfo.appendChild(userName);
		userInfo.appendChild(userDetails);
		userElement.appendChild(userInfo);

		activeUsersContainer.appendChild(userElement);
	});

	// Update user count
	const userCountElement = document.getElementById("activeUserCount");
	if (userCountElement) {
		userCountElement.textContent = users.length;
	}
}

function updateAdminStats(stats) {
	// Update various stat displays
	const statsElements = {
		totalPixels: document.getElementById("totalPixelsCount"),
		activeUsers: document.getElementById("activeUsersCount"),
		gridUpdates: document.getElementById("gridUpdatesCount"),
		serverUptime: document.getElementById("serverUptime"),
	};

	if (stats.totalPixels && statsElements.totalPixels) {
		statsElements.totalPixels.textContent = stats.totalPixels.toLocaleString();
	}

	if (stats.activeUsers && statsElements.activeUsers) {
		statsElements.activeUsers.textContent = stats.activeUsers;
	}

	if (stats.gridUpdates && statsElements.gridUpdates) {
		statsElements.gridUpdates.textContent = stats.gridUpdates;
	}

	if (stats.uptime && statsElements.serverUptime) {
		statsElements.serverUptime.textContent = formatUptime(stats.uptime);
	}
}

function updateGridUpdateStatus(enabled, message) {
	const statusIndicator = document.getElementById("gridUpdateStatus");
	const statusMessage = document.getElementById("gridUpdateMessage");

	if (statusIndicator) {
		statusIndicator.className = `status-indicator ${enabled ? "status-active" : "status-paused"}`;
	}

	if (statusMessage) {
		statusMessage.textContent =
			message || (enabled ? "Grid updates enabled" : "Grid updates disabled");
	}
}

function updateConnectionStatus(status) {
	const connectionStatus = document.getElementById("connectionStatus");
	if (!connectionStatus) return;

	const statusClasses = {
		connected: "status-active",
		disconnected: "status-warning",
		reconnecting: "status-warning",
		error: "status-warning",
		failed: "status-warning",
	};

	const statusTexts = {
		connected: "Connected",
		disconnected: "Disconnected",
		reconnecting: "Reconnecting...",
		error: "Connection Error",
		failed: "Connection Failed",
	};

	connectionStatus.className = `status-indicator ${statusClasses[status] || "status-warning"}`;

	const statusText = document.getElementById("connectionStatusText");
	if (statusText) {
		statusText.textContent = statusTexts[status] || "Unknown";
	}
}

function updateAdminGrid(x, y, color) {
	const adminGridCanvas = document.getElementById("adminGridCanvas");
	if (!adminGridCanvas) return;

	const ctx = adminGridCanvas.getContext("2d");
	if (!ctx) return;

	// Simple pixel update for admin preview
	const pixelSize = 1; // Small pixels for overview
	ctx.fillStyle = color;
	ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
}

/**
 * Data fetching functions
 */
async function fetchGridUpdateStatus() {
	try {
		const token = localStorage.getItem("discord_token");
		const response = await fetch("/admin/grid-status", {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (response.ok) {
			const data = await response.json();
			updateGridUpdateStatus(data.enabled, data.message);
		}
	} catch (error) {
		console.error("Failed to fetch grid update status:", error);
		errorHandler.handleError(error, {
			type: "grid_status_fetch",
			showToUser: false,
		});
	}
}

/**
 * Utility functions
 */
function formatUptime(seconds) {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (days > 0) {
		return `${days}d ${hours}h ${minutes}m`;
	} else if (hours > 0) {
		return `${hours}h ${minutes}m`;
	} else {
		return `${minutes}m`;
	}
}

function startSanityCheck() {
	sanityCheckInterval = setInterval(() => {
		if (adminWSManager && !adminWSManager.isConnected()) {
			console.log(
				"Sanity check: WebSocket disconnected, attempting reconnection",
			);
			adminWSManager.connect();
		}
	}, SANITY_CHECK_INTERVAL);
}

function showInitializationError(error) {
	const loadingScreen = document.getElementById("loadingScreen");
	if (loadingScreen) {
		loadingScreen.innerHTML = `
            <div class="loading-content">
                <p style="color: var(--error);">Failed to initialize dashboard: ${error.message}</p>
                <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 10px;">Retry</button>
                <button onclick="window.location.href='/'" class="btn btn-secondary" style="margin-top: 10px; margin-left: 10px;">Go Back</button>
            </div>
        `;
	}

	// Auto-redirect after 5 seconds
	setTimeout(() => {
		redirectToLogin();
	}, 5000);
}

function redirectToLogin() {
	// Clear admin credentials and redirect
	localStorage.removeItem("discord_token");
	localStorage.removeItem("user_data");
	window.location.href = "/";
}

// Cleanup function
function cleanup() {
	if (sanityCheckInterval) {
		clearInterval(sanityCheckInterval);
	}

	if (adminWSManager) {
		adminWSManager.destroy();
	}
}

// Handle page unload
window.addEventListener("beforeunload", cleanup);

// Initialize dashboard when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
