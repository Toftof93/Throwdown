// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ThrowShowcase
/// @notice Projects without a token: apps, products, art, anything being built.
///         - A builder lists a project. Anyone can back it with ETH, which goes to the builder.
///         - Backing is a gift. Backers get no tokens, shares or refunds; only their name on the
///           project and a place on its leaderboard.
///         - Projects fight on backing: every UTC day has its own ranking, plus an all-time one.
///         - A platform fee (hard-capped at 10%) is taken from each backing.
///         Payouts are pull-based: builders withdraw what they've been sent. The owner can hide a
///         listing (which stops new backing, e.g. for a scam) and change the fee for future
///         backing. It can't touch anyone's pending ETH.
contract ThrowShowcase is Ownable2Step, ReentrancyGuard {
    uint256 public constant DAY = 1 days;
    uint16 public constant MAX_FEE_BPS = 1_000; // 10%, hard cap
    uint256 public constant MIN_BACK = 0.0001 ether;

    struct Project {
        address builder;
        uint64 listedAt;
        bool hidden;
        uint128 raised;
        uint32 backers;
    }

    Project[] internal _projects; // id 0 is unused
    mapping(uint256 => string) public names;
    mapping(uint256 => string) public meta;
    mapping(uint256 => mapping(uint256 => uint256)) public dayRaised; // day => id => wei
    mapping(uint256 => mapping(address => uint256)) public backed; // id => backer => wei
    mapping(address => uint256) public pending;

    uint16 public feeBps;
    address public treasury;

    event Listed(uint256 indexed id, address indexed builder, string name, string meta);
    event Backed(uint256 indexed id, address indexed backer, uint256 amount, uint256 fee, uint256 indexed day, string note);
    event MetaSet(uint256 indexed id, string meta);
    event BuilderSet(uint256 indexed id, address builder);
    event HiddenSet(uint256 indexed id, bool hidden);
    event Withdrawn(address indexed to, uint256 amount);
    event FeeSet(uint16 feeBps);
    event TreasurySet(address treasury);

    error BadName();
    error MetaTooLong();
    error NoteTooLong();
    error NoProject();
    error Hidden();
    error TooSmall();
    error NotBuilder();
    error FeeTooHigh();
    error ZeroAddress();
    error NothingToWithdraw();
    error SendFailed();

    constructor(address owner_, address treasury_, uint16 feeBps_) Ownable(owner_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        treasury = treasury_;
        feeBps = feeBps_;
        _projects.push();
    }

    // ---------------------------------------------------------------- builders

    function list(string calldata name, string calldata meta_) external returns (uint256 id) {
        if (bytes(name).length == 0 || bytes(name).length > 64) revert BadName();
        if (bytes(meta_).length > 4096) revert MetaTooLong();
        id = _projects.length;
        _projects.push(Project({builder: msg.sender, listedAt: uint64(block.timestamp), hidden: false, raised: 0, backers: 0}));
        names[id] = name;
        meta[id] = meta_;
        emit Listed(id, msg.sender, name, meta_);
    }

    function setMeta(uint256 id, string calldata meta_) external {
        _onlyBuilder(id);
        if (bytes(meta_).length > 4096) revert MetaTooLong();
        meta[id] = meta_;
        emit MetaSet(id, meta_);
    }

    /// @notice Sends future backing to a new address. ETH already sent stays with the old one.
    function setBuilder(uint256 id, address to) external {
        _onlyBuilder(id);
        if (to == address(0)) revert ZeroAddress();
        _projects[id].builder = to;
        emit BuilderSet(id, to);
    }

    // ----------------------------------------------------------------- backers

    function back(uint256 id, string calldata note) external payable nonReentrant {
        Project storage p = _project(id);
        if (p.hidden) revert Hidden();
        if (msg.value < MIN_BACK) revert TooSmall();
        if (bytes(note).length > 140) revert NoteTooLong();
        uint256 fee = (msg.value * feeBps) / 10_000;
        pending[treasury] += fee;
        pending[p.builder] += msg.value - fee;
        if (backed[id][msg.sender] == 0) p.backers += 1;
        backed[id][msg.sender] += msg.value;
        p.raised += uint128(msg.value);
        uint256 day = today();
        dayRaised[day][id] += msg.value;
        emit Backed(id, msg.sender, msg.value, fee, day, note);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pending[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert SendFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------- owner

    function setHidden(uint256 id, bool hidden) external onlyOwner {
        _project(id).hidden = hidden;
        emit HiddenSet(id, hidden);
    }

    function setFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = bps;
        emit FeeSet(bps);
    }

    function setTreasury(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        treasury = to;
        emit TreasurySet(to);
    }

    // ------------------------------------------------------------------- views

    function today() public view returns (uint256) {
        return block.timestamp / DAY;
    }

    function projectCount() external view returns (uint256) {
        return _projects.length - 1;
    }

    function projects(uint256 id) external view returns (Project memory) {
        return _project(id);
    }

    function _project(uint256 id) internal view returns (Project storage) {
        if (id == 0 || id >= _projects.length) revert NoProject();
        return _projects[id];
    }

    function _onlyBuilder(uint256 id) internal view {
        if (_project(id).builder != msg.sender) revert NotBuilder();
    }
}
