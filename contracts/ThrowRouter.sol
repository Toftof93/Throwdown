// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title ThrowRouter
/// @notice A small exact-input swap router for Uniswap v4 pools. Pays with native ETH or an
///         approved ERC20, refunds unused ETH, and reverts if the output is below minOut.
///         It holds no funds between transactions.
contract ThrowRouter is IUnlockCallback {
    using SafeERC20 for IERC20;

    IPoolManager public immutable poolManager;

    struct Call {
        address payer;
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn;
        uint256 minOut;
        address to;
        bool quoteOnly;
    }

    error NotPoolManager();
    error Expired();
    error TooLittleReceived(uint256 out);
    error BadValue();
    error RefundFailed();
    error QuoteResult(uint256 out, uint256 spent);

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
    }

    function swap(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint256 minOut, address to, uint256 deadline)
        external
        payable
        returns (uint256 out)
    {
        if (block.timestamp > deadline) revert Expired();
        Currency input = zeroForOne ? key.currency0 : key.currency1;
        if (input.isAddressZero() ? msg.value != amountIn : msg.value != 0) revert BadValue();
        bytes memory res = poolManager.unlock(abi.encode(Call(msg.sender, key, zeroForOne, amountIn, minOut, to, false)));
        uint256 spent;
        (out, spent) = abi.decode(res, (uint256, uint256));
        // A price limit can stop the swap early; give back any ETH it did not use.
        if (input.isAddressZero() && spent < amountIn) {
            (bool ok,) = msg.sender.call{value: amountIn - spent}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @notice Simulates a swap and returns what it would give. Call it with eth_call; it never
    ///         moves funds because the swap is reverted before anything is paid.
    function quote(PoolKey calldata key, bool zeroForOne, uint256 amountIn) external returns (uint256 out, uint256 spent) {
        try poolManager.unlock(abi.encode(Call(msg.sender, key, zeroForOne, amountIn, 0, address(0), true))) {}
        catch (bytes memory reason) {
            if (reason.length == 68 && bytes4(reason) == QuoteResult.selector) {
                assembly {
                    out := mload(add(reason, 36))
                    spent := mload(add(reason, 68))
                }
                return (out, spent);
            }
            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        Call memory c = abi.decode(data, (Call));
        BalanceDelta d = poolManager.swap(
            c.key,
            SwapParams({
                zeroForOne: c.zeroForOne,
                amountSpecified: -int256(c.amountIn),
                sqrtPriceLimitX96: c.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        (int128 inDelta, int128 outDelta) = c.zeroForOne ? (d.amount0(), d.amount1()) : (d.amount1(), d.amount0());
        uint256 spent = uint256(uint128(-inDelta));
        uint256 out = uint256(uint128(outDelta));
        if (c.quoteOnly) revert QuoteResult(out, spent);
        if (out < c.minOut) revert TooLittleReceived(out);

        Currency input = c.zeroForOne ? c.key.currency0 : c.key.currency1;
        Currency output = c.zeroForOne ? c.key.currency1 : c.key.currency0;
        if (input.isAddressZero()) {
            poolManager.settle{value: spent}();
        } else {
            poolManager.sync(input);
            IERC20(Currency.unwrap(input)).safeTransferFrom(c.payer, address(poolManager), spent);
            poolManager.settle();
        }
        poolManager.take(output, c.to, out);
        return abi.encode(out, spent);
    }

    receive() external payable {
        if (msg.sender != address(poolManager)) revert BadValue();
    }
}
