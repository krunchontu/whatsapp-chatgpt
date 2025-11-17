import fs from "fs/promises";
import path from "path";
import { User, CreateUserDto, UpdateUserDto, FindUserOptions, UserRole } from "../types/user";
import { IUserRepository } from "../types/repository";

/**
 * File-based implementation of the User Repository
 * Stores users in a JSON file for persistence
 */
export class UserRepository implements IUserRepository {
	private filePath: string;
	private users: Map<string, User>;
	private initialized: boolean = false;

	constructor(storagePath: string = "./data") {
		this.filePath = path.join(storagePath, "users.json");
		this.users = new Map();
	}

	/**
	 * Initialize the repository by loading users from disk
	 */
	private async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			// Ensure storage directory exists
			const dir = path.dirname(this.filePath);
			await fs.mkdir(dir, { recursive: true });

			// Try to load existing users file
			try {
				const data = await fs.readFile(this.filePath, "utf-8");
				const usersArray: User[] = JSON.parse(data);

				// Convert dates from strings to Date objects
				this.users = new Map(
					usersArray.map((user) => [
						user.id,
						{
							...user,
							createdAt: new Date(user.createdAt),
							updatedAt: new Date(user.updatedAt),
							metadata: user.metadata
								? {
										...user.metadata,
										lastInteraction: user.metadata.lastInteraction ? new Date(user.metadata.lastInteraction) : undefined
									}
								: undefined
						}
					])
				);
			} catch (error: any) {
				// File doesn't exist yet, start with empty map
				if (error.code !== "ENOENT") {
					throw error;
				}
			}

			this.initialized = true;
		} catch (error) {
			console.error("Failed to initialize UserRepository:", error);
			throw new Error("Failed to initialize user repository");
		}
	}

	/**
	 * Save users to disk
	 */
	private async save(): Promise<void> {
		try {
			const usersArray = Array.from(this.users.values());
			await fs.writeFile(this.filePath, JSON.stringify(usersArray, null, 2), "utf-8");
		} catch (error) {
			console.error("Failed to save users to disk:", error);
			throw new Error("Failed to save users");
		}
	}

	/**
	 * Normalize phone number to E.164 format
	 */
	private normalizePhoneNumber(phoneNumber: string): string {
		// Remove all non-digit characters except leading +
		let normalized = phoneNumber.replace(/[^\d+]/g, "");

		// Ensure it starts with +
		if (!normalized.startsWith("+")) {
			normalized = "+" + normalized;
		}

		return normalized;
	}

	/**
	 * Create a new user
	 */
	async create(data: CreateUserDto): Promise<User> {
		await this.initialize();

		const phoneNumber = this.normalizePhoneNumber(data.phoneNumber);
		const id = phoneNumber; // Use phone number as ID

		// Check if user already exists
		if (this.users.has(id)) {
			throw new Error(`User with phone number ${phoneNumber} already exists`);
		}

		const now = new Date();
		const user: User = {
			id,
			phoneNumber,
			role: data.role || UserRole.User,
			isActive: data.isActive !== undefined ? data.isActive : true,
			createdAt: now,
			updatedAt: now,
			metadata: data.metadata
		};

		this.users.set(id, user);
		await this.save();

		return { ...user };
	}

	/**
	 * Find a user by their ID
	 */
	async findById(id: string): Promise<User | null> {
		await this.initialize();

		const user = this.users.get(id);
		return user ? { ...user } : null;
	}

	/**
	 * Find a user by their phone number
	 */
	async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
		await this.initialize();

		const normalized = this.normalizePhoneNumber(phoneNumber);
		return this.findById(normalized);
	}

	/**
	 * Find all users matching the given options
	 */
	async findAll(options?: FindUserOptions): Promise<User[]> {
		await this.initialize();

		let users = Array.from(this.users.values());

		// Apply filters
		if (options?.role !== undefined) {
			users = users.filter((user) => user.role === options.role);
		}
		if (options?.isActive !== undefined) {
			users = users.filter((user) => user.isActive === options.isActive);
		}

		// Apply sorting
		if (options?.sortBy) {
			const sortField = options.sortBy;
			const order = options.sortOrder === "desc" ? -1 : 1;
			users.sort((a, b) => {
				const aVal = a[sortField];
				const bVal = b[sortField];
				if (aVal < bVal) return -1 * order;
				if (aVal > bVal) return 1 * order;
				return 0;
			});
		}

		// Apply pagination
		if (options?.skip !== undefined) {
			users = users.slice(options.skip);
		}
		if (options?.limit !== undefined) {
			users = users.slice(0, options.limit);
		}

		return users.map((user) => ({ ...user }));
	}

	/**
	 * Find all users with a specific role
	 */
	async findByRole(role: UserRole): Promise<User[]> {
		return this.findAll({ role });
	}

	/**
	 * Update a user by their ID
	 */
	async update(id: string, updates: UpdateUserDto): Promise<User> {
		await this.initialize();

		const user = this.users.get(id);
		if (!user) {
			throw new Error(`User with ID ${id} not found`);
		}

		// Merge updates
		const updatedUser: User = {
			...user,
			role: updates.role !== undefined ? updates.role : user.role,
			isActive: updates.isActive !== undefined ? updates.isActive : user.isActive,
			updatedAt: new Date(),
			metadata: updates.metadata
				? {
						...user.metadata,
						...updates.metadata
					}
				: user.metadata
		};

		this.users.set(id, updatedUser);
		await this.save();

		return { ...updatedUser };
	}

	/**
	 * Delete a user by their ID
	 */
	async delete(id: string): Promise<boolean> {
		await this.initialize();

		const existed = this.users.has(id);
		if (existed) {
			this.users.delete(id);
			await this.save();
		}

		return existed;
	}

	/**
	 * Check if a user exists by their ID
	 */
	async exists(id: string): Promise<boolean> {
		await this.initialize();
		return this.users.has(id);
	}

	/**
	 * Count total users matching the given options
	 */
	async count(options?: FindUserOptions): Promise<number> {
		const users = await this.findAll(options);
		return users.length;
	}

	/**
	 * Bulk create multiple users
	 */
	async bulkCreate(usersData: CreateUserDto[]): Promise<User[]> {
		await this.initialize();

		const createdUsers: User[] = [];
		const now = new Date();

		for (const data of usersData) {
			const phoneNumber = this.normalizePhoneNumber(data.phoneNumber);
			const id = phoneNumber;

			// Skip if user already exists
			if (this.users.has(id)) {
				console.warn(`User with phone number ${phoneNumber} already exists, skipping`);
				continue;
			}

			const user: User = {
				id,
				phoneNumber,
				role: data.role || UserRole.User,
				isActive: data.isActive !== undefined ? data.isActive : true,
				createdAt: now,
				updatedAt: now,
				metadata: data.metadata
			};

			this.users.set(id, user);
			createdUsers.push({ ...user });
		}

		await this.save();
		return createdUsers;
	}

	/**
	 * Get all users (without any filtering)
	 */
	async getAll(): Promise<User[]> {
		await this.initialize();
		return Array.from(this.users.values()).map((user) => ({ ...user }));
	}
}

// Singleton instance
let userRepositoryInstance: UserRepository | null = null;

/**
 * Get the singleton instance of UserRepository
 * @param storagePath Optional custom storage path
 * @returns UserRepository instance
 */
export function getUserRepository(storagePath?: string): UserRepository {
	if (!userRepositoryInstance) {
		userRepositoryInstance = new UserRepository(storagePath);
	}
	return userRepositoryInstance;
}
