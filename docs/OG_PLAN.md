Blend and fee vault v2
Soroswap to convert BLND to USDC

3 factions
	WholeNoodle
	PointyStick
	SpecialRock

4 day epochs

Players contribute faction points (fp) as they play games

Players have a per-epoch amount of faction points which are a factor of:
* Amount deposited to the pool
* Time deposited in the pool

Both time and amount deposited curves multipliers curve towards a bonus multiplier asymptote of:
* $1000 for the amount
* 30 days for the time

A withdraw of > 50% of total deposit during an epoch resets time deposited

add_game(id)
	allow this contract to be played as a game

remove_game(id)
	remove this contract as a playable game
	
is_game(id)
	is this contract a valid game?

deposit
	Likely just a forward to the fee vault	

withdraw
* Need to track and check if a deposit time multiplier reset is necessary. Will require tracking the total amount in the epoch at start and what the player has drawn down from that and if it has crossed 50%
* If there’s not player activity for the epoch yet we’ll need to initialize it here

select_faction(user, faction)
	Allow the user to select a faction
	This should go to a persistent user entry so it persists across epochs
	Do not allow a user to select a faction after the epoch has started unless it is their first action for the epoch (hasn’t played any games yet)
		This means we both track a per user and a per epoch faction
		This might mean the easier thing to do will be to allow this method to be called at any time but once the first game for the user is played they lock in their epoch faction at that time

get_player(user)
	return:
		selected faction
		total amount of deposited balance

start_game
	game_id
	session_id
	player 1 address
	player 2 address
	player 1 fp wager amount
	player 2 fp wager amount

When a game starts there’s actually quite a bit that needs to be recorded
	If it’s the players first game for the epoch we need to lock in their total available factions points for the epoch
	Lock in the user’s faction if it hasn’t been elected yet via `select_faction`

end_game
	requires risc0 or noir proof
		output: 
			game_id
			session_id
			player 1 address
			player 2 address
			winner (true for player 1, false for player 2)

get_epoch(optional number)
	get the current epoch if no number specified, otherwise the specified number
	Return the epoch number and faction standings

get_epoch_player
	return: 
		selected faction
		number of total faction points
		number of available faction points for epoch
		amount of deposited balance withdrawn this epoch

cycle_epoch
	closes current epoch
	decides faction winner for closed epoch
	locks in claimable rewards by contributed faction points
	opens next epoch

claim_yield(user, epoch)
	Claim the epoch winnings/yield for a user for a specific epoch

—

__constructor
	set default global variables including the admin

Set_admin
	update the admin address

Get_admin
	return the admin address

update
	optionally update any global variables

upgrade
	update the contract hash

—         