import { getUserRepository } from "../repositories/user.repository";
import { User, UserRole, CreateUserDto } from "../types/user";
import { config } from "../config";

/**
 * Service layer for user management operations
 * Provides business logic on top of the repository layer
 */
export class UserService {
	private repository = getUserRepository();

	/**
	 * Initialize users from environment variables
	 * This syncs users defined in env vars with the repository
	 */
	async initializeFromEnv(): Promise<void> {
		try {
			// Get phone numbers from environment variables
			const ownerNumbers = this.parsePhoneNumbers(process.env.OWNER_PHONE_NUMBERS);
			const adminNumbers = this.parsePhoneNumbers(process.env.ADMIN_PHONE_NUMBERS);
			const operatorNumbers = this.parsePhoneNumbers(process.env.OPERATOR_PHONE_NUMBERS);

			// Create or update users based on env vars
			await this.syncUsersWithRole(ownerNumbers, UserRole.Owner);
			await this.syncUsersWithRole(adminNumbers, UserRole.Admin);
			await this.syncUsersWithRole(operatorNumbers, UserRole.Operator);

			console.log("✓ Users initialized from environment variables");
		} catch (error) {
			console.error("Failed to initialize users from environment:", error);
			throw error;
		}
	}

	/**
	 * Parse comma-separated phone numbers from string
	 */
	private parsePhoneNumbers(value?: string): string[] {
		if (!value) return [];
		return value
			.split(",")
			.map((num) => num.trim())
			.filter((num) => num.length > 0);
	}

	/**
	 * Sync users with a specific role
	 * Creates users if they don't exist, updates role if they do
	 */
	private async syncUsersWithRole(phoneNumbers: string[], role: UserRole): Promise<void> {
		for (const phoneNumber of phoneNumbers) {
			try {
				const existingUser = await this.repository.findByPhoneNumber(phoneNumber);

				if (existingUser) {
					// Update role if it changed
					if (existingUser.role !== role) {
						await this.repository.update(existingUser.id, { role });
						console.log(`Updated user ${phoneNumber} to role: ${role}`);
					}
				} else {
					// Create new user
					await this.repository.create({
						phoneNumber,
						role,
						isActive: true,
						metadata: {
							displayName: `${role.charAt(0).toUpperCase() + role.slice(1)} User`
						}
					});
					console.log(`Created user ${phoneNumber} with role: ${role}`);
				}
			} catch (error) {
				console.error(`Failed to sync user ${phoneNumber}:`, error);
			}
		}
	}

	/**
	 * Get user by phone number, creating them as a regular user if they don't exist
	 */
	async getOrCreateUser(phoneNumber: string): Promise<User> {
		let user = await this.repository.findByPhoneNumber(phoneNumber);

		if (!user) {
			// Create new user with default 'user' role
			user = await this.repository.create({
				phoneNumber,
				role: UserRole.User,
				isActive: true
			});
		}

		return user;
	}

	/**
	 * Check if a user has access (is whitelisted or whitelist is disabled)
	 */
	async hasAccess(phoneNumber: string): Promise<boolean> {
		// If whitelist is disabled, everyone has access
		if (!config.whitelistedEnabled) {
			return true;
		}

		const user = await this.repository.findByPhoneNumber(phoneNumber);

		// User must exist and be active
		if (!user || !user.isActive) {
			return false;
		}

		// Check if user is in whitelist or has elevated role
		const whitelisted = config.whitelistedPhoneNumbers.includes(phoneNumber);
		const hasElevatedRole = [UserRole.Owner, UserRole.Admin, UserRole.Operator].includes(user.role);

		return whitelisted || hasElevatedRole;
	}

	/**
	 * Check if a user has permission for a specific action based on their role
	 */
	async hasPermission(phoneNumber: string, requiredRole: UserRole): Promise<boolean> {
		const user = await this.repository.findByPhoneNumber(phoneNumber);

		if (!user || !user.isActive) {
			return false;
		}

		// Role hierarchy: owner > admin > operator > user
		const roleHierarchy = {
			[UserRole.Owner]: 4,
			[UserRole.Admin]: 3,
			[UserRole.Operator]: 2,
			[UserRole.User]: 1
		};

		return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
	}

	/**
	 * Get user role by phone number
	 */
	async getUserRole(phoneNumber: string): Promise<UserRole | null> {
		const user = await this.repository.findByPhoneNumber(phoneNumber);
		return user?.role || null;
	}

	/**
	 * Update user's last interaction time and increment message count
	 */
	async recordInteraction(phoneNumber: string): Promise<void> {
		const user = await this.getOrCreateUser(phoneNumber);

		await this.repository.update(user.id, {
			metadata: {
				lastInteraction: new Date(),
				messageCount: (user.metadata?.messageCount || 0) + 1
			}
		});
	}

	/**
	 * Get all users with a specific role
	 */
	async getUsersByRole(role: UserRole): Promise<User[]> {
		return this.repository.findByRole(role);
	}

	/**
	 * Deactivate a user (soft delete)
	 */
	async deactivateUser(phoneNumber: string): Promise<User> {
		const user = await this.repository.findByPhoneNumber(phoneNumber);
		if (!user) {
			throw new Error(`User ${phoneNumber} not found`);
		}

		return this.repository.update(user.id, { isActive: false });
	}

	/**
	 * Activate a user
	 */
	async activateUser(phoneNumber: string): Promise<User> {
		const user = await this.repository.findByPhoneNumber(phoneNumber);
		if (!user) {
			throw new Error(`User ${phoneNumber} not found`);
		}

		return this.repository.update(user.id, { isActive: true });
	}

	/**
	 * Get all active users
	 */
	async getActiveUsers(): Promise<User[]> {
		return this.repository.findAll({ isActive: true });
	}

	/**
	 * Get user statistics
	 */
	async getUserStats(): Promise<{
		total: number;
		active: number;
		byRole: Record<UserRole, number>;
	}> {
		const allUsers = await this.repository.getAll();

		const stats = {
			total: allUsers.length,
			active: allUsers.filter((u) => u.isActive).length,
			byRole: {
				[UserRole.Owner]: 0,
				[UserRole.Admin]: 0,
				[UserRole.Operator]: 0,
				[UserRole.User]: 0
			}
		};

		for (const user of allUsers) {
			stats.byRole[user.role]++;
		}

		return stats;
	}
}

// Singleton instance
let userServiceInstance: UserService | null = null;

/**
 * Get the singleton instance of UserService
 */
export function getUserService(): UserService {
	if (!userServiceInstance) {
		userServiceInstance = new UserService();
	}
	return userServiceInstance;
}
