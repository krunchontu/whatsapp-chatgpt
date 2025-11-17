/**
 * Manual test file for UserRepository
 * Run with: npx vite-node src/repositories/__tests__/user.repository.test.ts
 */

import { UserRepository } from "../user.repository";
import { UserRole } from "../../types/user";
import fs from "fs/promises";
import path from "path";

const TEST_DATA_DIR = "./test-data";

async function cleanup() {
	try {
		await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
		console.log("✓ Cleaned up test data");
	} catch (error) {
		console.error("Cleanup failed:", error);
	}
}

async function runTests() {
	console.log("\n=== User Repository Tests ===\n");

	// Create test repository
	const repo = new UserRepository(TEST_DATA_DIR);

	try {
		// Test 1: Create a user
		console.log("Test 1: Create a user");
		const user1 = await repo.create({
			phoneNumber: "+1234567890",
			role: UserRole.Admin,
			metadata: {
				displayName: "John Doe",
				tags: ["tester", "admin"]
			}
		});
		console.log("✓ Created user:", user1);
		console.assert(user1.phoneNumber === "+1234567890", "Phone number mismatch");
		console.assert(user1.role === UserRole.Admin, "Role mismatch");

		// Test 2: Find user by phone number
		console.log("\nTest 2: Find user by phone number");
		const found = await repo.findByPhoneNumber("+1234567890");
		console.log("✓ Found user:", found);
		console.assert(found !== null, "User not found");
		console.assert(found?.id === user1.id, "ID mismatch");

		// Test 3: Create another user
		console.log("\nTest 3: Create another user");
		const user2 = await repo.create({
			phoneNumber: "9876543210", // Without +
			role: UserRole.User
		});
		console.log("✓ Created user:", user2);
		console.assert(user2.phoneNumber === "+9876543210", "Phone normalization failed");

		// Test 4: Find all users
		console.log("\nTest 4: Find all users");
		const allUsers = await repo.getAll();
		console.log("✓ All users:", allUsers.length);
		console.assert(allUsers.length === 2, "Expected 2 users");

		// Test 5: Find by role
		console.log("\nTest 5: Find by role");
		const admins = await repo.findByRole(UserRole.Admin);
		console.log("✓ Admin users:", admins.length);
		console.assert(admins.length === 1, "Expected 1 admin");
		console.assert(admins[0].phoneNumber === "+1234567890", "Wrong admin");

		// Test 6: Update user
		console.log("\nTest 6: Update user");
		const updated = await repo.update(user1.id, {
			role: UserRole.Owner,
			metadata: {
				displayName: "John Doe (Updated)"
			}
		});
		console.log("✓ Updated user:", updated);
		console.assert(updated.role === UserRole.Owner, "Role not updated");
		console.assert(updated.metadata?.displayName === "John Doe (Updated)", "Metadata not updated");

		// Test 7: Check if user exists
		console.log("\nTest 7: Check if user exists");
		const exists = await repo.exists(user1.id);
		const notExists = await repo.exists("+9999999999");
		console.log("✓ User exists:", exists);
		console.log("✓ User not exists:", !notExists);
		console.assert(exists === true, "User should exist");
		console.assert(notExists === false, "User should not exist");

		// Test 8: Count users
		console.log("\nTest 8: Count users");
		const totalCount = await repo.count();
		const activeCount = await repo.count({ isActive: true });
		console.log("✓ Total users:", totalCount);
		console.log("✓ Active users:", activeCount);
		console.assert(totalCount === 2, "Expected 2 total users");
		console.assert(activeCount === 2, "Expected 2 active users");

		// Test 9: Bulk create users
		console.log("\nTest 9: Bulk create users");
		const bulkUsers = await repo.bulkCreate([
			{ phoneNumber: "+1111111111", role: UserRole.Operator },
			{ phoneNumber: "+2222222222", role: UserRole.User },
			{ phoneNumber: "+3333333333", role: UserRole.Admin }
		]);
		console.log("✓ Bulk created:", bulkUsers.length, "users");
		console.assert(bulkUsers.length === 3, "Expected 3 bulk users");

		// Test 10: Find with pagination
		console.log("\nTest 10: Find with pagination");
		const page1 = await repo.findAll({ limit: 2, skip: 0 });
		const page2 = await repo.findAll({ limit: 2, skip: 2 });
		console.log("✓ Page 1:", page1.length, "users");
		console.log("✓ Page 2:", page2.length, "users");
		console.assert(page1.length === 2, "Expected 2 users in page 1");

		// Test 11: Delete user
		console.log("\nTest 11: Delete user");
		const deleted = await repo.delete(user2.id);
		console.log("✓ Deleted user:", deleted);
		console.assert(deleted === true, "User should be deleted");
		const afterDelete = await repo.count();
		console.log("✓ Users after delete:", afterDelete);
		console.assert(afterDelete === 4, "Expected 4 users after delete");

		// Test 12: Prevent duplicate creation
		console.log("\nTest 12: Prevent duplicate creation");
		try {
			await repo.create({
				phoneNumber: "+1234567890" // Duplicate
			});
			console.error("✗ Should have thrown error for duplicate");
		} catch (error: any) {
			console.log("✓ Correctly prevented duplicate:", error.message);
		}

		// Test 13: Persistence check
		console.log("\nTest 13: Persistence check");
		const repo2 = new UserRepository(TEST_DATA_DIR);
		const persistedUsers = await repo2.getAll();
		console.log("✓ Persisted users:", persistedUsers.length);
		console.assert(persistedUsers.length === 4, "Expected 4 persisted users");

		console.log("\n=== All tests passed! ===\n");
	} catch (error) {
		console.error("\n✗ Test failed:", error);
		throw error;
	} finally {
		await cleanup();
	}
}

// Run tests
runTests()
	.then(() => {
		console.log("Test suite completed successfully");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Test suite failed:", error);
		process.exit(1);
	});
