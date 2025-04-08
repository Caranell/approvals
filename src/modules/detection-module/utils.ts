import { DetectionRequestTraceCall } from './dtos'

export const flattenTraceCalls = (calls: DetectionRequestTraceCall[]) => {
    const flattened: DetectionRequestTraceCall[] = []

    function recurse(call: DetectionRequestTraceCall) {
        // Add the current call (excluding its nested calls) to the flattened array
        const callCopy = { ...call }
        delete callCopy.calls // Remove nested calls from this copy
        flattened.push(callCopy)

        // If there are nested calls, process them recursively
        if (call.calls && Array.isArray(call.calls)) {
            call.calls.forEach(nestedCall => recurse(nestedCall))
        }
    }

    // Process each top-level call
    calls.forEach(call => recurse(call))

    return flattened
}

export const getApprovalParams = (input: string): { spender: string; amount: string } => {
    // 0x + 8 chars of signature + 64 chars of spender + 64 chars of amount
    const SIGNATURE_LENGTH = 8
    const SPENDER_LENGTH = 64
    const AMOUNT_LENGTH = 64

    const spender =
        '0x' +
        input.slice(2 + SIGNATURE_LENGTH, 2 + SIGNATURE_LENGTH + SPENDER_LENGTH).toLowerCase()

    const amount =
        '0x' +
        input.slice(
            2 + SIGNATURE_LENGTH + SPENDER_LENGTH,
            2 + SIGNATURE_LENGTH + SPENDER_LENGTH + AMOUNT_LENGTH,
        )

    return { spender, amount }
}
