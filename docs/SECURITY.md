# Blendizzard Security Considerations

## Reentrancy Protection

### Soroban's Built-in Protection

Unlike EVM-based smart contracts, Soroban has fundamental differences that make traditional reentrancy attacks much less likely:

1. **Explicit Authorization**: The `require_auth()` mechanism checks authorization at the function entry point
2. **No Implicit Callbacks**: Cross-contract calls are explicit and don't trigger fallback functions
3. **No Native Token Transfers**: Token transfers go through explicit token contract calls

### Current Implementation

All Blendizzard functions follow the "Checks-Effects-Interactions" pattern:

1. **Checks**: Authorization and validation happen first
2. **Effects**: State changes are made to storage
3. **Interactions**: External contract calls happen last

#### Examples:

**vault::withdraw (contracts/blendizzard/src/vault.rs:97-143)**
```rust
// 1. Checks
user.require_auth();
if user_data.total_deposited < amount { return Err(...) }

// 2. Effects
user_data.total_deposited -= amount;
storage::set_user(env, user, &user_data);

// 3. Interactions
vault_client.withdraw(user, &amount);
```

**rewards::claim_yield (contracts/blendizzard/src/rewards.rs:36-111)**
```rust
// 1. Checks
user.require_auth();
if storage::has_claimed(env, user, epoch) { return Err(...) }

// 2. Effects
storage::set_claimed(env, user, epoch);

// 3. Interactions
usdc_client.transfer(&contract, user, &amount);
```

**epoch::withdraw_and_convert_rewards (contracts/blendizzard/src/epoch.rs:179-248)**
```rust
// 1. Pre-state capture
let pre_usdc_balance = usdc_client.balance(&contract);

// 2. External calls with proper authorization
env.authorize_as_current_contract(...);
vault_client.admin_withdraw(&blnd_balance);
router_client.swap_exact_tokens_for_tokens(...);

// 3. Post-state validation
let post_usdc_balance = usdc_client.balance(&contract);
let usdc_received = post_usdc_balance - pre_usdc_balance;
```

### Additional Protections

1. **Emergency Pause**: Admin can pause all user functions via `pause()` function
2. **Authorization Checks**: All sensitive functions use `require_auth()`
3. **State Validation**: All arithmetic uses checked operations
4. **Input Validation**: All user inputs are validated before use

## Attack Vectors Mitigated

### 1. Flash Deposit Attack
**Threat**: User deposits large amount just before epoch end to gain faction points

**Mitigation**: Time multiplier starts at 1.0x, takes 30 days to reach ~1.5x
**Location**: `contracts/blendizzard/src/faction_points.rs:113-147`

### 2. Epoch Boundary Manipulation
**Threat**: User times deposits/withdrawals around epoch boundaries

**Mitigation**:
- FP snapshot at first game start in epoch
- Reset penalty for >50% withdrawal

**Location**: `contracts/blendizzard/src/vault.rs:146-199`

### 3. Faction Switching Exploits
**Threat**: User switches faction mid-epoch to be on winning side

**Mitigation**: Faction locks on first game start, cannot change
**Location**: `contracts/blendizzard/src/faction.rs`

### 4. Reward Calculation Errors
**Threat**: Integer overflow in reward math

**Mitigation**: Use checked arithmetic and fixed-point math library
**Location**: `contracts/blendizzard/src/rewards.rs:134-150`

### 5. Replay Attacks
**Threat**: Reuse game outcome to claim multiple wins

**Mitigation**: Session IDs are unique and consumed after game ends
**Location**: `contracts/blendizzard/src/game.rs`

### 6. Slippage Manipulation
**Threat**: MEV bots sandwich attack the BLND→USDC swap

**Mitigation**: Slippage protection with configurable tolerance (default 5%)
**Location**: `contracts/blendizzard/src/epoch.rs:225-245`

## ZK Proof Verification Plan

### Phase 1-2: Oracle-Based Verification (Current)

**Status**: Placeholder implementation in place

**Approach**: Trusted multi-sig oracle verifies game outcomes

**Location**: `contracts/blendizzard/src/game.rs:290-297`

```rust
fn verify_proof(_env: &Env, _proof: &Bytes, _outcome: &GameOutcome) -> Result<(), Error> {
    // TODO: Phase 1-2: Oracle verification (multi-sig)
    // TODO: Phase 4: ZK proof verification when WASM verifier is available

    // For now, accept all proofs (development/testing only)
    Ok(())
}
```

**Implementation Plan**:
1. Deploy multi-sig oracle contract
2. Oracle signers verify off-chain game execution
3. Oracle submits signed outcome to `end_game`
4. Contract verifies oracle signatures before accepting outcome

**Security**: Multiple trusted signers (3-of-5 or 5-of-7 multi-sig)

### Phase 3-4: ZK Proof Verification (Future)

**Status**: Awaiting WASM verifier availability on Soroban

**Approach**: On-chain verification of risc0 or noir proofs

**Requirements**:
- WASM-based ZK verifier contract
- Proof generation infrastructure
- Verifier contract integration

**Timeline**: Monitor risc0/noir Soroban progress, implement when ready

**Migration**: Gradual transition from oracle to ZK proofs

## Audit Checklist

### ✅ Completed
- [x] All arithmetic uses checked operations or fixed-point math
- [x] All storage writes have corresponding validation
- [x] No unbounded loops or recursion
- [x] All user inputs are validated
- [x] All admin functions have access control
- [x] Time-dependent logic handles edge cases
- [x] Storage keys cannot collide (type-safe enum keys)
- [x] Events emitted for all state changes
- [x] Upgrade mechanism is secure
- [x] Emergency pause mechanism implemented
- [x] TTL management for persistent storage
- [x] Slippage protection for swaps
- [x] Authorization flows are correct

### 🔄 In Progress
- [ ] External security audit (Phase 3)
- [ ] ZK proof verification (Phase 4)

### ⏳ Pending
- [ ] Comprehensive fuzzing
- [ ] Load testing (many users/games)
- [ ] Failure mode analysis

## Best Practices Followed

1. **No `std` Library**: All code uses `#![no_std]` for Soroban compatibility
2. **Type Safety**: Storage keys use enum-based typing to prevent collisions
3. **Fixed-Point Math**: All multiplier calculations use `soroban-fixed-point-math`
4. **Explicit References**: Use references (`&env`, `&address`) to avoid cloning
5. **Authorization First**: All functions check authorization before proceeding
6. **State Before Interactions**: Update state before external calls
7. **Event Emissions**: All state changes emit events for off-chain monitoring

## Deployment Security

### Testnet Deployment Checklist
- [ ] Verify all contract addresses
- [ ] Test all functions with small amounts
- [ ] Verify oracle/multi-sig setup
- [ ] Test emergency pause functionality
- [ ] Verify TTL settings
- [ ] Test epoch cycling
- [ ] Test reward distribution

### Mainnet Deployment Checklist
- [ ] Complete external security audit
- [ ] Bug bounty program active
- [ ] Multisig for admin operations
- [ ] Gradual rollout with caps
- [ ] Monitoring and alerting setup
- [ ] Emergency response plan documented
- [ ] User funds insurance/protection considered

## Contact

For security concerns, please contact: [security@blendizzard.io]

**Do not** publicly disclose security vulnerabilities. Use responsible disclosure.
