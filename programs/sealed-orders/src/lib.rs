//! Sealed Orders: a real-time strategy game on a MagicBlock Private Ephemeral
//! Rollup. Each army's orders and positions live in accounts only its own
//! commander can read; the battle advances on a scheduled crank inside the TEE.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::system_program::{transfer, Transfer};
use ephemeral_rollups_sdk::access_control::instructions::{
    CreateEphemeralPermissionCpi, UpdateEphemeralPermissionCpi,
};
use ephemeral_rollups_sdk::access_control::structs::{
    EphemeralMembersArgs, EphemeralPermission, Member,
};
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::crank::ScheduleCrankCpi;
use magicblock_magic_program_api::args::ScheduleTaskArgs;

pub mod sim;
use sim::*;

declare_id!("3i78SahtFXsvLVUbEJc1cgoUk3WnUTB9LHtEwMDbNCxH");

pub const GAME_SEED: &[u8] = b"game";
pub const ARMY_SEED: &[u8] = b"army";
pub const INTEL_SEED: &[u8] = b"intel";
pub const LOG_LEN: usize = 16;
pub const TEXT_LEN: usize = 96;

pub const STATUS_WAITING: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_ENDED: u8 = 2;

#[ephemeral]
#[program]
pub mod sealed_orders {
    use super::*;

