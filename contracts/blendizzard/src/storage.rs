use soroban_sdk::{contracttype, Address, Env};

use crate::types::{Config, EpochInfo, EpochUser, GameSession, User};

// ============================================================================
// Storage Keys
// ============================================================================
// Uses type-safe enum keys to prevent storage collisions and improve type safety

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Admin address - singleton
    Admin,

    /// Global configuration - singleton
    Config,

    /// Current epoch number - singleton
    CurrentEpoch,

    /// Pause state - singleton
    Paused,

    /// User persistent data - User(user_address) -> User
    User(Address),

    /// User epoch-specific data - EpochUser(epoch_number, user_address) -> EpochUser
    EpochUser(u32, Address),

    /// Epoch metadata - Epoch(epoch_number) -> EpochInfo
    Epoch(u32),

    /// Game session data - Session(session_id) -> GameSession
    Session(u32),

    /// Whitelisted game contracts - Game(game_address) -> bool
    Game(Address),

    /// Reward claim tracking - Claimed(user_address, epoch_number) -> bool
    Claimed(Address, u32),
}

// ============================================================================
// Storage Utilities
// ============================================================================

/// Check if the contract has been initialized
pub(crate) fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Config)
}

/// Get the admin address
pub(crate) fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("Admin not set")
}

/// Set the admin address
pub(crate) fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

/// Get the global configuration
pub(crate) fn get_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .expect("Config not set")
}

/// Set the global configuration
pub(crate) fn set_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
}

/// Get the current epoch number
pub(crate) fn get_current_epoch(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::CurrentEpoch)
        .unwrap_or(0)
}

/// Set the current epoch number
pub(crate) fn set_current_epoch(env: &Env, epoch: u32) {
    env.storage().instance().set(&DataKey::CurrentEpoch, &epoch);
}

/// Get user persistent data
pub(crate) fn get_user(env: &Env, user: &Address) -> Option<User> {
    let key = DataKey::User(user.clone());
    let result = env.storage().persistent().get(&key);
    if result.is_some() {
        extend_user_ttl(env, user);
    }
    result
}

/// Set user persistent data
pub(crate) fn set_user(env: &Env, user: &Address, data: &User) {
    env.storage()
        .persistent()
        .set(&DataKey::User(user.clone()), data);
    extend_user_ttl(env, user);
}

/// Check if user exists
#[allow(dead_code)]
pub(crate) fn has_user(env: &Env, user: &Address) -> bool {
    env.storage().persistent().has(&DataKey::User(user.clone()))
}

/// Get epoch-specific user data
pub(crate) fn get_epoch_user(env: &Env, epoch: u32, user: &Address) -> Option<EpochUser> {
    let key = DataKey::EpochUser(epoch, user.clone());
    let result = env.storage().persistent().get(&key);
    if result.is_some() {
        extend_epoch_user_ttl(env, epoch, user);
    }
    result
}

/// Set epoch-specific user data
pub(crate) fn set_epoch_user(env: &Env, epoch: u32, user: &Address, data: &EpochUser) {
    env.storage()
        .persistent()
        .set(&DataKey::EpochUser(epoch, user.clone()), data);
    extend_epoch_user_ttl(env, epoch, user);
}

/// Check if epoch user exists
pub(crate) fn has_epoch_user(env: &Env, epoch: u32, user: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::EpochUser(epoch, user.clone()))
}

/// Get epoch metadata
pub(crate) fn get_epoch(env: &Env, epoch: u32) -> Option<EpochInfo> {
    let result = env.storage().persistent().get(&DataKey::Epoch(epoch));
    if result.is_some() {
        extend_epoch_ttl(env, epoch);
    }
    result
}

/// Set epoch metadata
pub(crate) fn set_epoch(env: &Env, epoch: u32, data: &EpochInfo) {
    env.storage().persistent().set(&DataKey::Epoch(epoch), data);
    extend_epoch_ttl(env, epoch);
}

/// Get game session
pub(crate) fn get_session(env: &Env, session_id: u32) -> Option<GameSession> {
    env.storage()
        .temporary()
        .get(&DataKey::Session(session_id))
}

/// Set game session
pub(crate) fn set_session(env: &Env, session_id: u32, data: &GameSession) {
    env.storage()
        .temporary()
        .set(&DataKey::Session(session_id), data);
}

/// Check if session exists
pub(crate) fn has_session(env: &Env, session_id: u32) -> bool {
    env.storage()
        .temporary()
        .has(&DataKey::Session(session_id))
}

/// Check if a game contract is whitelisted
pub(crate) fn is_game_whitelisted(env: &Env, game_id: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Game(game_id.clone()))
        .unwrap_or(false)
}

/// Add a game to the whitelist
pub(crate) fn add_game_to_whitelist(env: &Env, game_id: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::Game(game_id.clone()), &true);
}

/// Remove a game from the whitelist
pub(crate) fn remove_game_from_whitelist(env: &Env, game_id: &Address) {
    env.storage()
        .persistent()
        .remove(&DataKey::Game(game_id.clone()));
}

/// Check if user has claimed rewards for an epoch
pub(crate) fn has_claimed(env: &Env, user: &Address, epoch: u32) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Claimed(user.clone(), epoch))
        .unwrap_or(false)
}

/// Mark rewards as claimed for user and epoch
pub(crate) fn set_claimed(env: &Env, user: &Address, epoch: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::Claimed(user.clone(), epoch), &true);
}

// ============================================================================
// Storage TTL Management
// ============================================================================
// TTL (Time To Live) management ensures data doesn't expire unexpectedly
// Based on Soroban best practices:
// - Persistent storage has a default TTL of ~14 days
// - We extend TTL proactively when data is accessed
// - Instance storage is tied to contract lifetime

/// TTL thresholds and extensions (in ledgers, ~5 seconds per ledger)
/// ~30 days = 518,400 ledgers
/// ~7 days = 120,960 ledgers
const TTL_THRESHOLD_LEDGERS: u32 = 120_960; // Extend if < 7 days remaining
const TTL_EXTEND_TO_LEDGERS: u32 = 518_400; // Extend to 30 days

/// Extend TTL for user data
/// Should be called whenever user data is read/written
pub(crate) fn extend_user_ttl(env: &Env, user: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::User(user.clone()),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for epoch user data
/// Should be called whenever epoch user data is read/written
pub(crate) fn extend_epoch_user_ttl(env: &Env, epoch: u32, user: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::EpochUser(epoch, user.clone()),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for epoch data
/// Should be called whenever epoch data is read/written
pub(crate) fn extend_epoch_ttl(env: &Env, epoch: u32) {
    env.storage().persistent().extend_ttl(
        &DataKey::Epoch(epoch),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for instance storage (contract-wide data)
/// Should be called during initialization and periodically
pub(crate) fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
}

// ============================================================================
// Emergency Pause Management
// ============================================================================

/// Check if the contract is paused
pub(crate) fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false) // Default to not paused if not set
}

/// Set pause state
pub(crate) fn set_pause_state(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
}

/// Check if contract is not paused, return error if paused
/// Call this at the start of all user-facing functions
pub(crate) fn require_not_paused(env: &Env) -> Result<(), crate::errors::Error> {
    if is_paused(env) {
        Err(crate::errors::Error::ContractPaused)
    } else {
        Ok(())
    }
}
