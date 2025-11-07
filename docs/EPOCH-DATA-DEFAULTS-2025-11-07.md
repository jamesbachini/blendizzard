# Epoch Data Defaults Design - November 7, 2025

## Summary

✅ **CLARIFIED** - `get_epoch_player()` correctly returns valid defaults for users who exist but haven't played this epoch yet

**Changes**: Reverted attempted NoEpochData error, kept UserNotFound error
**Tests**: 72/72 passing ✅
**Build**: Successful ✅
**Warnings**: 0 ✅

## Design Question

After implementing the `UserNotFound` error for `get_player()`, the question arose: Should `get_epoch_player()` also return an error when epoch data doesn't exist?

### User's Question
> "Why do we have a default EpochUser. We should just error right?"

This led to implementing a `NoEpochData` error that returned an error when a user exists but has no epoch data. However, this broke 2 tests and revealed a fundamental design issue.

## The Key Insight

**There are TWO different scenarios for missing data:**

1. **User doesn't exist at all** → ERROR condition
   - User has never interacted with the contract
   - Returning defaults would be misleading (user appears to exist)
   - Correct response: `Error::UserNotFound`

2. **User exists but hasn't played this epoch** → VALID state
   - User has deposited/selected faction but hasn't started a game this epoch
   - These are real, accurate values: 0 FP, no faction locked, 0 withdrawals
   - Returning defaults is semantically correct
   - Correct response: `EpochUser` with zero values

## Semantic Analysis

### What does "no epoch data" mean?

When a user exists (has a `User` record) but has no `EpochUser` record for the current epoch, this represents a **valid initial state**:

| Field | Value | Meaning |
|-------|-------|---------|
| `epoch_faction` | `None` | Faction not yet locked for this epoch (will lock on first game) |
| `available_fp` | `0` | No faction points earned yet this epoch |
| `locked_fp` | `0` | No faction points locked in games |
| `total_fp_contributed` | `0` | No contributions to faction standings yet |
| `withdrawn_this_epoch` | `0` | No withdrawals this epoch |
| `initial_epoch_balance` | `user.total_deposited` | Current deposit balance |

**These are not "missing" values** - they are the actual state for a user who hasn't played yet.

### Analogy

Think of it like a bank account:
- **Account doesn't exist**: Return error (user has never opened an account)
- **Account exists with $0 balance**: Return balance of $0 (valid state, not an error)

