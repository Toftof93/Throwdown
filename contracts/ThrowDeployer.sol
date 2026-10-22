// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ThrowToken} from "./ThrowToken.sol";
import {ThrowHook} from "./ThrowHook.sol";

/// @title ThrowDeployer
/// @notice Holds the creation code for Throwdown's coins and hook so the factory stays under the
///         contract size limit. It has no state and no owner; anything it creates is checked by
///         the factory before use.
contract ThrowDeployer {
    function deployToken(string calldata name, string calldata symbol, address to, uint256 supply, address bondedCreator, uint64 bondEnd)
        external
        returns (address)
    {
        return address(new ThrowToken(name, symbol, to, supply, bondedCreator, bondEnd));
    }

    function deployHook(bytes32 salt, IPoolManager poolManager, address factory) external returns (address) {
        return address(new ThrowHook{salt: salt}(poolManager, factory));
    }

    /// @notice keccak256 of the hook's creation code, for finding a salt off-chain.
    function hookInitCodeHash(IPoolManager poolManager, address factory) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(type(ThrowHook).creationCode, abi.encode(poolManager, factory)));
    }
}
