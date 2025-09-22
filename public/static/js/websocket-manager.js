/**
 * WebSocket Manager Module
 * Consolidates WebSocket functionality for both main app and admin dashboard
 * Provides consistent connection management, reconnection logic, and message handling
 */

/**
 * @typedef {Object} WebSocketConfig
 * @property {string} url - WebSocket URL
 * @property {number} maxReconnectAttempts - Maximum reconnection attempts
 * @property {number} reconnectDelay - Base delay between reconnection attempts
 * @property {number} pingInterval - Interval for ping messages (ms)
 * @property {boolean} isAdmin - Whether this is an admin connection
 */

/**
 * @typedef {Object} WebSocketCallbacks
 * @property {Function} onOpen - Called when connection opens
 * @property {Function} onMessage - Called when message received
 * @property {Function} onClose - Called when connection closes
 * @property {Function} onError - Called when error occurs
 * @property {Function} onReconnect - Called when reconnection starts
 * @property {Function} onReconnectFailed - Called when all reconnection attempts fail
 */

class WebSocketManager {
	/**
	 * Create a WebSocket manager instance
	 * @param {WebSocketConfig} config - Configuration options
	 * @param {WebSocketCallbacks} callbacks - Event callbacks
	 */
	constructor(config, callbacks) {
		this.config = {
			maxReconnectAttempts: 5,
			reconnectDelay: 1000,
			pingInterval: 30000,
			isAdmin: false,
			...config,
		};

		this.callbacks = {
			onOpen: () => {},
			onMessage: () => {},
			onClose: () => {},
			onError: () => {},
			onReconnect: () => {},
			onReconnectFailed: () => {},
			...callbacks,
		};

		this.socket = null;
		this.reconnectAttempts = 0;
		this.reconnectTimeout = null;
		this.pingInterval = null;
		this.isConnecting = false;
		this.isDestroyed = false;
		this.lastPingTime = 0;
		this.connectionStartTime = 0;
	}

	/**
	 * Connect to the WebSocket server
	 */
	connect() {
		if (this.isDestroyed) {
			console.warn("WebSocketManager: Attempted to connect after destruction");
			return;
		}

		if (
			this.isConnecting ||
			(this.socket && this.socket.readyState === WebSocket.CONNECTING)
		) {
			console.log("WebSocketManager: Connection already in progress");
			return;
		}

		this.isConnecting = true;
		this.connectionStartTime = Date.now();

		try {
			console.log(
				`WebSocketManager: Connecting to ${this.config.url}${this.config.isAdmin ? " (Admin)" : ""}`,
			);
			this.socket = new WebSocket(this.config.url);
			this.setupEventHandlers();
		} catch (error) {
			console.error(
				"WebSocketManager: Failed to create WebSocket connection:",
				error,
			);
			this.isConnecting = false;
			this.handleConnectionError(error);
		}
	}

