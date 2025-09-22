/**
 * Main Application Script - Refactored
 * Uses modular components for WebSocket, Canvas, and Error handling
 * Maintains all existing functionality while improving code organization
 */

// Import modules (using dynamic imports for browser compatibility)
let WebSocketManager, CanvasManager, ErrorHandler;
let wsManager, canvasManager, errorHandler;

// Application constants
const BACKEND_URL = `${window.location.origin}`;
const IS_DEV_MODE =
	window.location.hostname === "localhost" ||
	window.location.hostname === "127.0.0.1";
const OAUTH_CLIENT_ID = "1388712213002457118";
const OAUTH_REDIRECT_URI = `${window.location.origin}/callback`;

const PIXEL_SIZE = 10;
const LIVE_VIEW_PIXEL_SIZE_FACTOR = 2;
const _LIVE_VIEW_CANVAS_WIDTH = 500 / LIVE_VIEW_PIXEL_SIZE_FACTOR;
const _LIVE_VIEW_CANVAS_HEIGHT = 500 / LIVE_VIEW_PIXEL_SIZE_FACTOR;
const CLICK_THRESHOLD = 5;
const GRID_WIDTH = 500;
const GRID_HEIGHT = 500;

// Application state
let currentColor;
let grid = [];
const selectedPixel = { x: null, y: null };
let userToken = localStorage.getItem("discord_token");
let userData = JSON.parse(localStorage.getItem("user_data") || "null");

// Canvas and UI state
let scale = 1.0;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let lastDragPos = { x: 0, y: 0 };

// Fallback mode state
let fallbackMode = false;
let fallbackPollingInterval = null;
let _lastUpdateTime = 0;
const FALLBACK_POLL_INTERVAL = 2000;

// Session management
const _sessionId = generateSessionId();

// DOM element references
let canvas, highlightCanvas, liveViewCanvas;
let colorPicker, customColorSwatch, placePixelBtn, selectedCoordsDisplay;
let zoomInBtn, zoomOutBtn, themeToggleBtn;

/**
 * Initialize the application
 */
async function init() {
	try {
		// Load modules dynamically
		await loadModules();

		// Initialize error handler first
		errorHandler = new ErrorHandler({
			defaultTimeout: 5000,
			logToConsole: true,
			errorPrefix: "NeuroPlace",
		});

		// Setup early theme toggle
		setupEarlyThemeToggle();

		// Get DOM elements
		getDOMElements();

		// Initialize canvas manager
		initializeCanvasManager();

		// Initialize WebSocket manager
		initializeWebSocketManager();

		// Setup event listeners
		setupEventListeners();

		// Initialize UI state
		initializeUIState();

		// Setup fallback if needed
		setupFallbackMode();

		// Initial canvas render
		const viewport = { offsetX, offsetY, scale };
		if (grid && grid.length > 0) {
			canvasManager.redrawAll(
				grid,
				viewport,
				selectedPixel,
				"var(--accent, orange)",
			);
		} else {
			canvasManager.drawGrid(viewport);
		}

		console.log("Application initialized successfully");
	} catch (error) {
		console.error("Failed to initialize application:", error);
		if (errorHandler) {
			errorHandler.handleError(error, { type: "initialization" });
		} else {
			alert("Failed to load application. Please refresh the page.");
		}
	}
}

/**
 * Load modules dynamically
 */
async function loadModules() {
	try {
		// Import WebSocket manager
		const wsModule = await import("./websocket-manager.js");
		WebSocketManager = wsModule.default;

		// Import Canvas manager
		const canvasModule = await import("./canvas-manager.js");
		CanvasManager = canvasModule.default;

		// Import Error handler
		const errorModule = await import("./error-handler.js");
		ErrorHandler = errorModule.default;
	} catch (error) {
		console.error("Failed to load modules:", error);
		throw new Error("Module loading failed");
	}
}

/**
 * Setup early theme toggle before full initialization
 */
function setupEarlyThemeToggle() {
	const earlyThemeToggleBtn = document.getElementById("themeToggleBtn");
	if (earlyThemeToggleBtn) {
		console.log("Found theme toggle button early");
		const savedTheme = localStorage.getItem("theme");
		if (savedTheme === "dark") {
			document.documentElement.classList.add("dark");
			const icon = earlyThemeToggleBtn.querySelector(".material-icons-round");
			if (icon) icon.textContent = "light_mode";
		}
	} else {
		console.log("Theme toggle button not found early");
	}
}

