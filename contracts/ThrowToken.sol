// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title ThrowToken
/// @notice A plain fixed-supply coin launched on Throwdown. The whole supply is minted once, to
///         the factory. No owner, no mint, no blacklist, no pause, no tax.
///         If the creator posted a bond, the coin remembers whether the creator's wallet moved
///         any of it before the bond ends. Moving coins is never blocked; it only breaks the bond.
contract ThrowToken is ERC20Burnable {
    address public immutable bondedCreator;
    uint64 public immutable bondEnd;
    bool public bondBroken;

    event BondBroken(address indexed creator);

    constructor(string memory name_, string memory symbol_, address to, uint256 supply, address bondedCreator_, uint64 bondEnd_)
        ERC20(name_, symbol_)
    {
        bondedCreator = bondedCreator_;
        bondEnd = bondEnd_;
        _mint(to, supply);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && from == bondedCreator && !bondBroken && block.timestamp < bondEnd) {
            bondBroken = true;
            emit BondBroken(from);
        }
        super._update(from, to, value);
    }
}
