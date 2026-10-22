// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {ThrowToken} from "./ThrowToken.sol";
import {ThrowHook} from "./ThrowHook.sol";
import {ThrowDeployer} from "./ThrowDeployer.sol";

/// @title ThrowdownFactory
/// @notice The launchpad where coins fight, on Uniswap v4.
///         - Every coin has a fixed supply of 1,000,000,000, trades against ETH, and has no owner.
///         - Its pool is seeded with the coin alone (launching costs only gas) and that liquidity
///           is held here forever; there is no way to remove it.
///         - The Arena: every coin fights in a 24-hour round. When the round ends, the three coins
///           with the most ETH flowing in (buys minus sells, counted by the hook) win the prize
///           pool, which buys their coins back and burns them (50/30/20).
///         - Challenges: a coin can call out a rival. Whoever answers within an hour launches at the
///           same moment, and after 24 hours the side with more ETH flowing in wins the battle pot.
///         - Swap fees from each coin's liquidity: 10% of the ETH side to the Arena prize pool,
///           20% to the battle pot while a battle runs, then the rest is split creator/platform.
///         - Bonds: a creator can lock ETH promising not to move their coins for 30 days. Keep the
///           promise and it comes back; break it and the bond buys back and burns the coin.
///         The owner can only change settings for future launches (starting price, minimum wait,
///         platform fee up to a hard cap, treasury). It can't touch liquidity, prize pools, pots,
///         bonds, locked coins or anyone's pending payouts.
contract ThrowdownFactory is IUnlockCallback, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint256 public constant SUPPLY = 1_000_000_000 ether;
    int24 public constant TICK_SPACING = 200;
    uint16 public constant MAX_CREATOR_BPS = 1_000; // 10% of supply
    uint16 public constant MAX_PROTOCOL_BPS = 3_000; // 30% of fees, hard cap
    uint32 public constant MAX_LOCK_DAYS = 3_650;
    uint16 public constant ARENA_BPS = 1_000; // 10% of ETH fees to the Arena prize pool
    uint16 public constant BATTLE_BPS = 2_000; // 20% of ETH fees to the battle pot while a battle runs
    uint256 public constant ROUND = 1 days;
    uint256 public constant LATE_ENTRY = 6 hours; // coins opening this close to a round's end join the next one
    uint256 public constant ANSWER_WINDOW = 1 hours;
    uint256 public constant BATTLE_LEN = 1 days;
    uint256 public constant BOND_TIME = 30 days;
    uint256 public constant MIN_BOND = 0.01 ether;
    uint256 public constant MAX_PER_ROUND = 300;

    IPoolManager public immutable poolManager;
    ThrowDeployer public immutable deployer;
    ThrowHook public hook;

    address public treasury;
    uint16 public protocolBps = 2_000; // 20% of what's left goes to the platform
    uint32 public minLead = 5 minutes;
    int24 public startTick; // starting price, as the tick of "ETH per coin" in raw units

    struct Coin {
        address creator;
        int24 tickLower;
        int24 tickUpper;
        uint64 openAt;
        uint32 round;
        uint32 battle;
        uint64 unlockAt;
        uint128 locked;
        uint128 bond;
        bool bondSettled;
        uint128 burned;
    }

    struct Round {
        uint128 pool;
        bool settled;
        address[3] winners;
    }

    struct Battle {
        address a;
        address b;
        uint64 start;
        uint128 pot;
        bool settled;
        address winner;
        string rival;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string meta; // JSON: description, image, links
        uint16 creatorBps;
        uint32 lockDays;
    }

    mapping(address => Coin) public coins;
    mapping(address => string) public meta;
    mapping(uint256 => Round) internal _rounds;
    mapping(uint256 => address[]) internal _roundCoins;
    mapping(address => uint256) public pending;
    Battle[] internal _battles;
    address[] public allCoins;

    enum Action {
        Seed,
        Claim,
        Buyback
    }

    event Launched(
        address indexed token,
        address indexed creator,
        uint256 indexed round,
        uint256 battle,
        PoolId poolId,
        string name,
        string symbol,
        uint256 openAt,
        uint256 creatorAmount,
        uint256 unlockAt,
        uint256 bond
    );
    event Challenged(uint256 indexed battle, address indexed token, string rival, uint256 start);
    event Answered(uint256 indexed battle, address indexed token);
    event FeesClaimed(address indexed token, uint256 creatorEth, uint256 creatorToken, uint256 protocolEth, uint256 arenaEth, uint256 battleEth);
    event Withdrawn(address indexed to, uint256 amount);
    event RoundSettled(uint256 indexed round, address[3] winners, uint256[3] prizes, uint256[3] burned, uint256 rolledOver);
    event BattleSettled(uint256 indexed battle, address winner, uint256 pot, uint256 burned);
    event BondSettled(address indexed token, bool broken, uint256 amount, uint256 burned);
    event LockExtended(address indexed token, uint256 unlockAt);
    event Unlocked(address indexed token, uint256 amount);
    event CreatorChanged(address indexed token, address creator);
    event MetaUpdated(address indexed token, string meta);
    event HookDeployed(address hook);
    event StartTickSet(int24 tick);
    event ProtocolFeeSet(uint16 bps);
    event TreasurySet(address treasury);
    event MinLeadSet(uint32 minLead);

    error NoHook();
    error HookExists();
    error BadHookAddress();
    error TooMuchForCreator();
    error LockTooLong();
    error BadBps();
    error BadTick();
    error BadName();
    error MetaTooLong();
    error BondTooSmall();
    error NotLaunched();
    error NotCreator();
    error StillLocked();
    error NothingLocked();
    error LockNotLater();
    error NotPoolManager();
    error BadLead();
    error ZeroAddress();
    error NoBattle();
    error AlreadyAnswered();
    error AnswerClosed();
    error NotOver();
    error AlreadySettled();
    error NoBond();
    error BondRunning();
    error NotOpenYet();
    error NothingToWithdraw();
    error PayFailed();

    constructor(IPoolManager poolManager_, ThrowDeployer deployer_, address owner_, address treasury_, int24 startTick_) Ownable(owner_) {
        if (address(poolManager_) == address(0) || address(deployer_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        poolManager = poolManager_;
        deployer = deployer_;
        treasury = treasury_;
        _setStartTick(startTick_);
        _battles.push(); // battle ids start at 1
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert ZeroAddress();
    }

    // ------------------------------------------------------------------ setup

    /// @notice Sets the hook, once. It must be built for this factory and pool manager, and sit at
    ///         an address whose low bits switch on exactly beforeInitialize, beforeSwap and afterSwap.
    ///         Deploy it with ThrowDeployer.deployHook using a salt found with hookInitCodeHash.
    function setHook(ThrowHook h) external onlyOwner {
        if (address(hook) != address(0)) revert HookExists();
        if (h.factory() != address(this) || h.poolManager() != poolManager) revert BadHookAddress();
        if (uint160(address(h)) & Hooks.ALL_HOOK_MASK != (Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG)) {
            revert BadHookAddress();
        }
        hook = h;
        emit HookDeployed(address(h));
    }

    function setStartTick(int24 tick) external onlyOwner {
        _setStartTick(tick);
    }

    function _setStartTick(int24 tick) internal {
        int24 t = tick < 0 ? -tick : tick;
        if (t >= TickMath.maxUsableTick(TICK_SPACING) - TICK_SPACING) revert BadTick();
        startTick = tick;
        emit StartTickSet(tick);
    }

    function setProtocolBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_BPS) revert BadBps();
        protocolBps = bps;
        emit ProtocolFeeSet(bps);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setMinLead(uint32 lead) external onlyOwner {
        if (lead > ANSWER_WINDOW) revert BadLead();
        minLead = lead;
        emit MinLeadSet(lead);
    }

    // ----------------------------------------------------------------- launch

    /// @notice Launches a coin straight into the Arena. Send ETH with it to post a bond.
    function launch(LaunchParams calldata p) external payable nonReentrant returns (address token) {
        token = _create(p, uint64(block.timestamp + minLead), 0, 0);
    }

    /// @notice Launches a coin that calls out a rival. Anyone can answer for the next hour; both
    ///         coins then open at the same moment and battle for 24 hours.
    function challenge(LaunchParams calldata p, string calldata rival) external payable nonReentrant returns (address token, uint256 id) {
        if (bytes(rival).length == 0 || bytes(rival).length > 32) revert BadName();
        uint64 start = uint64(block.timestamp + ANSWER_WINDOW);
        id = _battles.length;
        Battle storage b = _battles.push();
        b.start = start;
        b.rival = rival;
        token = _create(p, start, uint64(start + BATTLE_LEN), uint32(id));
        b.a = token;
        emit Challenged(id, token, rival, start);
    }

    /// @notice Answers an open challenge with a new coin that opens at the same moment.
    function answer(uint256 id, LaunchParams calldata p) external payable nonReentrant returns (address token) {
        if (id == 0 || id >= _battles.length) revert NoBattle();
        Battle storage b = _battles[id];
        if (b.b != address(0)) revert AlreadyAnswered();
        if (block.timestamp >= b.start) revert AnswerClosed();
        token = _create(p, b.start, uint64(b.start + BATTLE_LEN), uint32(id));
        b.b = token;
        emit Answered(id, token);
    }

    function _create(LaunchParams calldata p, uint64 openAt, uint64 battleEnd, uint32 battleId) internal returns (address token) {
        if (address(hook) == address(0)) revert NoHook();
        if (p.creatorBps > MAX_CREATOR_BPS) revert TooMuchForCreator();
        if (p.lockDays > MAX_LOCK_DAYS) revert LockTooLong();
        if (bytes(p.name).length == 0 || bytes(p.name).length > 64 || bytes(p.symbol).length == 0 || bytes(p.symbol).length > 16) revert BadName();
        if (bytes(p.meta).length > 4096) revert MetaTooLong();
        if (msg.value > 0 && msg.value < MIN_BOND) revert BondTooSmall();

        bool bonded = msg.value > 0;
        token = deployer.deployToken(p.name, p.symbol, address(this), SUPPLY, bonded ? msg.sender : address(0), bonded ? uint64(openAt + BOND_TIME) : 0);

        Coin storage c = coins[token];
        c.creator = msg.sender;
        c.openAt = openAt;
        c.battle = battleId;
        c.bond = uint128(msg.value);
        c.round = uint32(_roundFor(openAt));
        _roundCoins[c.round].push(token);

        uint256 creatorAmount = (SUPPLY * p.creatorBps) / 10_000;
        if (creatorAmount > 0) {
            if (p.lockDays == 0) {
                IERC20(token).safeTransfer(msg.sender, creatorAmount);
            } else {
                c.locked = uint128(creatorAmount);
                c.unlockAt = uint64(block.timestamp + uint256(p.lockDays) * 1 days);
            }
        }

        // ETH is always currency0, so the coin sits below the starting price and buys push into it.
        int24 start = _floor(-startTick);
        c.tickLower = TickMath.minUsableTick(TICK_SPACING);
        c.tickUpper = start;

        PoolKey memory key = _key(token);
        hook.setCard(key.toId(), openAt, uint64((uint256(c.round) + 1) * ROUND), battleEnd);
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(start));
        poolManager.unlock(abi.encode(Action.Seed, abi.encode(token)));

        meta[token] = p.meta;
        allCoins.push(token);
        emit Launched(token, msg.sender, c.round, battleId, key.toId(), p.name, p.symbol, openAt, creatorAmount, c.unlockAt, msg.value);
    }

    /// @notice The Arena round a coin opening at `openAt` would fight in.
    function _roundFor(uint256 openAt) internal view returns (uint256 r) {
        r = openAt / ROUND;
        if (openAt + LATE_ENTRY > (r + 1) * ROUND) r++;
        while (_roundCoins[r].length >= MAX_PER_ROUND || _rounds[r].settled) r++;
    }

    // ------------------------------------------------------------------- fees

    /// @notice Collects the swap fees a coin's liquidity has earned and books them out. Anyone
    ///         can call it; ETH payouts wait in `pending` until their owner withdraws.
    function claim(address token) public nonReentrant {
        _claim(token);
    }

    function claimMany(address[] calldata tokens) external nonReentrant {
        for (uint256 i; i < tokens.length; i++) _claim(tokens[i]);
    }

    /// @notice Claims a coin's fees and pays the caller everything they're owed.
    function collect(address token) external nonReentrant {
        _claim(token);
        _withdraw(msg.sender);
    }

    function withdraw() external nonReentrant {
        _withdraw(msg.sender);
    }

    function _claim(address token) internal {
        if (coins[token].creator == address(0)) revert NotLaunched();
        poolManager.unlock(abi.encode(Action.Claim, abi.encode(token)));
    }

    function _withdraw(address to) internal {
        uint256 amount = pending[to];
        if (amount == 0) revert NothingToWithdraw();
        pending[to] = 0;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayFailed();
        emit Withdrawn(to, amount);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (Action action, bytes memory args) = abi.decode(data, (Action, bytes));
        if (action == Action.Seed) {
            _seed(abi.decode(args, (address)));
            return "";
        }
        if (action == Action.Claim) {
            _collectFees(abi.decode(args, (address)));
            return "";
        }
        (address[] memory tokens, uint256[] memory amounts) = abi.decode(args, (address[], uint256[]));
        uint256[] memory bought = new uint256[](tokens.length);
        for (uint256 i; i < tokens.length; i++) {
            if (amounts[i] > 0) bought[i] = _buyback(tokens[i], amounts[i]);
        }
        return abi.encode(bought);
    }

    function _seed(address token) internal {
        Coin storage c = coins[token];
        uint256 amount = IERC20(token).balanceOf(address(this)) - c.locked;
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(c.tickLower), TickMath.getSqrtPriceAtTick(c.tickUpper), amount);
        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            _key(token), ModifyLiquidityParams({tickLower: c.tickLower, tickUpper: c.tickUpper, liquidityDelta: int256(uint256(liquidity)), salt: 0}), ""
        );
        poolManager.sync(Currency.wrap(token));
        IERC20(token).safeTransfer(address(poolManager), uint256(uint128(-delta.amount1())));
        poolManager.settle();
        // Rounding leaves a few wei behind; burn them so nothing sits in the factory.
        uint256 dust = IERC20(token).balanceOf(address(this)) - c.locked;
        if (dust > 0) ThrowToken(token).burn(dust);
    }

    function _collectFees(address token) internal {
        Coin storage c = coins[token];
        (BalanceDelta fees,) = poolManager.modifyLiquidity(
            _key(token), ModifyLiquidityParams({tickLower: c.tickLower, tickUpper: c.tickUpper, liquidityDelta: 0, salt: 0}), ""
        );
        uint256 ethFee = uint256(uint128(fees.amount0()));
        uint256 tokenFee = uint256(uint128(fees.amount1()));

        uint256 arena = (ethFee * ARENA_BPS) / 10_000;
        uint256 battleCut;
        if (c.battle != 0) {
            Battle storage b = _battles[c.battle];
            if (b.b != address(0) && !b.settled) {
                battleCut = (ethFee * BATTLE_BPS) / 10_000;
                b.pot += uint128(battleCut);
            }
        }
        uint256 rest = ethFee - arena - battleCut;
        uint256 protocolEth = (rest * protocolBps) / 10_000;
        uint256 creatorEth = rest - protocolEth;
        // Fees go to the coin's own round until it's settled, then to whichever round is running.
        uint256 r = _rounds[c.round].settled ? currentRound() : c.round;
        _rounds[r].pool += uint128(arena);
        pending[treasury] += protocolEth;
        pending[c.creator] += creatorEth;
        if (ethFee > 0) poolManager.take(Currency.wrap(address(0)), address(this), ethFee);

        uint256 protocolToken = (tokenFee * protocolBps) / 10_000;
        if (protocolToken > 0) poolManager.take(Currency.wrap(token), treasury, protocolToken);
        if (tokenFee > protocolToken) poolManager.take(Currency.wrap(token), c.creator, tokenFee - protocolToken);
        emit FeesClaimed(token, creatorEth, tokenFee - protocolToken, protocolEth, arena, battleCut);
    }

    /// @notice Swaps ETH held here for the coin and burns it. Unspent ETH rolls into the running round.
    function _buyback(address token, uint256 ethIn) internal returns (uint256 bought) {
        BalanceDelta s = poolManager.swap(
            _key(token), SwapParams({zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}), ""
        );
        uint256 spent = uint256(uint128(-s.amount0()));
        bought = uint256(uint128(s.amount1()));
        poolManager.settle{value: spent}();
        poolManager.take(Currency.wrap(token), address(this), bought);
        ThrowToken(token).burn(bought);
        coins[token].burned += uint128(bought);
        if (ethIn > spent) _rounds[currentRound()].pool += uint128(ethIn - spent);
    }

    function _buybacks(address[] memory tokens, uint256[] memory amounts) internal returns (uint256[] memory) {
        return abi.decode(poolManager.unlock(abi.encode(Action.Buyback, abi.encode(tokens, amounts))), (uint256[]));
    }

    // ------------------------------------------------------------- settlement

    function currentRound() public view returns (uint256) {
        return block.timestamp / ROUND;
    }

    /// @notice Ends an Arena round: the three coins with the most net ETH in win the prize pool,
    ///         which buys them back and burns them. Anyone can call it once the round is over.
    function settleRound(uint256 r) external nonReentrant {
        Round storage rd = _rounds[r];
        if (rd.settled) revert AlreadySettled();
        if (block.timestamp < (r + 1) * ROUND) revert NotOver();
        rd.settled = true;

        address[3] memory top;
        int128[3] memory best;
        address[] storage list = _roundCoins[r];
        for (uint256 i; i < list.length; i++) {
            (int128 net,) = hook.scores(_key(list[i]).toId());
            if (net <= 0) continue;
            for (uint256 k; k < 3; k++) {
                if (top[k] == address(0) || net > best[k]) {
                    for (uint256 j = 2; j > k; j--) {
                        top[j] = top[j - 1];
                        best[j] = best[j - 1];
                    }
                    top[k] = list[i];
                    best[k] = net;
                    break;
                }
            }
        }

        uint16[3] memory shares = [5_000, 3_000, 2_000];
        uint256[3] memory prizes;
        uint256 used;
        uint256 n;
        for (uint256 k; k < 3; k++) {
            if (top[k] == address(0)) continue;
            prizes[k] = (uint256(rd.pool) * shares[k]) / 10_000;
            used += prizes[k];
            n++;
        }
        uint256 rolled = rd.pool - used;
        rd.pool = 0;
        rd.winners = top;
        _rounds[currentRound()].pool += uint128(rolled);

        uint256[3] memory burned;
        if (used > 0) {
            address[] memory tokens = new address[](n);
            uint256[] memory amounts = new uint256[](n);
            uint256 m;
            for (uint256 k; k < 3; k++) {
                if (prizes[k] == 0) continue;
                tokens[m] = top[k];
                amounts[m++] = prizes[k];
            }
            uint256[] memory got = _buybacks(tokens, amounts);
            m = 0;
            for (uint256 k; k < 3; k++) if (prizes[k] > 0) burned[k] = got[m++];
        }
        emit RoundSettled(r, top, prizes, burned, rolled);
    }

    /// @notice Ends a 1v1 battle: the side with more net ETH in wins the pot as a buyback.
    function settleBattle(uint256 id) external nonReentrant {
        if (id == 0 || id >= _battles.length) revert NoBattle();
        Battle storage b = _battles[id];
        if (b.b == address(0)) revert NoBattle();
        if (b.settled) revert AlreadySettled();
        if (block.timestamp < b.start + BATTLE_LEN) revert NotOver();
        // Book both sides' fees first so the pot holds everything earned during the battle.
        _claim(b.a);
        _claim(b.b);
        b.settled = true;

        (, int128 netA) = hook.scores(_key(b.a).toId());
        (, int128 netB) = hook.scores(_key(b.b).toId());
        uint256 pot = b.pot;
        b.pot = 0;
        uint256 burned;
        if (netA == netB) {
            _rounds[currentRound()].pool += uint128(pot);
        } else {
            b.winner = netA > netB ? b.a : b.b;
            if (pot > 0) {
                address[] memory tokens = new address[](1);
                uint256[] memory amounts = new uint256[](1);
                tokens[0] = b.winner;
                amounts[0] = pot;
                burned = _buybacks(tokens, amounts)[0];
            }
        }
        emit BattleSettled(id, b.winner, pot, burned);
    }

    /// @notice Settles a creator's bond: back to them after 30 untouched days, or, if their
    ///         wallet moved the coin, spent on buying the coin back and burning it.
    function settleBond(address token) external nonReentrant {
        Coin storage c = coins[token];
        if (c.bond == 0 || c.bondSettled) revert NoBond();
        bool broken = ThrowToken(token).bondBroken();
        uint256 amount = c.bond;
        uint256 burned;
        if (broken) {
            if (block.timestamp < c.openAt) revert NotOpenYet();
            c.bondSettled = true;
            address[] memory tokens = new address[](1);
            uint256[] memory amounts = new uint256[](1);
            tokens[0] = token;
            amounts[0] = amount;
            burned = _buybacks(tokens, amounts)[0];
        } else {
            if (block.timestamp < ThrowToken(token).bondEnd()) revert BondRunning();
            c.bondSettled = true;
            pending[ThrowToken(token).bondedCreator()] += amount;
        }
        emit BondSettled(token, broken, amount, burned);
    }

    // --------------------------------------------------------------- creator

    modifier onlyCreator(address token) {
        if (coins[token].creator != msg.sender) revert NotCreator();
        _;
    }

    /// @notice Releases the creator's locked coins once the lock has ended.
    function unlock(address token) external nonReentrant {
        Coin storage c = coins[token];
        if (c.locked == 0) revert NothingLocked();
        if (block.timestamp < c.unlockAt) revert StillLocked();
        uint256 amount = c.locked;
        c.locked = 0;
        IERC20(token).safeTransfer(c.creator, amount);
        emit Unlocked(token, amount);
    }

    /// @notice Pushes the unlock date further out. It can never be brought forward.
    function extendLock(address token, uint64 newUnlockAt) external onlyCreator(token) {
        Coin storage c = coins[token];
        if (c.locked == 0) revert NothingLocked();
        if (newUnlockAt <= c.unlockAt || newUnlockAt > block.timestamp + uint256(MAX_LOCK_DAYS) * 1 days) revert LockNotLater();
        c.unlockAt = newUnlockAt;
        emit LockExtended(token, newUnlockAt);
    }

    function setCreator(address token, address creator) external onlyCreator(token) {
        if (creator == address(0)) revert ZeroAddress();
        coins[token].creator = creator;
        emit CreatorChanged(token, creator);
    }

    function setMeta(address token, string calldata newMeta) external onlyCreator(token) {
        if (bytes(newMeta).length > 4096) revert MetaTooLong();
        meta[token] = newMeta;
        emit MetaUpdated(token, newMeta);
    }

    // ------------------------------------------------------------------ views

    function poolKey(address token) external view returns (PoolKey memory) {
        if (coins[token].creator == address(0)) revert NotLaunched();
        return _key(token);
    }

    function rounds(uint256 r) external view returns (uint256 pool, bool settled, address[3] memory winners, address[] memory roundCoins) {
        Round storage rd = _rounds[r];
        return (rd.pool, rd.settled, rd.winners, _roundCoins[r]);
    }

    function battles(uint256 id) external view returns (Battle memory) {
        return _battles[id];
    }

    function battleCount() external view returns (uint256) {
        return _battles.length - 1;
    }

    function coinCount() external view returns (uint256) {
        return allCoins.length;
    }

    function _key(address token) internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });
    }

    function _floor(int24 tick) internal pure returns (int24) {
        int24 r = tick % TICK_SPACING;
        return r < 0 ? tick - r - TICK_SPACING : tick - r;
    }
}