/**
 * Get DOM element references
 */
function getDOMElements() {
	canvas = document.getElementById("neuroCanvas");
	highlightCanvas = document.getElementById("neuroHighlightCanvas");
	liveViewCanvas = document.getElementById("liveViewCanvas");

	colorPicker = document.getElementById("colorPicker");
	customColorSwatch = document.getElementById("customColorSwatch");
	placePixelBtn = document.getElementById("placePixelBtn");
	selectedCoordsDisplay = document.getElementById("selectedCoords");
	zoomInBtn = document.getElementById("zoomInBtn");
	zoomOutBtn = document.getElementById("zoomOutBtn");
	themeToggleBtn = document.getElementById("themeToggleBtn");

	if (!canvas || !colorPicker) {
		throw new Error("Required DOM elements not found");
	}

	currentColor = colorPicker.value;
}

/**
 * Initialize canvas manager
 */
function initializeCanvasManager() {
	const canvasElements = {
		mainCanvas: canvas,
		highlightCanvas: highlightCanvas,
		liveViewCanvas: liveViewCanvas,
	};

	const canvasConfig = {
		gridWidth: GRID_WIDTH,
		gridHeight: GRID_HEIGHT,
		pixelSize: PIXEL_SIZE,
		liveViewPixelSizeFactor: LIVE_VIEW_PIXEL_SIZE_FACTOR,
	};

	canvasManager = new CanvasManager(canvasElements, canvasConfig);
}

/**
 * Initialize WebSocket manager
 */
function initializeWebSocketManager() {
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
		maxReconnectAttempts: 3,
		reconnectDelay: 1000,
		pingInterval: 30000,
		isAdmin: false,
	};

	wsManager = new WebSocketManager(config, callbacks);
	wsManager.connect();
}

/**
 * WebSocket event handlers
 */
function handleWebSocketOpen(_event) {
	console.log("WebSocket connected");
	fallbackMode = false;

	if (fallbackPollingInterval) {
		clearInterval(fallbackPollingInterval);
		fallbackPollingInterval = null;
	}

	// Authenticate if we have a token
	if (userToken) {
		wsManager.sendMessage({
			type: "authenticate",
			token: userToken,
		});
	}

	// Request initial grid data
	fetchGridData();
}

function handleWebSocketMessage(data, _event) {
	try {
		switch (data.type) {
			case "gridData":
				handleGridData(data.grid);
				break;

			case "pixelUpdate":
				handlePixelUpdate(data);
				break;

			case "activeUsers":
				handleActiveUsers(data.users);
				break;

			case "announcement":
				handleAnnouncement(data.message);
				break;

			case "rateLimit":
				handleRateLimit(data.message);
				break;

			case "error":
				errorHandler.showError(data.message);
				break;

			default:
				console.log("Unknown message type:", data.type);
		}
	} catch (error) {
		errorHandler.handleError(error, { type: "websocket_message" });
	}
}

function handleWebSocketClose(event) {
	console.log("WebSocket disconnected");

	if (!event.wasClean && !fallbackMode) {
		setupFallbackMode();
	}
}

function handleWebSocketError(event) {
	console.error("WebSocket error:", event);
	errorHandler.handleError(event, { type: "websocket" });
}

function handleWebSocketReconnect(attempts) {
	console.log(`Reconnecting... (${attempts})`);
	errorHandler.showInfo(`Reconnecting... (${attempts})`, { timeout: 2000 });
}

function handleWebSocketReconnectFailed() {
	console.error("WebSocket reconnection failed");
	errorHandler.showError("Connection lost. Switching to fallback mode.");
	setupFallbackMode();
}

/**
 * Setup fallback polling mode
 */
function setupFallbackMode() {
	if (fallbackMode) return;

	fallbackMode = true;
	console.log("Enabling fallback mode");

	fallbackPollingInterval = setInterval(() => {
		fetchGridData();
	}, FALLBACK_POLL_INTERVAL);
}

/**
 * Data handlers
 */
function handleGridData(gridData) {
	if (!gridData) return;

	grid = gridData;
	_lastUpdateTime = Date.now();

	canvasManager.drawFullOffscreenGrid(grid);

	const viewport = { offsetX, offsetY, scale };
	canvasManager.redrawAll(
		grid,
		viewport,
		selectedPixel,
		"var(--accent, orange)",
	);
}

