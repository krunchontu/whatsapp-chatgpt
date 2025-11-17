# User Repository

This module provides a complete CRUD (Create, Read, Update, Delete) implementation for user management with RBAC (Role-Based Access Control) support.

## Architecture

The user management system follows the **Repository Pattern**:

```
User Service (Business Logic)
    ↓
User Repository (Data Access)
    ↓
File Storage (JSON)
```

## Components

### Types (`src/types/user.ts`)

- **UserRole**: Enum defining user roles (Owner, Admin, Operator, User)
- **User**: Core user entity with phone number, role, and metadata
- **CreateUserDto**: Data transfer object for creating users
- **UpdateUserDto**: Data transfer object for updating users
- **UserMetadata**: Optional user-specific settings and preferences

### Repository (`src/repositories/user.repository.ts`)

File-based implementation of `IUserRepository` interface:

- **Storage**: JSON file at `./data/users.json`
- **Singleton Pattern**: Use `getUserRepository()` to get the shared instance
- **Phone Number Normalization**: Automatically normalizes to E.164 format
- **Lazy Initialization**: Loads data from disk on first use
- **Auto-save**: Persists changes after each write operation

### Service (`src/services/user.service.ts`)

Business logic layer on top of the repository:

- **Singleton Pattern**: Use `getUserService()` to get the shared instance
- **Environment Integration**: Syncs users from `OWNER_PHONE_NUMBERS`, `ADMIN_PHONE_NUMBERS`, `OPERATOR_PHONE_NUMBERS`
- **Access Control**: Checks whitelist and RBAC permissions
- **Interaction Tracking**: Records user activity and message counts

## Usage

### Initialize Users from Environment Variables

```typescript
import { getUserService } from "./services/user.service";

const userService = getUserService();

// Sync users from env vars (OWNER_PHONE_NUMBERS, ADMIN_PHONE_NUMBERS, etc.)
await userService.initializeFromEnv();
```

### Create a User

```typescript
import { getUserRepository } from "./repositories/user.repository";
import { UserRole } from "./types/user";

const userRepo = getUserRepository();

const user = await userRepo.create({
	phoneNumber: "+1234567890",
	role: UserRole.Admin,
	metadata: {
		displayName: "John Doe",
		tags: ["customer-service", "team-lead"]
	}
});
```

### Find Users

```typescript
// Find by phone number
const user = await userRepo.findByPhoneNumber("+1234567890");

// Find by ID (phone number is used as ID)
const user = await userRepo.findById("+1234567890");

// Find all admins
const admins = await userRepo.findByRole(UserRole.Admin);

// Find all active users
const activeUsers = await userRepo.findAll({ isActive: true });

// Paginated query
const page1 = await userRepo.findAll({ limit: 10, skip: 0 });
```

### Update a User

```typescript
const updatedUser = await userRepo.update("+1234567890", {
	role: UserRole.Owner,
	metadata: {
		displayName: "John Doe (Senior Admin)"
	}
});
```

### Check Permissions

```typescript
import { getUserService } from "./services/user.service";

const userService = getUserService();

// Check if user has access
const hasAccess = await userService.hasAccess("+1234567890");

// Check if user has specific role permission
const canManageConfig = await userService.hasPermission("+1234567890", UserRole.Admin);

// Get user role
const role = await userService.getUserRole("+1234567890");
```

### Track User Interactions

```typescript
// Record message interaction (increments message count, updates last interaction)
await userService.recordInteraction("+1234567890");

// Get or create user (auto-creates with 'user' role if doesn't exist)
const user = await userService.getOrCreateUser("+1234567890");
```

### Get Statistics

```typescript
const stats = await userService.getUserStats();
// {
//   total: 25,
//   active: 23,
//   byRole: {
//     owner: 1,
//     admin: 3,
//     operator: 5,
//     user: 16
//   }
// }
```

## Environment Variables

Configure RBAC roles via environment variables:

```bash
# Owner: Full system access
OWNER_PHONE_NUMBERS=+1234567890

# Admin: Team lead
ADMIN_PHONE_NUMBERS=+1234567891,+1234567892

# Operator: Customer service agent
OPERATOR_PHONE_NUMBERS=+1234567893,+1234567894,+1234567895
```

## Role Hierarchy

Permissions are hierarchical:

1. **Owner** (highest) - Full system access, view audit logs
2. **Admin** - Manage runtime config, view usage metrics
3. **Operator** - Handle escalations, basic config
4. **User** (lowest) - Interact with bot, no config access

Higher roles have all permissions of lower roles.

## Data Storage

- **Location**: `./data/users.json`
- **Format**: JSON array of user objects
- **Gitignored**: Yes (via `.gitignore`)
- **Backup**: Recommended to backup `./data/` directory regularly

Example storage file:

```json
[
	{
		"id": "+1234567890",
		"phoneNumber": "+1234567890",
		"role": "admin",
		"isActive": true,
		"createdAt": "2025-11-17T00:00:00.000Z",
		"updatedAt": "2025-11-17T00:00:00.000Z",
		"metadata": {
			"displayName": "John Doe",
			"messageCount": 42,
			"lastInteraction": "2025-11-17T02:30:00.000Z"
		}
	}
]
```

## Testing

Run the test suite:

```bash
npx vite-node src/repositories/__tests__/user.repository.test.ts
```

Tests cover:

- ✓ User creation
- ✓ Finding users (by ID, phone number, role)
- ✓ Updating users
- ✓ Deleting users
- ✓ Bulk operations
- ✓ Pagination
- ✓ Duplicate prevention
- ✓ Persistence

## Best Practices

1. **Always use the service layer** for business logic (permission checks, interaction tracking)
2. **Use the repository directly** only for pure CRUD operations
3. **Phone numbers must be in E.164 format** (e.g., +1234567890)
4. **Initialize from env on startup** to sync RBAC roles
5. **Use singleton instances** via `getUserService()` and `getUserRepository()`

## Integration Example

```typescript
// In src/index.ts (application startup)
import { getUserService } from "./services/user.service";

async function initializeApp() {
	// Initialize user system from environment variables
	const userService = getUserService();
	await userService.initializeFromEnv();

	// ... rest of application initialization
}

initializeApp().catch(console.error);
```

```typescript
// In message handler
import { getUserService } from "./services/user.service";

async function handleMessage(message: Message) {
	const userService = getUserService();

	// Check access
	if (!(await userService.hasAccess(message.from))) {
		return message.reply("Access denied");
	}

	// Record interaction
	await userService.recordInteraction(message.from);

	// Check permissions for admin commands
	if (message.body.startsWith("!admin")) {
		const isAdmin = await userService.hasPermission(message.from, UserRole.Admin);
		if (!isAdmin) {
			return message.reply("Admin access required");
		}
		// ... handle admin command
	}

	// ... handle message
}
```

## Future Enhancements

- [ ] Database support (PostgreSQL, MongoDB)
- [ ] Redis caching layer
- [ ] Audit log integration
- [ ] Data retention policies
- [ ] User groups/teams
- [ ] Advanced querying (search, filters)
- [ ] Import/export functionality
- [ ] User activity analytics
