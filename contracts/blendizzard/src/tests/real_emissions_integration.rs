/// Real Emissions Integration Tests
///
/// End-to-end tests using real Soroswap contracts and stateful MockVault
/// to verify emissions claiming and reward pool calculations with actual values.
///
/// These tests replace the mock-based tests that always returned 0 for emissions.

use super::fee_vault_utils::{create_mock_vault, MockVaultClient};
use super::soroswap_utils::{add_liquidity, create_factory, create_router, create_token};
use super::testutils::{create_blendizzard_contract, setup_test_env};
use soroban_sdk::testutils::{Address as _, Events as _, Ledger as _};
use soroban_sdk::{vec, Address, BytesN};

// ============================================================================
// End-to-End Epoch Cycling with Real Values
// ============================================================================

#[test]
fn test_epoch_cycle_with_real_emissions() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // ========================================================================
    // Step 1: Setup Soroswap infrastructure
    // ========================================================================

    let factory = create_factory(&env, &admin);
    let router = create_router(&env);
    router.initialize(&factory.address);

    // Create tokens (ensure BLND < USDC for Soroswap pair ordering)
    let mut blnd = create_token(&env, &admin);
    let mut usdc = create_token(&env, &admin);

    if usdc.address < blnd.address {
        core::mem::swap(&mut blnd, &mut usdc);
    }

    // ========================================================================
    // Step 2: Add liquidity to BLND/USDC pair
    // ========================================================================

    let liquidity_provider = Address::generate(&env);
    blnd.mint(&liquidity_provider, &10_000_000_0000000); // 10M BLND
    usdc.mint(&liquidity_provider, &10_000_000_0000000); // 10M USDC

    add_liquidity(
        &env,
        &router,
        &blnd.address,
        &usdc.address,
        1_000_000_0000000, // 1M BLND
        1_000_000_0000000, // 1M USDC
        &liquidity_provider,
    );

    // ========================================================================
    // Step 3: Create stateful MockVault with emissions
    // ========================================================================

    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    // Configure vault with emissions for reserve token ID 1 (b-tokens of reserve 0)
    let emissions_amount = 5000_0000000i128; // 5000 BLND
    vault_client.set_emissions(&1u32, &emissions_amount);

    // Set admin balance for additional BLND (from yield)
    let admin_balance = 1000_0000000i128; // 1000 BLND
    vault_client.set_admin_balance(&admin_balance);

    // ========================================================================
    // Step 4: Create Blendizzard contract
    // ========================================================================

    let reserve_token_ids = vec![&env, 1u32]; // Claim from reserve 0 b-tokens
    let client = create_blendizzard_contract(
        &env,
        &admin,
        &vault_address,
        &router.address,
        &blnd.address,
        &usdc.address,
        100, // Short epoch for testing
        reserve_token_ids.clone(),
    );

    // Mint BLND to the vault so it can be claimed
    // In real setup, this would come from Blend pool emissions
    blnd.mint(&vault_address, &emissions_amount);
    blnd.mint(&vault_address, &admin_balance);

    // ========================================================================
    // Step 5: Create game activity
    // ========================================================================

    let game = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    client.add_game(&game);
    client.deposit(&p1, &1000_0000000);
    client.deposit(&p2, &1000_0000000);
    client.select_faction(&p1, &0); // WholeNoodle
    client.select_faction(&p2, &1); // PointyStick

    // Start a game to lock factions
    let session = BytesN::from_array(&env, &[1u8; 32]);
    client.start_game(&game, &session, &p1, &p2, &100_0000000, &100_0000000);

    // ========================================================================
    // Step 6: Advance time and cycle epoch
    // ========================================================================

    env.ledger().with_mut(|li| {
        li.timestamp += 101; // Past epoch duration
    });

    // Mint BLND to Blendizzard so it has tokens to swap
    // This simulates the BLND coming from vault.admin_withdraw() + vault.claim_emissions()
    let total_blnd = admin_balance + emissions_amount; // 6000 BLND total
    blnd.mint(&client.address, &total_blnd);

    // Cycle epoch - this will:
    // 1. Call vault.admin_withdraw() -> returns 1000 BLND
    // 2. Call vault.claim_emissions([1], contract) -> returns 5000 BLND
    // 3. Total: 6000 BLND
    // 4. Swap 6000 BLND → USDC via Soroswap
    // 5. Set reward_pool to the received USDC
    let result = client.try_cycle_epoch();

    // ========================================================================
    // Step 7: Verify results
    // ========================================================================

    // Epoch cycling should succeed
    assert!(
        result.is_ok(),
        "Epoch cycle should succeed with real emissions"
    );

    // Verify new epoch was created
    let epoch_0 = client.get_epoch(&Some(0));
    assert!(
        epoch_0.is_finalized,
        "Epoch 0 should be finalized after cycling"
    );

    // Verify reward pool has real value (not 0)
    // The exact amount depends on Soroswap swap rates, but should be > 0
    assert!(
        epoch_0.reward_pool > 0,
        "Reward pool should have USDC from swapped BLND"
    );

    // Log the reward pool for visibility
    env.events().all();

    // Verify vault emissions were claimed (balance should be 0 now)
    let remaining_emissions = vault_client.claim_emissions(&reserve_token_ids, &admin);
    assert_eq!(
        remaining_emissions, 0,
        "Emissions should have been claimed during epoch cycle"
    );
}

