/**
 * Centralized Admin Service
 *
 * Manages admin authentication and authorization by communicating with the backend
 * instead of using hardcoded admin IDs. Includes caching and error handling.
 */
class AdminService {
	constructor() {
		this.cache = new Map();
		this.cacheTimeout = 5 * 60 * 1000;
		this.pendingRequests = new Map();
		this.maxRetries = 3;
		this.retryDelay = 1000;
		this.apiTimeout = 10000;
	}

	/**
	 * Check if a user is an admin by calling the backend API
	 * @param {string} userId - Discord user ID
	 * @param {string} token - Authentication token
	 * @returns {Promise<boolean>} - True if user is admin
	 */
	async isUserAdmin(userId, token) {
		if (!userId || !token) {
			return false;
		}

		const cacheKey = `admin_${userId}`;
		const cached = this.cache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
			return cached.isAdmin;
		}

		if (this.pendingRequests.has(cacheKey)) {
			try {
				return await this.pendingRequests.get(cacheKey);
			} catch (error) {
				console.error("Pending admin check failed:", error);
				return false;
			}
		}

		const requestPromise = this._makeAdminCheckRequest(userId, token, cacheKey);
		this.pendingRequests.set(cacheKey, requestPromise);

		try {
			const result = await requestPromise;
			return result;
		} catch (error) {
			console.error("Admin check failed:", error);
			return false;
		} finally {
			this.pendingRequests.delete(cacheKey);
		}
	}

	/**
	 * Make the actual API request with retry logic
	 * @private
	 */
	async _makeAdminCheckRequest(_userId, token, cacheKey) {
		let lastError;

		for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.apiTimeout);

				const response = await fetch("/admin/auth-check", {
					method: "GET",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (response.ok) {
					const result = await response.json();
					const isAdmin = Boolean(result.isAdmin);

					this.cache.set(cacheKey, {
						isAdmin,
						timestamp: Date.now(),
					});

					return isAdmin;
				} else if (response.status === 401 || response.status === 403) {
					this.cache.set(cacheKey, {
						isAdmin: false,
						timestamp: Date.now(),
					});
					return false;
				} else {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
			} catch (error) {
				lastError = error;

				if (error.name === "AbortError") {
					console.warn(`Admin check timeout on attempt ${attempt}`);
				} else {
					console.warn(
						`Admin check failed on attempt ${attempt}:`,
						error.message,
					);
				}

				if (attempt < this.maxRetries) {
					await this._delay(this.retryDelay * attempt);
				}
			}
		}

		this.cache.set(cacheKey, {
			isAdmin: false,
			timestamp: Date.now(),
		});

		throw lastError || new Error("Admin check failed after all retries");
	}

	/**
	 * Check if current authenticated user is admin
	 * Uses global userData and userToken if available
	 * @returns {Promise<boolean>}
	 */
	async isCurrentUserAdmin() {
		if (typeof userData !== "undefined" && typeof userToken !== "undefined") {
			return await this.isUserAdmin(userData?.id, userToken);
		}
		return false;
	}

	/**
	 * Bulk check multiple users (with batching if API supports it)
	 * @param {Array<{userId: string, token: string}>} users
	 * @returns {Promise<Map<string, boolean>>} Map of userId -> isAdmin
	 */
	async bulkCheckAdmins(users) {
		const results = new Map();

		const promises = users.map(async ({ userId, token }) => {
			try {
				const isAdmin = await this.isUserAdmin(userId, token);
				results.set(userId, isAdmin);
			} catch (error) {
				console.error(`Bulk admin check failed for user ${userId}:`, error);
				results.set(userId, false);
			}
		});

		await Promise.all(promises);
		return results;
	}

	/**
	 * Clear the entire cache
	 */
	clearCache() {
		this.cache.clear();
		console.log("Admin service cache cleared");
	}

	/**
	 * Clear cache for specific user
	 * @param {string} userId - Discord user ID
	 */
	clearUserCache(userId) {
		const cacheKey = `admin_${userId}`;
		this.cache.delete(cacheKey);
	}

	/**
	 * Preload admin status for current user
	 * Useful for warming cache on page load
	 */
	async preloadCurrentUser() {
		try {
			await this.isCurrentUserAdmin();
		} catch (error) {
			console.warn("Failed to preload admin status:", error);
		}
	}

	/**
	 * Get cache statistics for debugging
	 * @returns {Object} Cache stats
	 */
	getCacheStats() {
		const now = Date.now();
		let validEntries = 0;
		let expiredEntries = 0;

		for (const [key, value] of this.cache.entries()) {
			if (now - value.timestamp < this.cacheTimeout) {
				validEntries++;
			} else {
				expiredEntries++;
			}
		}

		return {
			totalEntries: this.cache.size,
			validEntries,
			expiredEntries,
			cacheTimeout: this.cacheTimeout,
			pendingRequests: this.pendingRequests.size,
		};
	}

	/**
	 * Clean up expired cache entries
	 */
	cleanupCache() {
		const now = Date.now();
		for (const [key, value] of this.cache.entries()) {
			if (now - value.timestamp >= this.cacheTimeout) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Configure cache settings
	 * @param {Object} options - Configuration options
	 */
	configure(options = {}) {
		if (options.cacheTimeout !== undefined) {
			this.cacheTimeout = options.cacheTimeout;
		}
		if (options.maxRetries !== undefined) {
			this.maxRetries = options.maxRetries;
		}
		if (options.retryDelay !== undefined) {
			this.retryDelay = options.retryDelay;
		}
		if (options.apiTimeout !== undefined) {
			this.apiTimeout = options.apiTimeout;
		}
	}

	/**
	 * Utility method for delays
	 * @private
	 */
	_delay(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

if (typeof window !== "undefined") {
	window.adminService = new AdminService();

	setInterval(() => {
		window.adminService.cleanupCache();
	}, 60000);

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => {
			window.adminService.preloadCurrentUser();
		});
	} else {
		window.adminService.preloadCurrentUser();
	}
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = AdminService;
}
