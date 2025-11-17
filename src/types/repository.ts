import { User, CreateUserDto, UpdateUserDto, FindUserOptions, UserRole } from "./user";

/**
 * Repository interface for User CRUD operations
 * Follows the Repository pattern for data access abstraction
 */
export interface IUserRepository {
	/**
	 * Create a new user
	 * @param data User creation data
	 * @returns Promise resolving to the created user
	 * @throws Error if user with phone number already exists
	 */
	create(data: CreateUserDto): Promise<User>;

	/**
	 * Find a user by their unique ID
	 * @param id User ID (phone number)
	 * @returns Promise resolving to the user or null if not found
	 */
	findById(id: string): Promise<User | null>;

	/**
	 * Find a user by their phone number
	 * @param phoneNumber WhatsApp phone number in E.164 format
	 * @returns Promise resolving to the user or null if not found
	 */
	findByPhoneNumber(phoneNumber: string): Promise<User | null>;

	/**
	 * Find all users matching the given options
	 * @param options Query options for filtering, sorting, and pagination
	 * @returns Promise resolving to an array of users
	 */
	findAll(options?: FindUserOptions): Promise<User[]>;

	/**
	 * Find all users with a specific role
	 * @param role User role to filter by
	 * @returns Promise resolving to an array of users with the specified role
	 */
	findByRole(role: UserRole): Promise<User[]>;

	/**
	 * Update a user by their ID
	 * @param id User ID
	 * @param updates Partial user data to update
	 * @returns Promise resolving to the updated user
	 * @throws Error if user not found
	 */
	update(id: string, updates: UpdateUserDto): Promise<User>;

	/**
	 * Delete a user by their ID
	 * @param id User ID
	 * @returns Promise resolving to true if deleted, false if not found
	 */
	delete(id: string): Promise<boolean>;

	/**
	 * Check if a user exists by their ID
	 * @param id User ID
	 * @returns Promise resolving to true if user exists, false otherwise
	 */
	exists(id: string): Promise<boolean>;

	/**
	 * Count total users matching the given options
	 * @param options Query options for filtering
	 * @returns Promise resolving to the count of users
	 */
	count(options?: FindUserOptions): Promise<number>;

	/**
	 * Bulk create multiple users
	 * @param users Array of user creation data
	 * @returns Promise resolving to an array of created users
	 */
	bulkCreate(users: CreateUserDto[]): Promise<User[]>;

	/**
	 * Get all users (without any filtering)
	 * @returns Promise resolving to all users
	 */
	getAll(): Promise<User[]>;
}