// ============================================================================
// Multiple Reserves Emissions Test
// ============================================================================

#[test]
fn test_epoch_cycle_with_multiple_reserve_emissions() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Setup Soroswap
    let factory = create_factory(&env, &admin);
    let router = create_router(&env);
    router.initialize(&factory.address);

    let mut blnd = create_token(&env, &admin);
    let mut usdc = create_token(&env, &admin);

    if usdc.address < blnd.address {
        core::mem::swap(&mut blnd, &mut usdc);
    }

    // Add liquidity
    let liquidity_provider = Address::generate(&env);
    blnd.mint(&liquidity_provider, &10_000_000_0000000);
    usdc.mint(&liquidity_provider, &10_000_000_0000000);

    add_liquidity(
        &env,
        &router,
        &blnd.address,
        &usdc.address,
        1_000_000_0000000,
        1_000_000_0000000,
        &liquidity_provider,
    );

    // Create vault with emissions from multiple reserves
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    // Reserve 0 b-tokens (ID=1): 2000 BLND
    vault_client.set_emissions(&1u32, &2000_0000000);
    // Reserve 1 b-tokens (ID=3): 1500 BLND
    vault_client.set_emissions(&3u32, &1500_0000000);
    // Reserve 2 b-tokens (ID=5): 1000 BLND
    vault_client.set_emissions(&5u32, &1000_0000000);

    let total_emissions = 4500_0000000i128; // 4500 BLND total

    // Mint BLND to vault
    blnd.mint(&vault_address, &total_emissions);

    // Create Blendizzard with multiple reserve token IDs
    let reserve_token_ids = vec![&env, 1u32, 3u32, 5u32];
    let client = create_blendizzard_contract(
        &env,
        &admin,
        &vault_address,
        &router.address,
        &blnd.address,
        &usdc.address,
        100,
        reserve_token_ids.clone(),
    );

    // Create minimal activity
    let game = Address::generate(&env);
    let p1 = Address::generate(&env);

    client.add_game(&game);
    client.deposit(&p1, &1000_0000000);
    client.select_faction(&p1, &0);

    // Advance time
    env.ledger().with_mut(|li| {
        li.timestamp += 101;
    });

    // Mint BLND to contract
    blnd.mint(&client.address, &total_emissions);

    // Cycle epoch
    let result = client.try_cycle_epoch();

    // Verify success
    assert!(result.is_ok(), "Should handle multiple reserve emissions");

    let epoch_0 = client.get_epoch(&Some(0));
    assert!(epoch_0.is_finalized);
    assert!(
        epoch_0.reward_pool > 0,
        "Should have reward pool from all emissions"
    );

    // Verify all emissions were claimed
    let remaining = vault_client.claim_emissions(&reserve_token_ids, &admin);
    assert_eq!(remaining, 0, "All reserves should be claimed");
}

// ============================================================================
// Zero Emissions Edge Case
// ============================================================================

