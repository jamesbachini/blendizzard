use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::events::emit_faction_selected;
use crate::storage;
use crate::types::{EpochPlayer, Faction};

// ============================================================================
// Faction Selection
// ============================================================================

/// Select a faction for the player
///
/// This sets the player's persistent faction preference for future epochs.
/// Players can change their faction selection at ANY time - this updates their
/// preference but does NOT affect the current epoch if already locked.
///
/// Architecture:
/// - `Player.selected_faction` - Persistent preference (can always change)
/// - `EpochPlayer.epoch_faction` - Locked for current epoch on first game (cannot change)
///
/// Behavior:
/// - Changing faction updates your persistent preference immediately
/// - If you haven't played a game this epoch, next game uses new faction
/// - If you've already played this epoch, current epoch stays locked to old faction
/// - New selection applies starting next epoch
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player selecting the faction
/// * `faction` - Faction ID (0=WholeNoodle, 1=PointyStick, 2=SpecialRock)
///
/// # Errors
/// * `InvalidFaction` - If faction ID is not 0, 1, or 2
pub(crate) fn select_faction(env: &Env, player: &Address, faction: u32) -> Result<(), Error> {
    // Validate faction
    if !Faction::is_valid(faction) {
        return Err(Error::InvalidFaction);
    }

    // Authenticate player
    player.require_auth();

    // Get or create player data
    let mut player_data =
        storage::get_player(env, player).unwrap_or_else(|| crate::types::Player {
            selected_faction: faction,
            time_multiplier_start: 0,
            last_epoch_balance: 0,
        });

    // Update faction selection (always allowed - affects future epochs)
    player_data.selected_faction = faction;

    // Save player data
    storage::set_player(env, player, &player_data);

    // Emit event
    emit_faction_selected(env, player, faction);

    Ok(())
}

/// Lock the player's faction for the current epoch
///
/// This is called automatically when a player starts their first game in an epoch.
/// Once locked, the faction cannot be changed for the rest of the epoch.
///
/// From PLAN.md:
/// - "Lock in the player's faction if it hasn't been elected yet via `select_faction`"
/// - This happens during start_game if epoch_faction is None
///
/// # Arguments
/// * `env` - Contract environment
/// * `player` - Player whose faction to lock
/// * `current_epoch` - Current epoch number
///
/// # Returns
/// The locked faction ID
///
/// # Errors
/// * `FactionNotSelected` - If player hasn't explicitly selected a faction
/// * `FactionAlreadyLocked` - If faction is already locked for this epoch
pub(crate) fn lock_epoch_faction(
    env: &Env,
    player: &Address,
    current_epoch: u32,
) -> Result<u32, Error> {
    // Get player's selected faction - player MUST have explicitly selected one
    let player_data = storage::get_player(env, player).ok_or(Error::FactionNotSelected)?;
    let selected_faction = player_data.selected_faction;

    // Get or create epoch player data
    let mut epoch_player =
        storage::get_epoch_player(env, current_epoch, player).unwrap_or(EpochPlayer {
            epoch_faction: None,
            epoch_balance_snapshot: 0, // Will be set when FP is calculated
            available_fp: 0,
            total_fp_contributed: 0,
        });

    // Check if already locked
    if let Some(locked_faction) = epoch_player.epoch_faction {
        return Ok(locked_faction);
    }

    // Lock the faction
    epoch_player.epoch_faction = Some(selected_faction);

    // Save epoch player data
    storage::set_epoch_player(env, current_epoch, player, &epoch_player);

    // No event emitted - faction locking is internal state management
    // GameStarted event already indicates which players are in the game

    Ok(selected_faction)
}