    /// Base layer. Creates the game and side 0's army + intel, and pre-funds
    /// rent for the ephemeral permissions each PDA will create on the rollup.
    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: u64,
        commander: Pubkey,
        vs_ai: bool,
        min_slots: u8,
    ) -> Result<()> {
        prefund(&ctx.accounts.payer, &ctx.accounts.game.to_account_info(), 3, &ctx.accounts.system_program)?;
        prefund(&ctx.accounts.payer, &ctx.accounts.army.to_account_info(), 1, &ctx.accounts.system_program)?;
        prefund(&ctx.accounts.payer, &ctx.accounts.intel.to_account_info(), 1, &ctx.accounts.system_program)?;

        let g = &mut ctx.accounts.game;
        g.game_id = game_id;
        g.commanders = [commander, Pubkey::default()];
        g.joined = 1;
        g.status = STATUS_WAITING;
        g.vs_ai = vs_ai;
        g.min_slots = min_slots;
        g.created_at = Clock::get()?.unix_timestamp;
        let w = new_world();
        g.control = w.control;

        init_side(&mut *ctx.accounts.army.load_init()?, &mut ctx.accounts.intel, game_id, 0, commander, &w);
        Ok(())
    }

    /// Base layer. Side 1 joins.
    pub fn join_game(ctx: Context<JoinGame>, game_id: u64, commander: Pubkey) -> Result<()> {
        prefund(&ctx.accounts.payer, &ctx.accounts.army.to_account_info(), 1, &ctx.accounts.system_program)?;
        prefund(&ctx.accounts.payer, &ctx.accounts.intel.to_account_info(), 1, &ctx.accounts.system_program)?;

        let g = &mut ctx.accounts.game;
        require!(g.joined == 1, GameError::GameFull);
        require!(g.commanders[0] != commander, GameError::CannotJoinOwnGame);
        g.commanders[1] = commander;
        g.joined = 3;

        let w = new_world();
        init_side(&mut *ctx.accounts.army.load_init()?, &mut ctx.accounts.intel, game_id, 1, commander, &w);
        Ok(())
    }

    /// Base layer. Delegate any game PDA to the (TEE) ephemeral validator.
    pub fn delegate_pda(ctx: Context<DelegatePda>, account_type: AccountType) -> Result<()> {
        let seeds = account_type.seeds();
        let refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();
        let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &refs,
            DelegateConfig { validator, ..Default::default() },
        )?;
        Ok(())
    }

    /// Rollup. Creates the permission for a delegated PDA. `members = None` makes
    /// it public. The PDA pays its own rent from the pre-funded lamports.
    pub fn init_permission(
        ctx: Context<InitPermission>,
        account_type: AccountType,
        members: Option<Vec<Member>>,
    ) -> Result<()> {
        if ctx.accounts.permission.lamports() > 0 {
            return Ok(());
        }
        let mut seeds = account_type.seeds();
        let (pda, bump) = Pubkey::find_program_address(
            &seeds.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
            &crate::ID,
        );
        require_keys_eq!(pda, ctx.accounts.permissioned_account.key(), GameError::WrongAccount);
        seeds.push(vec![bump]);
        let refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();
        let (is_private, members) = match members {
            Some(m) => (true, m),
            None => (false, vec![]),
        };
        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.permissioned_account.to_account_info(),
            permissioned_account: ctx.accounts.permissioned_account.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs { is_private, members },
        }
        .invoke_signed(&[refs.as_slice()])?;
        Ok(())
    }

    /// Rollup. Either commander starts the battle once both have joined.
    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        let g = &mut ctx.accounts.game;
        let who = ctx.accounts.commander.key();
        require!(g.commanders.contains(&who), GameError::NotACommander);
        require!(g.joined == 3, GameError::MissingOpponent);
        require!(g.status == STATUS_WAITING, GameError::AlreadyStarted);
        g.status = STATUS_ACTIVE;
        g.last_slot = Clock::get()?.slot;
        Ok(())
    }

    /// Rollup. Replace orders for one or more squads. Signed by the army's own
    /// commander key; the plain-English text is kept in the sealed log so it can
    /// be revealed after the battle.
    pub fn issue_orders(ctx: Context<IssueOrders>, orders: Vec<OrderIn>, text: Vec<u8>) -> Result<()> {
        let g = &ctx.accounts.game;
        require!(g.status != STATUS_ENDED, GameError::GameOver);
        require!(!orders.is_empty() && orders.len() <= SQUADS, GameError::BadOrder);
        require!(text.len() <= TEXT_LEN, GameError::TextTooLong);
        let mut army = ctx.accounts.army.load_mut()?;
        require!(army.game_id == g.game_id, GameError::WrongAccount);
        require_keys_eq!(army.commander, ctx.accounts.commander.key(), GameError::NotACommander);

        let mut mask = 0u8;
        for o in orders.iter() {
            let i = o.squad as usize;
            require!(i < SQUADS, GameError::BadOrder);
            o.action.validate()?;
            for r in o.rules.iter() {
                r.trigger.validate()?;
                r.action.validate()?;
            }
            let u = &mut army.units[i];
            u.action = o.action.into();
            for r in 0..2 {
                u.rules[r] = ZRule { trigger: o.rules[r].trigger.into(), action: o.rules[r].action.into(), fired: 0 };
            }
            mask |= 1 << i;
        }

        let slot = (army.log_count as usize) % LOG_LEN;
        let mut buf = [0u8; TEXT_LEN];
        buf[..text.len()].copy_from_slice(&text);
        army.log[slot] = LogEntry { tick: g.tick, mask, len: text.len() as u8, text: buf };
        army.log_count = army.log_count.wrapping_add(1);
        Ok(())
    }

    /// Rollup. Advance the battle by one tick. Permissionless (the crank calls
    /// it); rate-limited by `min_slots`.
    pub fn tick(ctx: Context<Tick>) -> Result<()> {
        let g = &mut ctx.accounts.game;
        if g.status != STATUS_ACTIVE {
            return Ok(());
        }
        let slot = Clock::get()?.slot;
        if slot < g.last_slot.saturating_add(g.min_slots as u64) {
            return Ok(());
        }
        g.last_slot = slot;

        let mut a0 = ctx.accounts.army0.load_mut()?;
        let mut a1 = ctx.accounts.army1.load_mut()?;
        let (i0, i1) = (&mut ctx.accounts.intel0, &mut ctx.accounts.intel1);
        let mut w = World {
            armies: [a0.to_units(), a1.to_units()],
            intel: [i0.to_seen(), i1.to_seen()],
            control: g.control,
            scores: g.scores,
            tick: g.tick,
            winner: g.winner,
        };
        sim::step(&mut w);
        a0.from_units(&w.armies[0]);
        a1.from_units(&w.armies[1]);
        i0.from_seen(&w.intel[0]);
        i1.from_seen(&w.intel[1]);
        g.control = w.control;
        g.scores = w.scores;
        g.tick = w.tick;
        g.winner = w.winner;
        if w.winner != 0 {
            g.status = STATUS_ENDED;
        }
        Ok(())
    }

    /// Rollup. Schedule `tick` as a crank.
    pub fn schedule_ticks<'info>(
        ctx: Context<'info, ScheduleTicks<'info>>,
        task_id: i64,
        interval_ms: i64,
        iterations: i64,
    ) -> Result<()> {
        let tick_ix = Instruction {
            program_id: crate::ID,
            accounts: vec![
                AccountMeta::new(ctx.accounts.game.key(), false),
                AccountMeta::new(ctx.accounts.army0.key(), false),
                AccountMeta::new(ctx.accounts.army1.key(), false),
                AccountMeta::new(ctx.accounts.intel0.key(), false),
                AccountMeta::new(ctx.accounts.intel1.key(), false),
            ],
            data: anchor_lang::InstructionData::data(&crate::instruction::Tick {}),
        };
        // The CPI helper wants `&'info AccountInfo<'info>`; leaking is fine inside a
        // single program invocation (the heap is dropped when it returns).
        let accs: &'info [AccountInfo<'info>] = Box::leak(Box::new([
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.game.to_account_info(),
            ctx.accounts.army0.to_account_info(),
            ctx.accounts.army1.to_account_info(),
            ctx.accounts.intel0.to_account_info(),
            ctx.accounts.intel1.to_account_info(),
        ]));
        let payer: &'info AccountInfo<'info> = Box::leak(Box::new(ctx.accounts.payer.to_account_info()));
        let magic: &'info AccountInfo<'info> = Box::leak(Box::new(ctx.accounts.magic_program.to_account_info()));
        ScheduleCrankCpi {
            payer,
            magic_program: magic,
            instruction_accounts: accs,
            args: ScheduleTaskArgs {
                task_id,
                execution_interval_millis: interval_ms,
                iterations,
                instructions: vec![tick_ix],
            },
        }
        .invoke()?;
        Ok(())
    }

    /// Rollup. After the battle, anyone can make every account public so the
    /// full replay (positions + every order, with its original text) is readable.
    pub fn reveal(ctx: Context<Reveal>) -> Result<()> {
        let g = &ctx.accounts.game;
        require!(g.status == STATUS_ENDED, GameError::NotOver);
        let id = g.game_id.to_le_bytes();
        let a = &ctx.accounts;
        let public = || EphemeralMembersArgs { is_private: false, members: vec![] };
        let targets: [(AccountInfo, AccountInfo, Vec<Vec<u8>>); 5] = [
            (a.game.to_account_info(), a.permission_game.to_account_info(), vec![GAME_SEED.to_vec(), id.to_vec()]),
            (a.army0.to_account_info(), a.permission_army0.to_account_info(), vec![ARMY_SEED.to_vec(), id.to_vec(), vec![0]]),
            (a.army1.to_account_info(), a.permission_army1.to_account_info(), vec![ARMY_SEED.to_vec(), id.to_vec(), vec![1]]),
            (a.intel0.to_account_info(), a.permission_intel0.to_account_info(), vec![INTEL_SEED.to_vec(), id.to_vec(), vec![0]]),
            (a.intel1.to_account_info(), a.permission_intel1.to_account_info(), vec![INTEL_SEED.to_vec(), id.to_vec(), vec![1]]),
        ];
        for (acc, perm, mut seeds) in targets {
            let (_, bump) = Pubkey::find_program_address(
                &seeds.iter().map(|s| s.as_slice()).collect::<Vec<_>>(),
                &crate::ID,
            );
            seeds.push(vec![bump]);
            let refs: Vec<&[u8]> = seeds.iter().map(|s| s.as_slice()).collect();
            UpdateEphemeralPermissionCpi {
                payer: acc.clone(),
                permissioned_account: acc.clone(),
                permission: perm,
                vault: a.ephemeral_vault.to_account_info(),
                magic_program: a.magic_program.to_account_info(),
                permission_program: a.permission_program.to_account_info(),
                authority: acc.clone(),
                authority_is_signer: false,
                args: public(),
            }
            .invoke_signed(&[refs.as_slice()])?;
        }
        Ok(())
    }
}

