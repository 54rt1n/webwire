export function buildToolMessages(toolCalls, toolResults) {
    let toolMessages = [];
    if (!toolCalls) return toolMessages;
    for (const toolCall of toolCalls) {
        const toolResult = toolResults?.find(result => result.callId === toolCall.callId);
        let display = 'pending';
        if (toolResult) {
            if (toolResult.success) {
                display = 'success';
            } else {
                display = 'error';
            }
            toolMessages.push({
                ...toolCall,
                ...toolResult,
                display: display
            });
        } else {
            toolMessages.push({
                ...toolCall,
                display: display
            });
        }
    }
    return toolMessages;
}
