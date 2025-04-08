import request from 'supertest'
import { pad } from 'viem'

import { app, server } from '@/app'
// Mock the helper functions
import * as etherscanHelper from '@/helpers/etherscan.helper'
import { DetectionRequest, DetectionResponse } from '@/modules/detection-module/dtos'
import { HTTP_STATUS_CODES } from '@/types'

// Mock the implementation
jest.mock('@/helpers/etherscan.helper', () => ({
    isContract: jest.fn(),
    isContractVerified: jest.fn(),
}))

const ethereumAddress = '0xfdD055Cf3EaD343AD51f4C7d1F12558c52BaDFA5'
const contractAddress = '0x1234567890123456789012345678901234567890' // Example contract address
const zeroAddress = '0x0000000000000000000000000000000000000000'

// Signatures
const APPROVAL_SIGNATURE = '0x095ea7b3'
const SET_APPROVAL_FOR_ALL_SIGNATURE = '0xa22cb465'

// Amounts
const INFINITE_APPROVAL = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
// BigInt('000000000000000000000000000000000000000000000000000000174876e800') + 1n
const MAX_ALLOWED_APPROVAL_PLUS_ONE =
    '0x000000000000000000000000000000000000000000000000000000174876e801'
const NORMAL_APPROVAL = '0x0000000000000000000000000000000000000000000000000000000000000001' // 1 wei

// Helper to create approval input data
const createApprovalInput = (spender: string, amountHex: string): string => {
    const paddedSpender = pad(
        (spender.toLowerCase().startsWith('0x') ? spender : '0x' + spender) as `0x${string}`,
        { size: 32 },
    ).slice(2)
    const paddedAmount = pad(amountHex as `0x${string}`, { size: 32 }).slice(2)
    return `${APPROVAL_SIGNATURE}${paddedSpender}${paddedAmount}`
}

// Helper to create setApprovalForAll input data
const createSetApprovalForAllInput = (operator: string, approved: boolean): string => {
    const paddedOperator = pad(
        (operator.toLowerCase().startsWith('0x') ? operator : '0x' + operator) as `0x${string}`,
        { size: 32 },
    ).slice(2)
    const paddedApproved = pad(approved ? '0x1' : '0x0', { size: 32 }).slice(2) // Use '0x1' and '0x0' for boolean
    return `${SET_APPROVAL_FOR_ALL_SIGNATURE}${paddedOperator}${paddedApproved}`
}

const baseRequestPayload: Partial<DetectionRequest> = {
    id: 'unique-id',
    detectorName: 'test-detector',
    chainId: 1,
    hash: 'some hash',
    protocolName: 'some protocol',
    protocolAddress: zeroAddress,
    trace: {
        blockNumber: 12345,
        from: ethereumAddress,
        to: ethereumAddress, // Typically the token contract for approvals
        transactionHash: 'some hash',
        input: '0x', // Default to non-suspicious input
        output: 'output',
        gas: '100000',
        gasUsed: '100',
        value: '0', // Approvals usually have 0 value
        pre: {
            [zeroAddress]: { balance: '0x..', nonce: 2 },
        },
        post: {
            [zeroAddress]: { balance: '0x..' },
        },
        logs: [
            {
                address: ethereumAddress,
                data: '0x...',
                topics: ['0x...'],
            },
        ],
        calls: [], // Default to no nested calls
    },
}