fn prefund<'info>(
    payer: &Signer<'info>,
    to: &AccountInfo<'info>,
    members: usize,
    system_program: &Program<'info, System>,
) -> Result<()> {
    transfer(
        CpiContext::new(
            system_program.key(),
            Transfer { from: payer.to_account_info(), to: to.clone() },
        ),
        ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(members) as u32),
    )
}

fn init_side(army: &mut Army, intel: &mut Intel, game_id: u64, side: u8, commander: Pubkey, w: &World) {
    army.game_id = game_id;
    army.side = side;
    army.commander = commander;
    army.from_units(&w.armies[side as usize]);
    intel.game_id = game_id;
    intel.side = side;
    intel.from_seen(&w.intel[side as usize]);
}

// ---------- account types ----------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug, InitSpace)]
pub struct ActionS {
    pub kind: u8,
    pub x: u8,
    pub y: u8,
}
impl ActionS {
    fn validate(&self) -> Result<()> {
        require!(self.kind <= A_RETREAT, GameError::BadOrder);
        require!(self.x < W && self.y < H, GameError::BadOrder);
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug, InitSpace)]
pub struct TriggerS {
    pub kind: u8,
    pub a: u8,
    pub b: u8,
    pub c: u8,
}
impl TriggerS {
    fn validate(&self) -> Result<()> {
        require!(self.kind <= T_POINT_LOST, GameError::BadOrder);
        if self.kind == T_ENEMY_NEAR {
            require!(self.a < W && self.b < H, GameError::BadOrder);
        }
        if self.kind == T_POINT_LOST {
            require!(self.a < 3, GameError::BadOrder);
        }
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug, InitSpace)]
pub struct RuleIn {
    pub trigger: TriggerS,
    pub action: ActionS,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct OrderIn {
    pub squad: u8,
    pub action: ActionS,
    pub rules: [RuleIn; 2],
}

// Zero-copy types stored inside the Army account (read in place, never copied
// onto the 4 KB BPF stack).
#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct ZAction {
    pub kind: u8,
    pub x: u8,
    pub y: u8,
}
impl From<ActionS> for ZAction {
    fn from(a: ActionS) -> Self {
        Self { kind: a.kind, x: a.x, y: a.y }
    }
}

