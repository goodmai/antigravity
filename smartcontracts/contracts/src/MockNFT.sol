// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockNFT {
    string public name = "Mock Lit NFT";
    string public symbol = "MLNFT";
    
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    
    uint256 private _nextTokenId = 1;
    
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    
    function mint(address to) external returns (uint256) {
        require(to != address(0), "Zero address");
        uint256 tokenId = _nextTokenId++;
        _owners[tokenId] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }
    
    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "Zero address");
        return _balances[owner];
    }
    
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "Token does not exist");
        return owner;
    }
}