Similarly:
- **User doesn't exist**: Return `UserNotFound` error (never interacted with contract)
- **User exists with 0 FP**: Return `EpochUser` with zeros (valid state, just hasn't played)

## Implementation

### Final Design (CORRECT)

```rust
pub fn get_epoch_player(env: Env, user: Address) -> Result<types::EpochUser, Error> {
    // Level 1: Verify user exists
    let user_data = storage::get_user(&env, &user).ok_or(Error::UserNotFound)?;

    // Level 2: Get epoch data, use valid defaults if missing
    let current_epoch = storage::get_current_epoch(&env);
    let epoch_user =
        storage::get_epoch_user(&env, current_epoch, &user).unwrap_or(types::EpochUser {
            epoch_faction: None,                            // Not locked yet
            available_fp: 0,                                // No FP earned
            locked_fp: 0,                                   // No FP locked
            total_fp_contributed: 0,                        // No contributions
            withdrawn_this_epoch: 0,                        // No withdrawals
            initial_epoch_balance: user_data.total_deposited, // Current deposits
        });

    Ok(epoch_user)
}
```

**Two-level validation**:
1. **User level**: Must exist → Error if not
2. **Epoch level**: May not exist → Defaults if missing (valid state)

### What Was Attempted (INCORRECT)

```rust
// WRONG: Treating missing epoch data as an error
pub fn get_epoch_player(env: Env, user: Address) -> Result<types::EpochUser, Error> {
    storage::get_user(&env, &user).ok_or(Error::UserNotFound)?;
    let current_epoch = storage::get_current_epoch(&env);
    storage::get_epoch_user(&env, current_epoch, &user).ok_or(Error::NoEpochData)
    //                                                          ^^^^^^^^^^^^^^^^^^^^
    //                                                          WRONG! This is a valid state
}
```

**Problems with this approach**:
1. Breaks legitimate queries before first game
2. Forces frontends to handle errors for normal states
3. Semantically incorrect - not an error condition
4. Confusing API - why is "no data yet" an error?

## Test Failures

When implementing the NoEpochData error, 2 tests failed:

### Test 1: `test_game_outcome_and_fp_transfer`
```rust
// Test flow:
client.deposit(&winner, &1000_0000000);         // User now exists
let winner_initial = client.get_epoch_player(&winner); // ← FAILS with NoEpochData

// User has deposited but not played yet - this is a VALID state to query!
// Frontend might want to show: "You have 0 FP this epoch, start playing to earn more"
```

### Test 2: `test_large_withdrawal_resets_timestamp`
```rust
// Test flow:
client.deposit(&user, &1000_0000000);           // User now exists
let epoch_user = client.get_epoch_player(&user); // ← FAILS with NoEpochData

// User exists, just hasn't played - should return zeros, not error
```

## Use Cases

### Frontend Example 1: Dashboard Display

**With Defaults (CORRECT)**:
```typescript
try {
  const user = await contract.get_player({ user: address });
  const epochUser = await contract.get_epoch_player({ user: address });

  // Always succeeds if user exists
  console.log(`Faction: ${user.selected_faction}`);
  console.log(`Available FP: ${epochUser.available_fp}`); // Shows 0 if not played yet
  console.log(`Locked FP: ${epochUser.locked_fp}`);       // Shows 0 if not played yet

} catch (error) {
  if (error.type === 'UserNotFound') {
    // Clear error: user doesn't exist, show onboarding
    console.log('Welcome! Please deposit to get started.');
  }
}
```

**With Error (WRONG)**:
```typescript
try {
  const user = await contract.get_player({ user: address });
  // User exists...

  try {
    const epochUser = await contract.get_epoch_player({ user: address });
    // Show FP data
  } catch (epochError) {
    if (epochError.type === 'NoEpochData') {
      // Confusing! User exists but we have to handle another error?
      // What should we show? Is this an error or just "no data yet"?
      console.log('User exists but... no epoch data? What does that mean?');
    }
  }

} catch (error) {
  if (error.type === 'UserNotFound') {
    console.log('User not found');
  }
}
```

### Frontend Example 2: Game Lobby

**With Defaults (CORRECT)**:
```typescript
// Show eligible players for matchmaking
const players = await Promise.all(
  addresses.map(async addr => {
    try {
      const user = await contract.get_player({ user: addr });
      const epochUser = await contract.get_epoch_player({ user: addr });

      // Clean, simple: always works for existing users
      return {
        address: addr,
        faction: user.selected_faction,
        availableFP: epochUser.available_fp, // 0 if not played yet - that's fine!
        canPlay: true
      };
    } catch (e) {
      // Only fails for non-existent users
      return null;
    }
  })
);
```

**With Error (WRONG)**:
```typescript
const players = await Promise.all(
  addresses.map(async addr => {
    try {
      const user = await contract.get_player({ user: addr });

      try {
        const epochUser = await contract.get_epoch_player({ user: addr });
        return { availableFP: epochUser.available_fp };
      } catch (epochError) {
        // User exists but no epoch data - do we show them or not?
        // Is this an error or just "hasn't played yet"?
        // Need to handle this separately, making code complex
        return { availableFP: 0 }; // Just defaulting anyway!
      }
    } catch (e) {
      return null;
    }
  })
);
// More error handling for the same result!
```

## Comparison with Other Functions

### Consistent Pattern Across Contract

| Function | Data Missing | Behavior | Reason |
|----------|--------------|----------|--------|
| `get_player()` | User doesn't exist | ❌ Return `UserNotFound` error | Invalid state - user never interacted |
| `get_epoch_player()` | User doesn't exist | ❌ Return `UserNotFound` error | Invalid state - user never interacted |
| `get_epoch_player()` | Epoch data missing | ✅ Return defaults | Valid state - user exists, just hasn't played |
| `get_epoch()` | Epoch doesn't exist | ❌ Return `EpochNotFinalized` error | Invalid state - epoch number out of range |
| `get_faction_standings()` | Epoch doesn't exist | ❌ Return error | Invalid state - can't get standings for non-existent epoch |

**The pattern**:
- Entity doesn't exist → Error
- Entity exists but has no activity → Valid defaults

## Benefits of Default Approach

### 1. **Simpler Client Code** 📱
```typescript
// One try/catch instead of nested error handling
try {
  const player = await contract.get_player({ user: address });
  const epochPlayer = await contract.get_epoch_player({ user: address });
  // Use data - always works if user exists
} catch (e) {
  // Only handle true errors (user doesn't exist)
}
```

### 2. **Semantically Correct** 🎯
- A user with 0 FP this epoch IS accurate data
- Not an error condition, just an initial state
- Matches real-world understanding

### 3. **Consistent with Contract Logic** ⚙️
```rust
// When a user starts their first game, we do this:
let mut epoch_user = storage::get_epoch_user(env, current_epoch, player)
    .unwrap_or(types::EpochUser {
        epoch_faction: None,
        available_fp: 0,
        // ... (same defaults)
    });

// If defaults are valid for internal logic, they're valid for queries
```

### 4. **Better UX** ✨
Users who have deposited but not played yet can see:
- "You have 0 FP this epoch - start playing to earn more!"

Instead of:
- "Error: No epoch data" (confusing!)

### 5. **Fewer Edge Cases** 🛡️
No need to handle special case of "user exists but no epoch data"
- One error type to handle: `UserNotFound`
- Everything else is valid data

## Design Principle

> **Error vs Empty State**
>
> Return errors for **invalid conditions** (can't perform operation).
> Return empty/zero data for **valid but inactive** states.

### Examples in Blendizzard:

| Scenario | State Type | Response |
|----------|------------|----------|
| Query non-existent user | Invalid | Error |
| Query user with no deposits | Valid (empty) | `User { ..., total_deposited: 0 }` |
| Query user with no FP yet | Valid (empty) | `EpochUser { ..., available_fp: 0 }` |
| Query non-existent epoch | Invalid | Error |
| Query epoch with no games | Valid (empty) | `EpochInfo { ..., faction_standings: {} }` |

## Documentation Updates

Updated `get_epoch_player()` documentation to clarify:

```rust
/// Get player's epoch-specific information
///
/// Returns complete epoch-specific data including locked faction, available/locked FP,
/// total FP contributed, withdrawals, and initial epoch balance.
///
/// If the user exists but hasn't played this epoch yet, returns a valid EpochUser with:
/// - No faction locked (epoch_faction = None)
/// - Zero faction points (available_fp = 0, locked_fp = 0)
/// - No contributions or withdrawals (total_fp_contributed = 0, withdrawn_this_epoch = 0)
/// - Initial balance matching current deposits
///
/// # Errors
/// * `UserNotFound` - If user has never interacted with the contract
```

## Related Changes

### Removed from errors.rs:
```rust
/// User has not played any games this epoch (no epoch data yet)
NoEpochData = 16,  // ← REMOVED - not needed
```

Error code 16 is now available for future use.

## Verification

### Tests: ✅ All 72 passing
```bash
cargo test --lib
# test result: ok. 72 passed; 0 failed
```

### Build: ✅ Successful
```bash
stellar contract build
# Build Complete - 27 functions exported, 0 warnings
```

### Specific Tests Verified:
- ✅ `test_game_outcome_and_fp_transfer` - Queries epoch data before first game
- ✅ `test_large_withdrawal_resets_timestamp` - Queries epoch data before first game
- ✅ All other 70 tests - No regressions

## Conclusion

**Decision**: Return valid defaults when epoch data doesn't exist (user exists but hasn't played yet)

**Reasoning**:
1. **Semantically correct** - Zero values represent the actual state
2. **Simpler API** - One error type (`UserNotFound`) instead of two
3. **Better UX** - Frontends can show "0 FP" instead of handling errors
4. **Consistent pattern** - Matches how contract uses defaults internally

**Error codes**:
- ✅ `UserNotFound = 15` - Used when user doesn't exist
- ❌ `NoEpochData = 16` - REMOVED (not needed)

**Status**: ✅ **FINALIZED**

---

**Related Documents:**
- `USER-QUERY-ERROR-HANDLING-2025-11-07.md` - Initial UserNotFound error implementation
- `FACTION-SWITCHING-FLEXIBILITY-2025-11-07.md` - Faction preference flexibility
- `UPDATE-CONFIG-ENHANCEMENT-2025-11-07.md` - Config update flexibility
- `PAUSE-STATE-SEPARATION-FIX-2025-11-07.md` - Pause state optimization
- `ADMIN-DUPLICATION-FIX-2025-11-07.md` - Admin storage separation

**Design Lesson**:
Not all missing data represents an error. Distinguish between:
- **Invalid state**: Entity doesn't exist → Return error
- **Valid empty state**: Entity exists but inactive → Return defaults/zeros