function handlePixelUpdate(data) {
	const { x, y, color, username, timestamp } = data;

	// Update grid
	if (!grid[y]) grid[y] = [];
	grid[y][x] = color;

	// Update canvas
	canvasManager.drawPixelToOffscreen(x, y, color);
	const viewport = { offsetX, offsetY, scale };
	canvasManager.drawGrid(viewport);
	canvasManager.drawLiveViewGrid(grid);

	// Add to pixel log
	addToPixelLog({ x, y, color, username, timestamp });

	// Update live view
	canvasManager.drawLiveViewGrid(grid);
}

function handleActiveUsers(users) {
	updateActiveUsersDisplay(users);
}

function handleAnnouncement(message) {
	errorHandler.showInfo(message, { timeout: 10000 });
}

function handleRateLimit(message) {
	errorHandler.showPixelError(
		message || "Slow down! You're placing pixels too quickly.",
	);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
	// Canvas interaction
	if (canvas) {
		canvas.addEventListener("click", handleCanvasClick);
		canvas.addEventListener("mousemove", handleCanvasMouseMove);
		canvas.addEventListener("mousedown", handleMouseDown);
		canvas.addEventListener("mouseup", handleMouseUp);
		canvas.addEventListener("wheel", handleWheel);

		// Touch events
		canvas.addEventListener("touchstart", handleTouchStart);
		canvas.addEventListener("touchmove", handleTouchMove);
		canvas.addEventListener("touchend", handleTouchEnd);
	}

	// Color picker
	if (colorPicker) {
		colorPicker.addEventListener("input", (e) => {
			currentColor = e.target.value;
			if (customColorSwatch) {
				customColorSwatch.style.backgroundColor = currentColor;
			}
		});
	}

	// Pixel placement button
	if (placePixelBtn) {
		placePixelBtn.addEventListener("click", () => {
			if (selectedPixel.x !== null && selectedPixel.y !== null) {
				placePixel(selectedPixel.x, selectedPixel.y, currentColor);
			}
		});
	}

	// Zoom controls
	if (zoomInBtn) {
		zoomInBtn.addEventListener("click", () => zoomIn());
	}
	if (zoomOutBtn) {
		zoomOutBtn.addEventListener("click", () => zoomOut());
	}

	// Theme toggle
	if (themeToggleBtn) {
		themeToggleBtn.addEventListener("click", toggleTheme);
	}

	// Keyboard controls
	document.addEventListener("keydown", handleKeyDown);

	// Window resize
	window.addEventListener("resize", handleResize);

	// Global OAuth functions
	window.initiateDiscordOAuth = initiateDiscordOAuth;
	window.logout = logout;
	window.handleOAuthCallback = handleOAuthCallback;
}

/**
 * Canvas interaction handlers
 */
function handleCanvasClick(event) {
	const rect = canvas.getBoundingClientRect();
	const canvasX = event.clientX - rect.left;
	const canvasY = event.clientY - rect.top;

	const gridCoords = canvasManager.canvasToGrid(canvasX, canvasY, {
		offsetX,
		offsetY,
		scale,
	});

	if (canvasManager.isValidCoordinate(gridCoords.x, gridCoords.y)) {
		selectedPixel.x = gridCoords.x;
		selectedPixel.y = gridCoords.y;

		updateSelectedCoordsDisplay();

		const viewport = { offsetX, offsetY, scale };
		canvasManager.drawHighlight(
			viewport,
			selectedPixel,
			"var(--accent, orange)",
		);

		// Auto-place pixel if authenticated
		if (userToken && userData) {
			placePixel(gridCoords.x, gridCoords.y, currentColor);
		}
	}
}

function handleCanvasMouseMove(event) {
	if (isDragging) {
		const deltaX = event.clientX - lastDragPos.x;
		const deltaY = event.clientY - lastDragPos.y;

		offsetX += deltaX;
		offsetY += deltaY;

		lastDragPos = { x: event.clientX, y: event.clientY };

		const viewport = { offsetX, offsetY, scale };
		canvasManager.redrawAll(
			grid,
			viewport,
			selectedPixel,
			"var(--accent, orange)",
		);
	}
}