#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct ZTrigger {
    pub kind: u8,
    pub a: u8,
    pub b: u8,
    pub c: u8,
}
impl From<TriggerS> for ZTrigger {
    fn from(t: TriggerS) -> Self {
        Self { kind: t.kind, a: t.a, b: t.b, c: t.c }
    }
}

#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct ZRule {
    pub trigger: ZTrigger,
    pub action: ZAction,
    pub fired: u8,
}

#[zero_copy]
#[derive(Default, Debug, PartialEq, Eq)]
pub struct UnitState {
    pub kind: u8,
    pub x: u8,
    pub y: u8,
    pub hp: u8,
    pub cooldown: u8,
    pub action: ZAction,
    pub rules: [ZRule; 2],
}

#[zero_copy]
#[derive(Debug, PartialEq, Eq)]
pub struct LogEntry {
    pub tick: u16,
    pub mask: u8,
    pub len: u8,
    pub text: [u8; TEXT_LEN],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug, InitSpace)]
pub struct SeenState {
    pub visible: u8,
    pub x: u8,
    pub y: u8,
    pub hp: u8,
    pub last_seen: u16,
}

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub game_id: u64,
    pub commanders: [Pubkey; 2],
    pub joined: u8,
    pub status: u8,
    pub vs_ai: bool,
    pub min_slots: u8,
    pub tick: u16,
    pub last_slot: u64,
    pub control: [u8; 3],
    pub scores: [u16; 2],
    pub winner: u8,
    pub created_at: i64,
}

#[account(zero_copy)]
pub struct Army {
    pub game_id: u64,
    pub commander: Pubkey,
    pub log: [LogEntry; LOG_LEN],
    pub log_count: u16,
    pub units: [UnitState; SQUADS],
    pub side: u8,
    pub _pad: [u8; 5],
}