#[test]
fn test_epoch_cycle_with_zero_emissions_but_admin_balance() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Setup Soroswap
    let factory = create_factory(&env, &admin);
    let router = create_router(&env);
    router.initialize(&factory.address);

    let mut blnd = create_token(&env, &admin);
    let mut usdc = create_token(&env, &admin);

    if usdc.address < blnd.address {
        core::mem::swap(&mut blnd, &mut usdc);
    }

    let liquidity_provider = Address::generate(&env);
    blnd.mint(&liquidity_provider, &10_000_000_0000000);
    usdc.mint(&liquidity_provider, &10_000_000_0000000);

    add_liquidity(
        &env,
        &router,
        &blnd.address,
        &usdc.address,
        1_000_000_0000000,
        1_000_000_0000000,
        &liquidity_provider,
    );

    // Create vault with NO emissions (0) but WITH admin balance
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    vault_client.set_emissions(&1u32, &0); // 0 emissions
    let admin_balance = 2000_0000000i128; // But 2000 BLND from admin
    vault_client.set_admin_balance(&admin_balance);

    blnd.mint(&vault_address, &admin_balance);

    let reserve_token_ids = vec![&env, 1u32];
    let client = create_blendizzard_contract(
        &env,
        &admin,
        &vault_address,
        &router.address,
        &blnd.address,
        &usdc.address,
        100,
        reserve_token_ids,
    );

    // Minimal activity
    let game = Address::generate(&env);
    let p1 = Address::generate(&env);

    client.add_game(&game);
    client.deposit(&p1, &1000_0000000);
    client.select_faction(&p1, &0);

    env.ledger().with_mut(|li| {
        li.timestamp += 101;
    });

    blnd.mint(&client.address, &admin_balance);

    // Cycle epoch
    let result = client.try_cycle_epoch();

    // Should succeed with only admin balance
    assert!(result.is_ok(), "Should work with 0 emissions but admin balance");

    let epoch_0 = client.get_epoch(&Some(0));
    assert!(epoch_0.is_finalized);
    assert!(
        epoch_0.reward_pool > 0,
        "Should have reward pool from admin balance only"
    );
}

// ============================================================================
// Emissions + Admin Balance Combined
// ============================================================================

#[test]
fn test_reward_pool_equals_emissions_plus_admin_balance() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Setup Soroswap with predictable 1:1 ratio
    let factory = create_factory(&env, &admin);
    let router = create_router(&env);
    router.initialize(&factory.address);

    let mut blnd = create_token(&env, &admin);
    let mut usdc = create_token(&env, &admin);

    if usdc.address < blnd.address {
        core::mem::swap(&mut blnd, &mut usdc);
    }

    let liquidity_provider = Address::generate(&env);
    let liquidity_amount = 100_000_000_0000000i128; // 100M for deep liquidity
    blnd.mint(&liquidity_provider, &liquidity_amount);
    usdc.mint(&liquidity_provider, &liquidity_amount);

    add_liquidity(
        &env,
        &router,
        &blnd.address,
        &usdc.address,
        liquidity_amount,
        liquidity_amount,
        &liquidity_provider,
    );

    // Create vault with known amounts
    let vault_address = create_mock_vault(&env);
    let vault_client = MockVaultClient::new(&env, &vault_address);

    let emissions = 3000_0000000i128; // 3000 BLND from emissions
    let admin_bal = 2000_0000000i128; // 2000 BLND from admin
    let total_blnd = emissions + admin_bal; // 5000 BLND total

    vault_client.set_emissions(&1u32, &emissions);
    vault_client.set_admin_balance(&admin_bal);

    blnd.mint(&vault_address, &total_blnd);

    let reserve_token_ids = vec![&env, 1u32];
    let client = create_blendizzard_contract(
        &env,
        &admin,
        &vault_address,
        &router.address,
        &blnd.address,
        &usdc.address,
        100,
        reserve_token_ids,
    );

    // Get initial USDC balance
    let initial_usdc = usdc.balance(&client.address);

    // Minimal activity
    let game = Address::generate(&env);
    let p1 = Address::generate(&env);

    client.add_game(&game);
    client.deposit(&p1, &1000_0000000);
    client.select_faction(&p1, &0);

    env.ledger().with_mut(|li| {
        li.timestamp += 101;
    });

    blnd.mint(&client.address, &total_blnd);

    // Cycle epoch
    let _result = client.try_cycle_epoch();

    // Get final USDC balance
    let final_usdc = usdc.balance(&client.address);
    let usdc_gained = final_usdc - initial_usdc;

    let epoch_0 = client.get_epoch(&Some(0));

    // Reward pool should equal the USDC gained from swapping total BLND
    // (emissions + admin_balance)
    assert!(
        epoch_0.reward_pool == usdc_gained,
        "Reward pool should equal USDC from swap: expected {}, got {}",
        usdc_gained,
        epoch_0.reward_pool
    );

    // With 1:1 liquidity and small swap, should be approximately 5000 USDC
    // (minus a small amount for swap fees)
    assert!(
        epoch_0.reward_pool > 4900_0000000 && epoch_0.reward_pool < total_blnd,
        "Reward pool should be ~5000 USDC (accounting for fees): got {}",
        epoch_0.reward_pool
    );
}
