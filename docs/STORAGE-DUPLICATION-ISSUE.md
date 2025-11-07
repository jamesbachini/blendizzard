# Storage Duplication Issue - Admin Field

## Problem

The admin address is stored in **TWO** separate locations:

1. **Separate storage key**: `DataKey::Admin`
2. **Inside Config struct**: `Config.admin`

## Evidence

### During Initialization (lib.rs:82-94)

```rust
let config = Config {
    admin: admin.clone(),  // ← Stored here
    fee_vault,
    // ...
};

storage::set_config(&env, &config);  // ← Admin stored in Config
storage::set_admin(&env, &admin);     // ← Admin ALSO stored separately
```

### When Admin Changes (lib.rs:113-121)

```rust
pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
    let admin = storage::get_admin(&env);
    admin.require_auth();

    storage::set_admin(&env, &new_admin);  // ← Only updates separate key
    // Config.admin is NOT updated! ⚠️

    Ok(())
}
```

### When Admin is Read

```rust
// storage.rs:51-56
pub(crate) fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)  // ← Always reads from separate key
        .expect("Admin not set")
}

// Config.admin is NEVER read anywhere in the codebase! ⚠️
```

## Issues This Causes

### 1. **Stale Data** ⚠️
After the first `set_admin()` call:
- `DataKey::Admin` = new admin (correct)
- `Config.admin` = old admin (stale!)

### 2. **Wasted Storage** 💰
- Storing admin twice costs extra storage fees
- Config struct is larger than necessary

### 3. **Confusion** 🤔
- Unclear which is the "source of truth"
- Future developers might accidentally use `Config.admin`

### 4. **Bug Potential** 🐛
If someone writes code like:
```rust
let config = storage::get_config(&env);
config.admin.require_auth();  // ⚠️ Uses stale admin!
```

This would allow the OLD admin to access admin functions!

## Solution

Remove `admin` from the `Config` struct since:
1. It's never read anywhere
2. A separate `DataKey::Admin` is always used
3. This eliminates duplication

### Implementation

**Step 1: Update Config struct (types.rs)**

```rust
// BEFORE
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,  // ← Remove this
    pub fee_vault: Address,
    pub soroswap_router: Address,
    // ...
}

// AFTER
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    // admin removed - use storage::get_admin() instead
    pub fee_vault: Address,
    pub soroswap_router: Address,
    // ...
}
```

**Step 2: Update constructor (lib.rs)**

```rust
// BEFORE
let config = Config {
    admin: admin.clone(),  // ← Remove this line
    fee_vault,
    soroswap_router,
    // ...
};

// AFTER
let config = Config {
    fee_vault,
    soroswap_router,
    // ...
};
```

**Step 3: Update tests**

Any tests creating Config structs need the `admin` field removed.

## Impact

### Storage Savings
- **Before**: Admin stored twice (2x storage cost)
- **After**: Admin stored once (50% reduction for this field)

### Code Clarity
- Single source of truth: `storage::get_admin()`
- No risk of stale data
- Clear separation: Config for operational params, separate key for admin

### Contract Upgrade Required
⚠️ **This is a breaking change** that requires a contract upgrade:
- Existing contracts have `admin` in Config
- New contracts won't have it
- Not backward compatible

However, the contract already reads from the separate Admin key, so functionality won't break - just need to redeploy.

## Recommendation

**Fix Priority: MEDIUM-HIGH**

While not a critical security issue (since Config.admin is never read), this should be fixed because:
1. Wastes storage fees (real cost on mainnet)
2. Could cause future bugs if Config.admin is accidentally used
3. Code clarity and maintainability
4. Best practice: don't duplicate data

**When to Fix:**
- Before mainnet deployment (if not deployed yet) ✅
- Next contract upgrade (if already deployed)

## Related Files

- `src/types.rs` - Config struct definition
- `src/lib.rs` - Constructor and set_admin()
- `src/storage.rs` - get_admin(), set_admin(), get_config()
- `src/tests/**` - Test fixtures creating Config

---

**Status**: Issue identified, solution documented
**Action Required**: Remove `admin` field from Config struct