function handleMouseDown(event) {
	if (event.button === 0) {
		// Left click only
		isDragging = true;
		lastDragPos = { x: event.clientX, y: event.clientY };
		canvas.style.cursor = "grabbing";
	}
}

function handleMouseUp(event) {
	if (event.button === 0) {
		isDragging = false;
		canvas.style.cursor = "crosshair";
	}
}

function handleWheel(event) {
	event.preventDefault();

	const rect = canvas.getBoundingClientRect();
	const mouseX = event.clientX - rect.left;
	const mouseY = event.clientY - rect.top;

	const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
	zoom(zoomFactor, mouseX, mouseY);
}

// Touch event handlers for mobile support
let touchStartDistance = 0;
let touchStartPos = { x: 0, y: 0 };

function handleTouchStart(event) {
	event.preventDefault();

	if (event.touches.length === 1) {
		// Single touch - start drag
		const touch = event.touches[0];
		const rect = canvas.getBoundingClientRect();
		touchStartPos = {
			x: touch.clientX - rect.left,
			y: touch.clientY - rect.top,
		};
		lastDragPos = { x: touch.clientX, y: touch.clientY };
		isDragging = true;
	} else if (event.touches.length === 2) {
		// Two touches - start pinch zoom
		const touch1 = event.touches[0];
		const touch2 = event.touches[1];
		touchStartDistance = Math.hypot(
			touch2.clientX - touch1.clientX,
			touch2.clientY - touch1.clientY,
		);
		isDragging = false;
	}
}

function handleTouchMove(event) {
	event.preventDefault();

	if (event.touches.length === 1 && isDragging) {
		// Single touch drag
		const touch = event.touches[0];
		const deltaX = touch.clientX - lastDragPos.x;
		const deltaY = touch.clientY - lastDragPos.y;

		offsetX += deltaX;
		offsetY += deltaY;

		lastDragPos = { x: touch.clientX, y: touch.clientY };

		const viewport = { offsetX, offsetY, scale };
		canvasManager.redrawAll(
			grid,
			viewport,
			selectedPixel,
			"var(--accent, orange)",
		);
	} else if (event.touches.length === 2) {
		// Pinch zoom
		const touch1 = event.touches[0];
		const touch2 = event.touches[1];
		const currentDistance = Math.hypot(
			touch2.clientX - touch1.clientX,
			touch2.clientY - touch1.clientY,
		);

		if (touchStartDistance > 0) {
			const zoomFactor = currentDistance / touchStartDistance;
			const centerX = (touch1.clientX + touch2.clientX) / 2;
			const centerY = (touch1.clientY + touch2.clientY) / 2;

			const rect = canvas.getBoundingClientRect();
			zoom(zoomFactor, centerX - rect.left, centerY - rect.top);

			touchStartDistance = currentDistance;
		}
	}
}

function handleTouchEnd(event) {
	event.preventDefault();

	if (event.touches.length === 0) {
		isDragging = false;
		touchStartDistance = 0;

		// Handle tap for pixel selection
		if (event.changedTouches.length === 1) {
			const touch = event.changedTouches[0];
			const rect = canvas.getBoundingClientRect();
			const canvasX = touch.clientX - rect.left;
			const canvasY = touch.clientY - rect.top;

			// Check if this was a tap (not a drag)
			const dragDistance = Math.hypot(
				canvasX - touchStartPos.x,
				canvasY - touchStartPos.y,
			);

			if (dragDistance < CLICK_THRESHOLD) {
				const gridCoords = canvasManager.canvasToGrid(canvasX, canvasY, {
					offsetX,
					offsetY,
					scale,
				});

				if (canvasManager.isValidCoordinate(gridCoords.x, gridCoords.y)) {
					selectedPixel.x = gridCoords.x;
					selectedPixel.y = gridCoords.y;

					updateSelectedCoordsDisplay();

					const viewport = { offsetX, offsetY, scale };
					canvasManager.drawHighlight(
						viewport,
						selectedPixel,
						"var(--accent, orange)",
					);
				}
			}
		}
	}
}

/**
 * Zoom and pan functions
 */
function zoom(factor, centerX, centerY) {
	const newScale = Math.max(0.1, Math.min(10, scale * factor));

	if (newScale !== scale) {
		// Adjust offset to zoom towards the center point
		offsetX = centerX - (centerX - offsetX) * (newScale / scale);
		offsetY = centerY - (centerY - offsetY) * (newScale / scale);

		scale = newScale;

		const viewport = { offsetX, offsetY, scale };
		canvasManager.redrawAll(
			grid,
			viewport,
			selectedPixel,
			"var(--accent, orange)",
		);
	}
}

