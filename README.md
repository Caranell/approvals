# Venn Suspicious approvals detector

This detector identifies potentially malicious token approvals within Ethereum transactions. It analyzes both the initial transaction call and any nested calls within the transaction trace.


Suspicious approvals are flagged based on the following criteria:

## Detection logic

1.  **Function Signature:** Detects calls to `approve` (ERC20/ERC721) and `setApprovalForAll` (ERC721/ERC1155).
2.  **Approval Amount (for `approve`):**
    *   Flags infinite approvals (approving the maximum possible amount).
    *   Flags approvals exceeding a predefined threshold .
3.  **Spender Address (for `approve`):**
    *   Flags approvals granted to Externally Owned Accounts (EOAs), as legitimate protocols usually use smart contracts.
    *   Flags approvals granted to unverified smart contracts on Etherscan.
4.  **Approval Action (for `setApprovalForAll`):**
    *   Flags transactions that grant approval to all owned NFTs using `setApprovalForAll`
5.  **Nested Calls:** If the initial transaction call isn't flagged, the detector recursively checks all internal/nested calls within the transaction trace using the same criteria.

## Table of Contents
- [Local development:](#️-local-development)
- [Deploy to production](#-deploy-to-production)

## 🛠️ Local Development

**Environment Setup**

Create a `.env` file with:

```bash
PORT=3000
HOST=localhost
LOG_LEVEL=debug
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```

**Runing In Dev Mode**
```bash
yarn        # or npm install
yarn dev    # or npm run dev
```

## 🚀 Deploy To Production

**Manual Build**

```bash
yarn build      # or npm run build
yarn start      # or npm run start
```


**Using Docker**
```bash
docker build -f Dockerfile . -t my-custom-detector
```



