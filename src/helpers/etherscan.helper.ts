// Checks contract creation time, if it's null, it's an EOA
export const isContract = async (address: string): Promise<boolean> => {
    const response = await fetch(
        `https://api.etherscan.io/api?module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${process.env.ETHERSCAN_API_KEY}`,
    )

    const data = await response.json()

    return data.result !== null
}

export const isContractVerified = async (address: string): Promise<boolean> => {
    const response = await fetch(
        `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=${process.env.ETHERSCAN_API_KEY}`,
    )
    const data = await response.json()

    return data.result !== 'Contr act source code not verified'
}
