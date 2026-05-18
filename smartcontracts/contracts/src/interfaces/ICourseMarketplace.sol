// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICourseMarketplace — course registry + paid access with a
///        deterministic split matching off-chain lit-pricing.js.
interface ICourseMarketplace {
    struct Course {
        address author;
        uint96 price; // wei
        bytes32 contentHash; // keccak256 of the encrypted manifest/content
        string bucket; // public-read Greenfield bucket holding ciphertext
        bool active;
    }

    event CourseRegistered(
        uint256 indexed courseId, address indexed author, uint96 price, string bucket
    );
    event CourseUpdated(uint256 indexed courseId, uint96 price, bool active);
    event CoursePurchased(
        uint256 indexed courseId,
        address indexed buyer,
        uint256 price,
        uint256 protocolCut,
        uint256 w3extFee,
        uint256 authorAmount
    );
    event Withdrawn(address indexed account, uint256 amount);

    function registerCourse(uint96 price, bytes32 contentHash, string calldata bucket)
        external
        returns (uint256 courseId);

    function updateCourse(uint256 courseId, uint96 price, bool active) external;

    function purchase(uint256 courseId) external payable;

    function withdraw() external;

    function quote(uint256 price)
        external
        view
        returns (uint256 protocolCut, uint256 w3extFee, uint256 authorAmount);
}
