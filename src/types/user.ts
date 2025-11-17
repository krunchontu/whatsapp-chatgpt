/**
 * User role for RBAC (Role-Based Access Control)
 */
export enum UserRole {
	/** Full system access, can modify all settings, view audit logs */
	Owner = "owner",
	/** Team lead - manage runtime config, view usage metrics, access reports */
	Admin = "admin",
	/** Customer service agent - handle escalations, basic config (language, model) */
	Operator = "operator",
	/** Customer - can interact with bot, no config access */
	User = "user"
}

/**
 * User metadata for storing user-specific settings and preferences
 */
export interface UserMetadata {
	/** User's preferred language for responses */
	preferredLanguage?: string;
	/** User's display name */
	displayName?: string;
	/** Custom tags for user categorization */
	tags?: string[];
	/** User-specific notes (for admin/operator use) */
	notes?: string;
	/** Last interaction timestamp */
	lastInteraction?: Date;
	/** Total message count */
	messageCount?: number;
	/** User's timezone */
	timezone?: string;
	/** Additional custom properties */
	[key: string]: any;
}

/**
 * User entity representing a WhatsApp user in the system
 */
export interface User {
	/** Unique identifier (typically phone number in E.164 format) */
	id: string;
	/** WhatsApp phone number in E.164 format (e.g., +1234567890) */
	phoneNumber: string;
	/** User's role in the system */
	role: UserRole;
	/** Whether the user is active (can interact with bot) */
	isActive: boolean;
	/** User creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
	/** Optional user-specific metadata and settings */
	metadata?: UserMetadata;
}

/**
 * Data required to create a new user
 */
export interface CreateUserDto {
	/** WhatsApp phone number in E.164 format */
	phoneNumber: string;
	/** User's role (defaults to 'user' if not specified) */
	role?: UserRole;
	/** Whether the user is active (defaults to true) */
	isActive?: boolean;
	/** Optional metadata */
	metadata?: UserMetadata;
}

/**
 * Data for updating an existing user
 */
export interface UpdateUserDto {
	/** Updated role */
	role?: UserRole;
	/** Updated active status */
	isActive?: boolean;
	/** Updated metadata (merged with existing) */
	metadata?: Partial<UserMetadata>;
}

/**
 * Query options for finding users
 */
export interface FindUserOptions {
	/** Filter by role */
	role?: UserRole;
	/** Filter by active status */
	isActive?: boolean;
	/** Limit number of results */
	limit?: number;
	/** Skip number of results (for pagination) */
	skip?: number;
	/** Sort by field */
	sortBy?: keyof User;
	/** Sort order */
	sortOrder?: "asc" | "desc";
}
