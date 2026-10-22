// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title ThrowHook
/// @notice Runs Throwdown's rules on every pool:
///         1. The opening bell. Nobody can trade a coin before it opens.
///         2. The sniper tax. The swap fee starts at 50% at the open and falls in a straight line
///            to 1% over two minutes. It is an LP fee, so it is paid to the coin's locked liquidity.
///         3. The scorecard. It counts the ETH that flows into each coin (buys minus sells) during
///            its Arena round and during its 1v1 battle. Buying and selling back scores nothing,
///            so the only way to score is to leave money in the coin.
///         Only the Throwdown factory can create pools that use this hook, and its own prize
///         buybacks are not scored.
contract ThrowHook is IHooks {
    using PoolIdLibrary for PoolKey;

    uint24 public constant BASE_FEE = 10_000; // 1%
    uint24 public constant START_FEE = 500_000; // 50%
    uint256 public constant DECAY = 120; // seconds

    IPoolManager public immutable poolManager;
    address public immutable factory;

    struct Card {
        uint64 openAt;
        uint64 arenaEnd;
        uint64 battleEnd;
        int128 arenaNet; // net ETH in (wei) while the Arena round runs
        int128 battleNet; // net ETH in (wei) while the 1v1 battle runs
    }

    mapping(PoolId => Card) public cards;

    error NotPoolManager();
    error NotFactory();
    error NotOpen(uint256 openAt);
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(IPoolManager poolManager_, address factory_) {
        poolManager = poolManager_;
        factory = factory_;
        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    /// @notice Set by the factory just before it creates the pool.
    function setCard(PoolId id, uint64 openAt, uint64 arenaEnd, uint64 battleEnd) external {
        if (msg.sender != factory) revert NotFactory();
        Card storage c = cards[id];
        c.openAt = openAt;
        c.arenaEnd = arenaEnd;
        c.battleEnd = battleEnd;
    }

    function scores(PoolId id) external view returns (int128 arenaNet, int128 battleNet) {
        Card storage c = cards[id];
        return (c.arenaNet, c.battleNet);
    }

    /// @notice The swap fee (in hundredths of a basis point) a pool charges right now.
    function feeNow(PoolId id) public view returns (uint24) {
        return _feeAt(cards[id].openAt, block.timestamp);
    }

    function _feeAt(uint256 open, uint256 time) internal pure returns (uint24) {
        if (time < open) return START_FEE;
        uint256 elapsed = time - open;
        if (elapsed >= DECAY) return BASE_FEE;
        return uint24(START_FEE - ((uint256(START_FEE - BASE_FEE) * elapsed) / DECAY));
    }

    function beforeInitialize(address sender, PoolKey calldata, uint160) external view onlyPoolManager returns (bytes4) {
        if (sender != factory) revert NotFactory();
        return IHooks.beforeInitialize.selector;
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        uint256 open = cards[key.toId()].openAt;
        if (block.timestamp < open) revert NotOpen(open);
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, _feeAt(open, block.timestamp) | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function afterSwap(address sender, PoolKey calldata key, SwapParams calldata, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        if (sender != factory) {
            Card storage c = cards[key.toId()];
            // ETH is currency0. The delta is the trader's side: negative means they paid ETH in.
            int128 ethIn = -delta.amount0();
            if (block.timestamp < c.arenaEnd) c.arenaNet += ethIn;
            if (block.timestamp < c.battleEnd) c.battleNet += ethIn;
        }
        return (IHooks.afterSwap.selector, 0);
    }

    // Unused hooks. Their permission bits are off, so the pool manager never calls them.
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, BalanceDelta)
    {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, BalanceDelta)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