describe('Service Tests', () => {
    afterAll(async () => {
        server.close()
    })

    beforeEach(() => {
        ;(etherscanHelper.isContract as jest.Mock).mockReset()
        ;(etherscanHelper.isContractVerified as jest.Mock).mockReset()
    })

    test('detect success - no detection', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: '0xaaaaaaaa', // Some random non-approval input
            },
        }
        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')

        const body: DetectionResponse = response.body

        // Assert
        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(false)
        expect(body.error).toBeFalsy()
    })

    test('detect validation', async () => {
        const response = await request(app)
            .post('/detect')
            .send({ ...baseRequestPayload, protocolAddress: 'definitely not address' })
            .set('Content-Type', 'application/json')

        expect(response.status).toBe(HTTP_STATUS_CODES.BAD_REQUEST)
    })

    test('detect validation nested', async () => {
        const response = await request(app)
            .post('/detect')
            .send({
                ...baseRequestPayload,
                trace: {
                    ...baseRequestPayload.trace,
                    from: 'not valid address',
                    to: 'not valid as well',
                    logs: [
                        {
                            address: 'not address deeply nested',
                            data: '0x...',
                            topics: ['0x...'],
                        },
                    ],
                },
            })
            .set('Content-Type', 'application/json')

        expect(response.status).toBe(HTTP_STATUS_CODES.BAD_REQUEST)
        expect(response.body.message).toContain('trace.from')
        expect(response.body.message).toContain('trace.to')
        expect(response.body.message).toContain('trace.logs.0.address')
    })

    test('detects infinite approval', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: createApprovalInput(contractAddress, INFINITE_APPROVAL),
            },
        }

        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(true)
        ;(etherscanHelper.isContractVerified as jest.Mock).mockResolvedValue(true)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Infinite approval detected')
    })

    test('detects approval amount greater than max allowed', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: createApprovalInput(contractAddress, MAX_ALLOWED_APPROVAL_PLUS_ONE),
            },
        }
        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(true)
        ;(etherscanHelper.isContractVerified as jest.Mock).mockResolvedValue(true)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Detected approval with amount greater than max allowed')
    })

    test('detects approval to EOA spender', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: createApprovalInput(ethereumAddress, NORMAL_APPROVAL), // Normal amount, EOA spender
            },
        }
        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(false)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Token approval is given to EOA')
    })

    test('detects approval to unverified contract spender', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: createApprovalInput(contractAddress, NORMAL_APPROVAL), // Normal amount, contract spender
            },
        }
        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(true)
        ;(etherscanHelper.isContractVerified as jest.Mock).mockResolvedValue(false)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Token approval is given to unverified contract')
    })

    test('does not detect valid approval to verified contract', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: createApprovalInput(contractAddress, NORMAL_APPROVAL), // Normal amount, contract spender
            },
        }
        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(true)
        ;(etherscanHelper.isContractVerified as jest.Mock).mockResolvedValue(true)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(false)
    })

    test('detects setApprovalForAll(true)', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: createSetApprovalForAllInput(contractAddress, true),
            },
        }

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Detected approval for all NFTs')
    })

    test('does not detect setApprovalForAll(false)', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: createSetApprovalForAllInput(contractAddress, false),
            },
        }

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(false)
    })

    test('detects infinite approval in nested call', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: '0xaaaaaaaa', // Non-suspicious top-level input
                calls: [
                    {
                        // Nested call 1 (ok)
                        from: ethereumAddress,
                        to: contractAddress,
                        input: createApprovalInput(contractAddress, NORMAL_APPROVAL),
                        output: 'output',
                        gasUsed: '100',
                        value: '0',
                    },
                    {
                        // Nested call 2 (infinite approval)
                        from: ethereumAddress,
                        to: contractAddress, // Assume this is token contract
                        input: createApprovalInput(contractAddress, INFINITE_APPROVAL),
                        output: 'output',
                        gasUsed: '100',
                        value: '0',
                    },
                ],
            },
        }
        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(true)
        ;(etherscanHelper.isContractVerified as jest.Mock).mockResolvedValue(true)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Infinite approval detected')
        expect(etherscanHelper.isContract).toHaveBeenCalledTimes(1)
        expect(etherscanHelper.isContractVerified).toHaveBeenCalledTimes(1)
    })

    test('detects EOA spender in nested call', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: '0xaaaaaaaa', // Non-suspicious top-level input
                calls: [
                    {
                        // Nested call 1 (EOA spender)
                        from: ethereumAddress,
                        to: contractAddress, // Assume this is token contract
                        input: createApprovalInput(ethereumAddress, NORMAL_APPROVAL),
                        output: 'output',
                        gasUsed: '100',
                        value: '0',
                    },
                ],
            },
        }
        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(false)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Token approval is given to EOA')
        expect(etherscanHelper.isContract).toHaveBeenCalledTimes(1)
        expect(etherscanHelper.isContractVerified).not.toHaveBeenCalled()
    })

    test('detects unverified contract spender in nested call', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: '0xaaaaaaaa', // Non-suspicious top-level input
                calls: [
                    {
                        // Nested call 1 (unverified contract spender)
                        from: ethereumAddress,
                        to: contractAddress, // Assume this is token contract
                        input: createApprovalInput(contractAddress, NORMAL_APPROVAL),
                        output: 'output',
                        gasUsed: '100',
                        value: '0',
                    },
                ],
            },
        }
        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(true)
        ;(etherscanHelper.isContractVerified as jest.Mock).mockResolvedValue(false)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Token approval is given to unverified contract')
        expect(etherscanHelper.isContract).toHaveBeenCalledTimes(1)
        expect(etherscanHelper.isContractVerified).toHaveBeenCalledTimes(1)
    })

    test('detects setApprovalForAll in nested call', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: '0xaaaaaaaa', // Non-suspicious top-level input
                calls: [
                    {
                        // Nested call 1 (setApprovalForAll)
                        from: ethereumAddress,
                        to: contractAddress, // Assume this is NFT contract
                        input: createSetApprovalForAllInput(ethereumAddress, true), // Approve EOA operator
                        output: 'output',
                        gasUsed: '100',
                        value: '0',
                    },
                ],
            },
        }

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(true)
        expect(body.message).toBe('Detected approval for all NFTs')
    })

    test('does not detect issues in nested calls with valid approvals', async () => {
        const requestPayload = {
            ...baseRequestPayload,
            trace: {
                ...baseRequestPayload.trace,
                input: '0xaaaaaaaa', // Non-suspicious top-level input
                calls: [
                    {
                        // Nested call 1 (valid approval)
                        from: ethereumAddress,
                        to: contractAddress, // Token contract
                        input: createApprovalInput(contractAddress, NORMAL_APPROVAL),
                        output: 'output',
                        gasUsed: '100',
                        value: '0',
                    },
                    {
                        // Nested call 2 (revoke setApprovalForAll)
                        from: ethereumAddress,
                        to: contractAddress, // NFT contract
                        input: createSetApprovalForAllInput(ethereumAddress, false),
                        output: 'output',
                        gasUsed: '100',
                        value: '0',
                    },
                ],
            },
        }
        // Mock spender as verified contract for the first call
        ;(etherscanHelper.isContract as jest.Mock).mockResolvedValue(true)
        ;(etherscanHelper.isContractVerified as jest.Mock).mockResolvedValue(true)

        const response = await request(app)
            .post('/detect')
            .send(requestPayload)
            .set('Content-Type', 'application/json')
        const body: DetectionResponse = response.body

        expect(response.status).toBe(HTTP_STATUS_CODES.OK)
        expect(body.detected).toBe(false)
        // Check mocks were called for the actual approval check
        expect(etherscanHelper.isContract).toHaveBeenCalledTimes(1)
        expect(etherscanHelper.isContractVerified).toHaveBeenCalledTimes(1)
    })
})
