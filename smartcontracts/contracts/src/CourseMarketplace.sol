// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICourseMarketplace} from "./interfaces/ICourseMarketplace.sol";
import {IAccessPass} from "./interfaces/IAccessPass.sol";

/// @title CourseMarketplace
/// @notice Course registry + paid access. Money split is deterministic
///         and matches off-chain `lit-pricing.js` (treasuryBps =
///         w3extBps = 2000 by default; rounding remainder to the author
///         so payouts re-sum to `price`). Hardened per BFOPS audit:
///         Checks-Effects-Interactions, reentrancy guard, pull-payments
///         for author/w3ext, push only to the fixed Treasury address,
///         Ownable2Step + bounded bps.
contract CourseMarketplace is ICourseMarketplace {
    error NotOwner();
    error NotPendingOwner();
    error NotAuthor();
    error Inactive();
    error BadPrice();
    error AlreadyOwned();
    error ZeroAddress();
    error BpsTooHigh();
    error NothingToWithdraw();
    error TransferFailed();
    error AccessPassUnset();
    error AccessPassAlreadySet();

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MAX_BPS_EACH = 3_000;

    // ── Ownable2Step ─────────────────────────────────────────────────────
    address public owner;
    address public pendingOwner;

    // ── Reentrancy guard (inline, no external dep) ───────────────────────
    uint256 private _lock = 1;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        require(_lock == 1, "REENTRANCY");
        _lock = 2;
        _;
        _lock = 1;
    }

    // ── State ────────────────────────────────────────────────────────────
    IAccessPass public accessPass;
    address public treasury;
    address public w3ext;
    uint16 public treasuryBps = 2_000; // 20% — matches DEFAULT_TREASURY_BPS
    uint16 public w3extBps = 2_000; // 20% — matches DEFAULT_W3EXT_FEE_BPS

    uint256 public nextCourseId = 1;
    mapping(uint256 => Course) public courses;
    mapping(address => uint256) public pendingWithdrawals;

    event OwnershipTransferStarted(address indexed previous, address indexed pending);
    event OwnershipTransferred(address indexed previous, address indexed current);
    event ParamsUpdated(uint16 treasuryBps, uint16 w3extBps, address treasury, address w3ext);

    constructor(address _treasury, address _w3ext) {
        if (_treasury == address(0) || _w3ext == address(0)) revert ZeroAddress();
        owner = msg.sender;
        treasury = _treasury;
        w3ext = _w3ext;
    }

    // ── Ownable2Step ─────────────────────────────────────────────────────
    function transferOwnership(address to) external onlyOwner {
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ── Admin (bounded) ──────────────────────────────────────────────────
    function setAccessPass(address ap) external onlyOwner {
        if (ap == address(0)) revert ZeroAddress();
        if (address(accessPass) != address(0)) revert AccessPassAlreadySet();
        accessPass = IAccessPass(ap);
    }

    function setParams(uint16 _treasuryBps, uint16 _w3extBps, address _treasury, address _w3ext)
        external
        onlyOwner
    {
        if (_treasury == address(0) || _w3ext == address(0)) revert ZeroAddress();
        if (
            _treasuryBps > MAX_BPS_EACH || _w3extBps > MAX_BPS_EACH
                || uint256(_treasuryBps) + _w3extBps > BPS_DENOMINATOR
        ) revert BpsTooHigh();
        treasuryBps = _treasuryBps;
        w3extBps = _w3extBps;
        treasury = _treasury;
        w3ext = _w3ext;
        emit ParamsUpdated(_treasuryBps, _w3extBps, _treasury, _w3ext);
    }

    // ── Courses ──────────────────────────────────────────────────────────
    /// @inheritdoc ICourseMarketplace
    function registerCourse(uint96 price, bytes32 contentHash, string calldata bucket)
        external
        returns (uint256 courseId)
    {
        if (price == 0) revert BadPrice();
        courseId = nextCourseId++;
        courses[courseId] = Course({
            author: msg.sender,
            price: price,
            contentHash: contentHash,
            bucket: bucket,
            active: true
        });
        emit CourseRegistered(courseId, msg.sender, price, bucket);
    }

    /// @inheritdoc ICourseMarketplace
    function updateCourse(uint256 courseId, uint96 price, bool active) external {
        Course storage c = courses[courseId];
        if (c.author != msg.sender) revert NotAuthor();
        if (price == 0) revert BadPrice();
        c.price = price;
        c.active = active;
        emit CourseUpdated(courseId, price, active);
    }

    /// @inheritdoc ICourseMarketplace
    function quote(uint256 price)
        public
        view
        returns (uint256 protocolCut, uint256 w3extFee, uint256 authorAmount)
    {
        protocolCut = (price * treasuryBps) / BPS_DENOMINATOR;
        w3extFee = (price * w3extBps) / BPS_DENOMINATOR;
        // remainder to the author so payouts re-sum exactly to `price`
        authorAmount = price - protocolCut - w3extFee;
    }

    /// @inheritdoc ICourseMarketplace
    function purchase(uint256 courseId) external payable nonReentrant {
        if (address(accessPass) == address(0)) revert AccessPassUnset();
        Course storage c = courses[courseId];
        // ── Checks ───────────────────────────────────────────────────────
        if (!c.active) revert Inactive();
        if (msg.value != c.price) revert BadPrice();
        if (accessPass.hasAccess(msg.sender, courseId)) revert AlreadyOwned();

        (uint256 protocolCut, uint256 w3extFee, uint256 authorAmount) = quote(msg.value);

        // ── Effects (before any external call) ───────────────────────────
        pendingWithdrawals[c.author] += authorAmount;
        pendingWithdrawals[w3ext] += w3extFee;

        // ── Interactions ─────────────────────────────────────────────────
        accessPass.mint(msg.sender, courseId); // trusted, set-once
        (bool ok,) = treasury.call{value: protocolCut}(""); // fixed address
        if (!ok) revert TransferFailed();

        emit CoursePurchased(
            courseId, msg.sender, msg.value, protocolCut, w3extFee, authorAmount
        );
    }

    /// @inheritdoc ICourseMarketplace
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0; // effect before interaction
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }
}
