package main

import (
	"context"
	"fmt"
	"os"
	"strconv"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/bnb-chain/greenfield/sdk/client"
	"github.com/bnb-chain/greenfield/sdk/keys"
	sdktypes "github.com/bnb-chain/greenfield/sdk/types"
	virtualgroupmoduletypes "github.com/bnb-chain/greenfield/x/virtualgroup/types"
)

func main() {
	fmt.Println("=== GVG Bootstrap Script ===")

	// SP0 Operator address and funding address details
	operatorPrivKeyHex := os.Getenv("OPERATOR_PRIVATE_KEY")
	if operatorPrivKeyHex == "" {
		operatorPrivKeyHex = "cb3f588076f68d33a1d41723070255dea47ce15472093419d764146d65c0a170"
	}

	km, err := keys.NewPrivateKeyManager(operatorPrivKeyHex)
	if err != nil {
		fmt.Printf("ERROR creating private key manager: %v\n", err)
		os.Exit(1)
	}

	rpcAddr := os.Getenv("RPC_ADDR")
	if rpcAddr == "" {
		rpcAddr = "http://127.0.0.1:26750"
	}
	chainId := os.Getenv("CHAIN_ID")
	if chainId == "" {
		chainId = "greenfield_9000-1"
	}

	gnfdCli, err := client.NewGreenfieldClient(rpcAddr, chainId, client.WithKeyManager(km))
	if err != nil {
		fmt.Printf("ERROR creating Greenfield client: %v\n", err)
		os.Exit(1)
	}

	deposit := sdk.Coin{
		Denom:  "BNB",
		Amount: sdktypes.NewIntFromInt64WithDecimal(1, sdktypes.DecimalBNB), // 1 BNB
	}

	spsVal := 7 // Default to 7 if not set
	if spsStr := os.Getenv("SPS"); spsStr != "" {
		if val, err := strconv.Atoi(spsStr); err == nil {
			spsVal = val
		}
	}
	fmt.Printf("Detected SPS count: %d. Building secondary SP IDs list...\n", spsVal)

	var secondarySpIds []uint32
	for i := 2; i <= spsVal; i++ {
		secondarySpIds = append(secondarySpIds, uint32(i))
	}
	fmt.Printf("Using SecondarySpIds: %v\n", secondarySpIds)

	msgCreateGVG := &virtualgroupmoduletypes.MsgCreateGlobalVirtualGroup{
		StorageProvider: km.GetAddr().String(),
		SecondarySpIds:  secondarySpIds,
		Deposit:         deposit,
		FamilyId:        0, // Auto-allocate family ID 1
	}

	fmt.Printf("Broadcasting MsgCreateGlobalVirtualGroup for Storage Provider %s...\n", msgCreateGVG.StorageProvider)
	response, err := gnfdCli.BroadcastTx(context.Background(), []sdk.Msg{msgCreateGVG}, nil)
	if err != nil {
		fmt.Printf("ERROR broadcasting tx: %v\n", err)
		os.Exit(1)
	}

	if response.TxResponse.Code != 0 {
		fmt.Printf("TX FAILED! Code: %d, Log: %s, TxHash: %s\n", response.TxResponse.Code, response.TxResponse.RawLog, response.TxResponse.TxHash)
		os.Exit(1)
	}

	fmt.Printf("TX SUCCEEDED! TxHash: %s, GasUsed: %d, Height: %d\n", response.TxResponse.TxHash, response.TxResponse.GasUsed, response.TxResponse.Height)
	fmt.Println("=== GVG Bootstrap complete ===")
}