function zoomIn() {
	const centerX = canvas.width / 2;
	const centerY = canvas.height / 2;
	zoom(1.2, centerX, centerY);
}

function zoomOut() {
	const centerX = canvas.width / 2;
	const centerY = canvas.height / 2;
	zoom(0.8, centerX, centerY);
}

/**
 * Keyboard controls
 */
function handleKeyDown(event) {
	switch (event.key) {
		case " ":
		case "Enter":
			event.preventDefault();
			if (selectedPixel.x !== null && selectedPixel.y !== null) {
				placePixel(selectedPixel.x, selectedPixel.y, currentColor);
			}
			break;

		case "ArrowUp":
			event.preventDefault();
			moveSelection(0, -1);
			break;

		case "ArrowDown":
			event.preventDefault();
			moveSelection(0, 1);
			break;

		case "ArrowLeft":
			event.preventDefault();
			moveSelection(-1, 0);
			break;

		case "ArrowRight":
			event.preventDefault();
			moveSelection(1, 0);
			break;

		case "Escape":
			closeModals();
			break;
	}
}

function moveSelection(deltaX, deltaY) {
	if (selectedPixel.x === null || selectedPixel.y === null) {
		selectedPixel.x = Math.floor(GRID_WIDTH / 2);
		selectedPixel.y = Math.floor(GRID_HEIGHT / 2);
	} else {
		selectedPixel.x = Math.max(
			0,
			Math.min(GRID_WIDTH - 1, selectedPixel.x + deltaX),
		);
		selectedPixel.y = Math.max(
			0,
			Math.min(GRID_HEIGHT - 1, selectedPixel.y + deltaY),
		);
	}

	updateSelectedCoordsDisplay();

	const viewport = { offsetX, offsetY, scale };
	canvasManager.drawHighlight(viewport, selectedPixel, "var(--accent, orange)");
}

/**
 * Pixel placement
 */
async function placePixel(x, y, color) {
	if (!canvasManager.isValidCoordinate(x, y)) {
		errorHandler.showPixelError("Invalid pixel coordinates");
		return;
	}

	if (!userToken) {
		errorHandler.showPixelError("Please log in to place pixels");
		return;
	}

	try {
		if (wsManager.isConnected()) {
			// Send via WebSocket
			wsManager.sendMessage({
				type: "placePixel",
				x: x,
				y: y,
				color: color,
			});
		} else {
			// Send via HTTP in fallback mode
			await sendPixelViaHTTP(x, y, color);
		}
	} catch (error) {
		console.error("Error placing pixel:", error);
		errorHandler.showPixelError(`Failed to place pixel: ${error.message}`);
	}
}

