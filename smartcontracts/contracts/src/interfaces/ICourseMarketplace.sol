// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ICourseMarketplace — course registry + paid access with a
///        deterministic split matching off-chain lit-pricing.js.
interface ICourseMarketplace {
    struct Course {
        address author;
        uint96 price; // wei
        bytes32 contentHash; // keccak256 of the encrypted manifest/content
        string bucket; // public-read Greenfield bucket holding ciphertext
        uint64 accessDuration; // seconds; 0 = perpetual access for buyers
        bool active;
    }

    event CourseRegistered(
        uint256 indexed courseId, address indexed author, uint96 price, string bucket
    );
    event CourseUpdated(uint256 indexed courseId, uint96 price, bool active);
    /// @notice Emitted on every sale. `saleNonce` is a per-course, 1-based
    ///         monotonically increasing sale counter (the Nth sale of this
    ///         course) — a stable ordinal for off-chain indexers / receipts.
    event CoursePurchased(
        uint256 indexed courseId,
        address indexed buyer,
        uint256 indexed saleNonce,
        uint256 price,
        uint256 protocolCut,
        uint256 w3extFee,
        uint256 authorAmount
    );
    /// @notice Emitted when an author reprices a course by a signed percentage
    ///         (basis points): negative = discount, positive = markup. The
    ///         platform commission percentages (treasuryBps / w3extBps) are
    ///         NOT affected — only the base price changes.
    event CoursePriceAdjusted(
        uint256 indexed courseId, uint96 oldPrice, uint96 newPrice, int256 bps
    );
    event Withdrawn(address indexed account, uint256 amount);

    function registerCourse(
        uint96 price,
        bytes32 contentHash,
        string calldata bucket,
        uint64 accessDuration
    ) external returns (uint256 courseId);

    function updateCourse(uint256 courseId, uint96 price, bool active) external;

    /// @notice Author-only. Adjust the course's base price by `bps` basis points
    ///         relative to the current price: negative = discount, positive =
    ///         markup (e.g. -2000 = −20%, +1500 = +15%). The platform commission
    ///         percentages are untouched, so the protocol's cut stays the same
    ///         share of whatever the new price is. Reverts BadPrice if the new
    ///         price would be 0 or overflow uint96.
    function adjustPrice(uint256 courseId, int256 bps)
        external
        returns (uint96 newPrice);

    /// @notice Per-course, 1-based count of completed sales (the value emitted
    ///         as `saleNonce` for the most recent sale of `courseId`).
    function salesCount(uint256 courseId) external view returns (uint256);

    function purchase(uint256 courseId) external payable;

    /// @notice True if `user` may decrypt: the **author always has free
    ///         access to their own content**, otherwise a (possibly
    ///         time-limited) AccessPass. This is what Lit's
    ///         evmContractConditions calls.
    function hasCourseAccess(address user, uint256 courseId)
        external
        view
        returns (bool);

    function withdraw() external;

    function quote(uint256 price)
        external
        view
        returns (uint256 protocolCut, uint256 w3extFee, uint256 authorAmount);
}