impl Army {
    fn to_units(&self) -> [Unit; SQUADS] {
        let mut out = [Unit::default(); SQUADS];
        for (i, s) in self.units.iter().enumerate() {
            let mut rules = [RuleS::default(); 2];
            for r in 0..2 {
                let rs = s.rules[r];
                rules[r] = RuleS {
                    trigger: Trig { kind: rs.trigger.kind, a: rs.trigger.a, b: rs.trigger.b, c: rs.trigger.c },
                    action: Act { kind: rs.action.kind, x: rs.action.x, y: rs.action.y },
                    fired: rs.fired != 0,
                };
            }
            out[i] = Unit {
                kind: s.kind,
                x: s.x,
                y: s.y,
                hp: s.hp,
                cooldown: s.cooldown,
                action: Act { kind: s.action.kind, x: s.action.x, y: s.action.y },
                rules,
            };
        }
        out
    }
    fn from_units(&mut self, units: &[Unit; SQUADS]) {
        for (i, u) in units.iter().enumerate() {
            let mut rules = [ZRule::default(); 2];
            for r in 0..2 {
                let ru = u.rules[r];
                rules[r] = ZRule {
                    trigger: ZTrigger { kind: ru.trigger.kind, a: ru.trigger.a, b: ru.trigger.b, c: ru.trigger.c },
                    action: ZAction { kind: ru.action.kind, x: ru.action.x, y: ru.action.y },
                    fired: ru.fired as u8,
                };
            }
            self.units[i] = UnitState {
                kind: u.kind,
                x: u.x,
                y: u.y,
                hp: u.hp,
                cooldown: u.cooldown,
                action: ZAction { kind: u.action.kind, x: u.action.x, y: u.action.y },
                rules,
            };
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct Intel {
    pub game_id: u64,
    pub side: u8,
    pub seen: [SeenState; SQUADS],
}

impl Intel {
    fn to_seen(&self) -> [Seen; SQUADS] {
        let mut out = [Seen::default(); SQUADS];
        for (i, s) in self.seen.iter().enumerate() {
            out[i] = Seen { visible: s.visible != 0, x: s.x, y: s.y, hp: s.hp, last_seen: s.last_seen };
        }
        out
    }
    fn from_seen(&mut self, seen: &[Seen; SQUADS]) {
        for (i, s) in seen.iter().enumerate() {
            self.seen[i] = SeenState { visible: s.visible as u8, x: s.x, y: s.y, hp: s.hp, last_seen: s.last_seen };
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum AccountType {
    Game { game_id: u64 },
    Army { game_id: u64, side: u8 },
    Intel { game_id: u64, side: u8 },
}

impl AccountType {
    fn seeds(&self) -> Vec<Vec<u8>> {
        match self {
            AccountType::Game { game_id } => vec![GAME_SEED.to_vec(), game_id.to_le_bytes().to_vec()],
            AccountType::Army { game_id, side } => {
                vec![ARMY_SEED.to_vec(), game_id.to_le_bytes().to_vec(), vec![*side]]
            }
            AccountType::Intel { game_id, side } => {
                vec![INTEL_SEED.to_vec(), game_id.to_le_bytes().to_vec(), vec![*side]]
            }
        }
    }
}

// ---------- contexts ----------

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct CreateGame<'info> {
    #[account(init, payer = payer, space = 8 + Game::INIT_SPACE, seeds = [GAME_SEED, &game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,
    #[account(init, payer = payer, space = 8 + std::mem::size_of::<Army>(), seeds = [ARMY_SEED, &game_id.to_le_bytes(), &[0]], bump)]
    pub army: AccountLoader<'info, Army>,
    #[account(init, payer = payer, space = 8 + Intel::INIT_SPACE, seeds = [INTEL_SEED, &game_id.to_le_bytes(), &[0]], bump)]
    pub intel: Box<Account<'info, Intel>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct JoinGame<'info> {
    #[account(mut, seeds = [GAME_SEED, &game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,
    #[account(init, payer = payer, space = 8 + std::mem::size_of::<Army>(), seeds = [ARMY_SEED, &game_id.to_le_bytes(), &[1]], bump)]
    pub army: AccountLoader<'info, Army>,
    #[account(init, payer = payer, space = 8 + Intel::INIT_SPACE, seeds = [INTEL_SEED, &game_id.to_le_bytes(), &[1]], bump)]
    pub intel: Box<Account<'info, Intel>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePda<'info> {
    /// CHECK: the PDA to delegate
    #[account(mut, del)]
    pub pda: UncheckedAccount<'info>,
    pub payer: Signer<'info>,
    /// CHECK: checked by the delegation program
    pub validator: Option<UncheckedAccount<'info>>,
}

#[derive(Accounts)]
pub struct InitPermission<'info> {
    /// CHECK: delegated PDA, verified against `account_type` seeds in the handler
    #[account(mut)]
    pub permissioned_account: UncheckedAccount<'info>,
    /// CHECK: verified by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: verified by the magic program
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,
    pub commander: Signer<'info>,
}

#[derive(Accounts)]
pub struct IssueOrders<'info> {
    #[account(seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub army: AccountLoader<'info, Army>,
    pub commander: Signer<'info>,
}

#[derive(Accounts)]
pub struct Tick<'info> {
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,
    #[account(mut, seeds = [ARMY_SEED, &game.game_id.to_le_bytes(), &[0]], bump)]
    pub army0: AccountLoader<'info, Army>,
    #[account(mut, seeds = [ARMY_SEED, &game.game_id.to_le_bytes(), &[1]], bump)]
    pub army1: AccountLoader<'info, Army>,
    #[account(mut, seeds = [INTEL_SEED, &game.game_id.to_le_bytes(), &[0]], bump)]
    pub intel0: Box<Account<'info, Intel>>,
    #[account(mut, seeds = [INTEL_SEED, &game.game_id.to_le_bytes(), &[1]], bump)]
    pub intel1: Box<Account<'info, Intel>>,
}

#[derive(Accounts)]
pub struct ScheduleTicks<'info> {
    /// CHECK: magic program, used for the crank CPI
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: passed through to the scheduled tick
    #[account(mut)]
    pub game: UncheckedAccount<'info>,
    /// CHECK: passed through to the scheduled tick
    #[account(mut)]
    pub army0: UncheckedAccount<'info>,
    /// CHECK: passed through to the scheduled tick
    #[account(mut)]
    pub army1: UncheckedAccount<'info>,
    /// CHECK: passed through to the scheduled tick
    #[account(mut)]
    pub intel0: UncheckedAccount<'info>,
    /// CHECK: passed through to the scheduled tick
    #[account(mut)]
    pub intel1: UncheckedAccount<'info>,
    /// CHECK: this program
    pub program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Reveal<'info> {
    #[account(mut, seeds = [GAME_SEED, &game.game_id.to_le_bytes()], bump)]
    pub game: Account<'info, Game>,
    #[account(mut, seeds = [ARMY_SEED, &game.game_id.to_le_bytes(), &[0]], bump)]
    pub army0: AccountLoader<'info, Army>,
    #[account(mut, seeds = [ARMY_SEED, &game.game_id.to_le_bytes(), &[1]], bump)]
    pub army1: AccountLoader<'info, Army>,
    #[account(mut, seeds = [INTEL_SEED, &game.game_id.to_le_bytes(), &[0]], bump)]
    pub intel0: Box<Account<'info, Intel>>,
    #[account(mut, seeds = [INTEL_SEED, &game.game_id.to_le_bytes(), &[1]], bump)]
    pub intel1: Box<Account<'info, Intel>>,
    /// CHECK: checked by the permission program
    #[account(mut)]
    pub permission_game: UncheckedAccount<'info>,
    /// CHECK: checked by the permission program
    #[account(mut)]
    pub permission_army0: UncheckedAccount<'info>,
    /// CHECK: checked by the permission program
    #[account(mut)]
    pub permission_army1: UncheckedAccount<'info>,
    /// CHECK: checked by the permission program
    #[account(mut)]
    pub permission_intel0: UncheckedAccount<'info>,
    /// CHECK: checked by the permission program
    #[account(mut)]
    pub permission_intel1: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: verified by the magic program
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: magic program
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[error_code]
pub enum GameError {
    #[msg("Game already has two commanders.")]
    GameFull,
    #[msg("You cannot join your own game.")]
    CannotJoinOwnGame,
    #[msg("Waiting for an opponent.")]
    MissingOpponent,
    #[msg("Only this army's commander can do this.")]
    NotACommander,
    #[msg("The battle has already started.")]
    AlreadyStarted,
    #[msg("The battle is over.")]
    GameOver,
    #[msg("The battle is not over yet.")]
    NotOver,
    #[msg("Invalid order.")]
    BadOrder,
    #[msg("Order text is longer than 96 bytes.")]
    TextTooLong,
    #[msg("Account does not match its seeds.")]
    WrongAccount,
}