async function sendPixelViaHTTP(x, y, color) {
	const response = await fetch(`${BACKEND_URL}/place-pixel`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${userToken}`,
		},
		body: JSON.stringify({ x, y, color }),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(error || "Failed to place pixel");
	}
}

/**
 * UI update functions
 */
function updateSelectedCoordsDisplay() {
	if (selectedCoordsDisplay) {
		if (selectedPixel.x !== null && selectedPixel.y !== null) {
			selectedCoordsDisplay.textContent = `(${selectedPixel.x}, ${selectedPixel.y})`;
		} else {
			selectedCoordsDisplay.textContent = "(---, ---)";
		}
	}
}

function addToPixelLog(pixelData) {
	const pixelChatLog = document.getElementById("pixelChatLog");
	if (!pixelChatLog) return;

	const entry = document.createElement("div");
	entry.className = "pixel-log-entry";

	const colorDiv = document.createElement("div");
	colorDiv.className = "pixel-color";
	colorDiv.style.backgroundColor = pixelData.color;

	const coords = document.createElement("span");
	coords.className = "pixel-coords";
	coords.textContent = `(${pixelData.x}, ${pixelData.y})`;

	const username = document.createElement("span");
	username.textContent = pixelData.username || "Anonymous";

	const timestamp = document.createElement("span");
	timestamp.className = "pixel-timestamp";
	timestamp.textContent = new Date(pixelData.timestamp).toLocaleTimeString();

	entry.appendChild(colorDiv);
	entry.appendChild(coords);
	entry.appendChild(username);
	entry.appendChild(timestamp);

	pixelChatLog.insertBefore(entry, pixelChatLog.firstChild);

	// Limit entries
	while (pixelChatLog.children.length > 100) {
		pixelChatLog.removeChild(pixelChatLog.lastChild);
	}
}

function updateActiveUsersDisplay(users) {
	const activeUsersContainer = document.getElementById("activeUsersContainer");
	if (!activeUsersContainer) return;

	activeUsersContainer.innerHTML = "";

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

		const userDevice = document.createElement("div");
		userDevice.className = "user-device";
		userDevice.textContent = user.deviceType || "unknown";

		userInfo.appendChild(userName);
		userInfo.appendChild(userDevice);
		userElement.appendChild(userInfo);

		activeUsersContainer.appendChild(userElement);
	});
}

/**
 * Theme management
 */
function toggleTheme() {
	const isDark = document.documentElement.classList.toggle("dark");
	localStorage.setItem("theme", isDark ? "dark" : "light");

	if (themeToggleBtn) {
		const icon = themeToggleBtn.querySelector(".material-icons-round");
		if (icon) {
			icon.textContent = isDark ? "light_mode" : "dark_mode";
		}
	}
}

/**
 * Authentication functions
 */
function initiateDiscordOAuth() {
	const scopes = "identify+email";
	const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}&response_type=code&scope=${scopes}`;
	window.location.href = oauthUrl;
}

function logout() {
	localStorage.removeItem("discord_token");
	localStorage.removeItem("user_data");
	userToken = null;
	userData = null;
	window.location.reload();
}

function handleOAuthCallback() {
	// This function is called from oauth-callback.js
	const token = localStorage.getItem("discord_token");
	const user = localStorage.getItem("user_data");

	if (token && user) {
		userToken = token;
		userData = JSON.parse(user);

		// Re-authenticate with WebSocket if connected
		if (wsManager?.isConnected()) {
			wsManager.sendMessage({
				type: "authenticate",
				token: userToken,
			});
		}
	}
}

/**
 * Data fetching
 */
async function fetchGridData() {
	try {
		const response = await fetch(`${BACKEND_URL}/grid`);
		if (response.ok) {
			const data = await response.json();
			handleGridData(data.grid);
		}
	} catch (error) {
		console.error("Failed to fetch grid data:", error);
		// Try to load backup data as fallback
		try {
			await loadBackupGridData();
		} catch (backupError) {
			console.error("Failed to load backup grid data:", backupError);
		}

		if (fallbackMode) {
			errorHandler.handleError(error, {
				type: "grid_fetch",
				showToUser: false,
			});
		}
	}
}

/**
 * Load backup grid data as fallback
 */
async function loadBackupGridData() {
	try {
		const response = await fetch("/grid-backup-2025-09-21.json");
		if (response.ok) {
			const backupData = await response.json();
			if (backupData.data && Array.isArray(backupData.data)) {
				console.log("Loading backup grid data...");
				handleGridData(backupData.data);
				errorHandler.showInfo("Loaded from backup data", { timeout: 3000 });
			}
		}
	} catch (error) {
		console.error("Failed to load backup grid data:", error);
	}
}

/**
 * Utility functions
 */
function generateSessionId() {
	return `session_${Math.random().toString(36).substring(2, 11)}${Date.now().toString(36)}`;
}

function closeModals() {
	// Close any open modals
	const modals = document.querySelectorAll(".modal-overlay.active");
	modals.forEach((modal) => {
		modal.classList.remove("active");
	});
}

function handleResize() {
	if (canvasManager) {
		canvasManager.handleResize();
		const viewport = { offsetX, offsetY, scale };
		canvasManager.redrawAll(
			grid,
			viewport,
			selectedPixel,
			"var(--accent, orange)",
		);
	}
}

function initializeUIState() {
	// Set initial color swatch
	if (customColorSwatch && colorPicker) {
		customColorSwatch.style.backgroundColor = currentColor;
	}

	// Update coordinates display
	updateSelectedCoordsDisplay();

	// Load saved theme
	const savedTheme = localStorage.getItem("theme");
	if (savedTheme === "dark") {
		document.documentElement.classList.add("dark");
	}
}

// Start application when DOM is loaded
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
