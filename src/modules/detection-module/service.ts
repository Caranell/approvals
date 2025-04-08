import { isContract, isContractVerified } from '@/helpers/etherscan.helper'

import { DetectionRequest, DetectionResponse } from './dtos'
import { flattenTraceCalls, getApprovalParams } from './utils'

const APPROVAL_SIGNATURE = '0x095ea7b3'
const SET_APPROVAL_FOR_ALL_SIGNATURE = '0xa22cb465'

const INFINITE_APPROVAL = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
// Max allowed, for 6-decimal tokens it's 100,000.0
const MAX_ALLOWED_APPROVAL = '0x000000000000000000000000000000000000000000000000000000174876e800'

export class DetectionService {
    public static async detect(request: DetectionRequest): Promise<DetectionResponse> {
        const { trace } = request

        const simpleApprovalCheck = await this.checkApproval(trace.input)

        if (simpleApprovalCheck.detected) {
            return new DetectionResponse({
                request,
                detectionInfo: simpleApprovalCheck,
            })
        }

        // if simple check didn't find anything suspicios, check nested calls
        const nestedApprovalCheck = await this.checkNestedApprovals(request)

        if (nestedApprovalCheck.detected) {
            return new DetectionResponse({
                request,
                detectionInfo: nestedApprovalCheck,
            })
        }

        return new DetectionResponse({
            request,
            detectionInfo: { detected: false },
        })
    }

    private static async checkApproval(
        input: string,
    ): Promise<{ detected: boolean; message?: string }> {
        if (input.startsWith(APPROVAL_SIGNATURE)) {
            const { spender, amount } = getApprovalParams(input)

            const approvalAmountCheck = this.checkApprovalAmount(amount)

            if (approvalAmountCheck.detected) {
                return approvalAmountCheck
            }

            const isSuspiciousSpenderCheck = await this.checkSuspiciousSpender(spender)

            if (isSuspiciousSpenderCheck.detected) {
                return isSuspiciousSpenderCheck
            }

            return {
                detected: false,
            }
        } else if (input.startsWith(SET_APPROVAL_FOR_ALL_SIGNATURE)) {
            // if last char of input is 1, it's an approval
            // if last char of input is 0, it's an approval revoke
            const isApproval = input.endsWith('1')
            if (isApproval) {
                return {
                    detected: true,
                    message: 'Detected approval for all NFTs',
                }
            }

            return {
                detected: false,
            }
        }

        return {
            detected: false,
        }
    }

    private static checkApprovalAmount(amount: string): { detected: boolean; message?: string } {
        if (amount === INFINITE_APPROVAL) {
            return {
                detected: true,
                message: 'Infinite approval detected',
            }
        }

        if (BigInt(amount) > BigInt(MAX_ALLOWED_APPROVAL)) {
            return {
                detected: true,
                message: 'Detected approval with amount greater than max allowed',
            }
        }

        return {
            detected: false,
        }
    }

    private static async checkSuspiciousSpender(
        spender: string,
    ): Promise<{ detected: boolean; message?: string }> {
        const addressIsContract = await isContract(spender)

        if (!addressIsContract) {
            return {
                detected: true,
                message: 'Token approval is given to EOA',
            }
        }

        const isVerified = await isContractVerified(spender)

        if (!isVerified) {
            return {
                detected: true,
                message: 'Token approval is given to unverified contract',
            }
        }

        return {
            detected: false,
        }
    }

    private static async checkNestedApprovals(
        request: DetectionRequest,
    ): Promise<{ detected: boolean; message?: string }> {
        const { trace } = request

        if (!trace.calls?.length) {
            return {
                detected: false,
            }
        }

        const flattenedCalls = flattenTraceCalls(trace.calls)

        for (const call of flattenedCalls) {
            const approvalCheck = await this.checkApproval(call.input)
            if (approvalCheck.detected) {
                return approvalCheck
            }
        }

        return { detected: false }
    }
}