	/**
	 * Set up WebSocket event handlers
	 * @private
	 */
	setupEventHandlers() {
		if (!this.socket) return;

		this.socket.onopen = (event) => {
			console.log(
				`WebSocketManager: Connection established${this.config.isAdmin ? " (Admin)" : ""}`,
			);
			this.isConnecting = false;
			this.reconnectAttempts = 0;
			this.clearReconnectTimeout();
			this.startPingInterval();
			this.callbacks.onOpen(event);
		};

		this.socket.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				// Handle ping/pong for connection health
				if (data.type === "ping") {
					this.sendMessage({ type: "pong" });
					return;
				} else if (data.type === "pong") {
					this.lastPingTime = Date.now();
					return;
				}

				this.callbacks.onMessage(data, event);
			} catch (error) {
				console.error("WebSocketManager: Failed to parse message:", error);
				this.callbacks.onError(error);
			}
		};

		this.socket.onclose = (event) => {
			console.log(
				`WebSocketManager: Connection closed${this.config.isAdmin ? " (Admin)" : ""}`,
				event.code,
				event.reason,
			);
			this.isConnecting = false;
			this.stopPingInterval();
			this.callbacks.onClose(event);

			if (!this.isDestroyed && !event.wasClean) {
				this.handleReconnection();
			}
		};

		this.socket.onerror = (event) => {
			console.error(
				`WebSocketManager: Connection error${this.config.isAdmin ? " (Admin)" : ""}:`,
				event,
			);
			this.isConnecting = false;
			this.callbacks.onError(event);
			this.handleConnectionError(event);
		};
	}

	/**
	 * Handle connection errors and potential reconnection
	 * @private
	 * @param {Error|Event} error - The error that occurred
	 */
	handleConnectionError(error) {
		if (this.isDestroyed) return;

		this.stopPingInterval();

		// Don't attempt reconnection if we never successfully connected initially
		if (
			this.reconnectAttempts === 0 &&
			Date.now() - this.connectionStartTime < 5000
		) {
			console.error(
				"WebSocketManager: Initial connection failed, not attempting reconnection",
			);
			this.callbacks.onReconnectFailed(error);
			return;
		}

		this.handleReconnection();
	}

	/**
	 * Handle reconnection logic
	 * @private
	 */
	handleReconnection() {
		if (
			this.isDestroyed ||
			this.reconnectAttempts >= this.config.maxReconnectAttempts
		) {
			if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
				console.error("WebSocketManager: Max reconnection attempts reached");
				this.callbacks.onReconnectFailed();
			}
			return;
		}

		this.reconnectAttempts++;
		const delay =
			this.config.reconnectDelay * 1.5 ** (this.reconnectAttempts - 1);

		console.log(
			`WebSocketManager: Reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`,
		);
		this.callbacks.onReconnect(this.reconnectAttempts);

		this.reconnectTimeout = setTimeout(() => {
			this.connect();
		}, delay);
	}

	/**
	 * Send a message through the WebSocket
	 * @param {Object} message - Message to send
	 * @returns {boolean} - Whether the message was sent successfully
	 */
	sendMessage(message) {
		if (!this.isConnected()) {
			console.warn("WebSocketManager: Cannot send message - not connected");
			return false;
		}

		try {
			this.socket.send(JSON.stringify(message));
			return true;
		} catch (error) {
			console.error("WebSocketManager: Failed to send message:", error);
			this.callbacks.onError(error);
			return false;
		}
	}

	/**
	 * Check if WebSocket is connected
	 * @returns {boolean} - Whether the connection is open
	 */
	isConnected() {
		return this.socket && this.socket.readyState === WebSocket.OPEN;
	}

	/**
	 * Get current connection state
	 * @returns {string} - Connection state
	 */
	getConnectionState() {
		if (!this.socket) return "DISCONNECTED";

		switch (this.socket.readyState) {
			case WebSocket.CONNECTING:
				return "CONNECTING";
			case WebSocket.OPEN:
				return "OPEN";
			case WebSocket.CLOSING:
				return "CLOSING";
			case WebSocket.CLOSED:
				return "CLOSED";
			default:
				return "UNKNOWN";
		}
	}

	/**
	 * Start ping interval for connection health check
	 * @private
	 */
	startPingInterval() {
		this.stopPingInterval();

		if (this.config.pingInterval > 0) {
			this.pingInterval = setInterval(() => {
				if (this.isConnected()) {
					this.sendMessage({ type: "ping" });
				}
			}, this.config.pingInterval);
		}
	}

	/**
	 * Stop ping interval
	 * @private
	 */
	stopPingInterval() {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
	}

	/**
	 * Clear reconnection timeout
	 * @private
	 */
	clearReconnectTimeout() {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
	}

	/**
	 * Close the WebSocket connection
	 * @param {number} code - Close code
	 * @param {string} reason - Close reason
	 */
	close(code = 1000, reason = "Client initiated close") {
		this.clearReconnectTimeout();
		this.stopPingInterval();

		if (this.socket) {
			if (
				this.socket.readyState === WebSocket.OPEN ||
				this.socket.readyState === WebSocket.CONNECTING
			) {
				this.socket.close(code, reason);
			}
		}
	}

	/**
	 * Destroy the WebSocket manager and clean up resources
	 */
	destroy() {
		this.isDestroyed = true;
		this.close();
		this.socket = null;
		this.callbacks = {};
	}

	/**
	 * Get connection statistics
	 * @returns {Object} - Connection stats
	 */
	getStats() {
		return {
			reconnectAttempts: this.reconnectAttempts,
			connectionState: this.getConnectionState(),
			lastPingTime: this.lastPingTime,
			connectionStartTime: this.connectionStartTime,
			isAdmin: this.config.isAdmin,
		};
	}
}

/**
 * Factory function to create WebSocket manager for main app
 * @param {string} websocketUrl - WebSocket URL
 * @param {WebSocketCallbacks} callbacks - Event callbacks
 * @returns {WebSocketManager} - Configured WebSocket manager
 */
export function createMainWebSocket(websocketUrl, callbacks) {
	const config = {
		url: websocketUrl,
		maxReconnectAttempts: 3,
		reconnectDelay: 1000,
		pingInterval: 30000,
		isAdmin: false,
	};

	return new WebSocketManager(config, callbacks);
}

/**
 * Factory function to create WebSocket manager for admin dashboard
 * @param {string} websocketUrl - WebSocket URL
 * @param {WebSocketCallbacks} callbacks - Event callbacks
 * @returns {WebSocketManager} - Configured WebSocket manager
 */
export function createAdminWebSocket(websocketUrl, callbacks) {
	const config = {
		url: websocketUrl,
		maxReconnectAttempts: 5,
		reconnectDelay: 1000,
		pingInterval: 30000,
		isAdmin: true,
	};

	return new WebSocketManager(config, callbacks);
}

/**
 * Utility function to determine WebSocket URL based on environment
 * @returns {string} - WebSocket URL
 */
export function getWebSocketUrl() {
	const IS_DEV_MODE =
		window.location.hostname === "localhost" ||
		window.location.hostname === "127.0.0.1";

	return IS_DEV_MODE
		? `ws://${window.location.host}/ws`
		: `wss://${window.location.host}/ws`;
}

export default WebSocketManager;
