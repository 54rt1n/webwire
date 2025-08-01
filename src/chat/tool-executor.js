import { logger } from '../js/core/logging.js';

/**
 * ToolExecutor - Manages tool parsing and execution flow
 * Extracted from ChatService tool handling logic
 */
export class ToolExecutor {
    constructor(toolParser, mcpConnector, domConnector, stateService) {
        this.toolParser = toolParser;
        this.mcpConnector = mcpConnector;
        this.domConnector = domConnector;
        this.stateService = stateService;
    }

    /**
     * Get all available tools (MCP + DOM)
     */
    getAvailableTools() {
        const tools = [];
        
        // Get MCP tools if enabled
        if (this.mcpConnector && this.stateService?.ui.getUseMCP()) {
            try {
                const mcpTools = this.stateService.mcp.getMcpTools();
                if (mcpTools?.length > 0) {
                    tools.push(...mcpTools);
                }
            } catch (error) {
                logger.warn(this, 'Failed to get MCP tools:', error);
            }
        }
        
        // Get DOM tools if enabled
        if (this.domConnector && this.stateService.ui.getUseBrowserTools()) {
            try {
                const domTools = this.domConnector.getAvailableTools();
                if (domTools?.length > 0) {
                    // Convert to OpenAI format to match MCP tools
                    const formattedDomTools = domTools.map(tool => ({
                        type: 'function',
                        function: {
                            name: tool.name,
                            description: tool.description,
                            parameters: tool.parameters
                        }
                    }));
                    tools.push(...formattedDomTools);
                }
            } catch (error) {
                logger.warn(this, 'Failed to get DOM tools:', error);
            }
        }
        
        return tools;
    }

    /**
     * Parse tools from AI response
     */
    parseToolsFromResponse(response, tools) {
        let toolCalls = [];
        let parseErrors = [];
        
        if (this.mcpConnector && tools.length > 0) {
            const parseResult = this.toolParser.parseResponse(response);
            if (parseResult.success && parseResult.toolCalls.length > 0) {
                toolCalls = parseResult.toolCalls;
            } else if (parseResult.errors?.length > 0) {
                parseErrors = parseResult.errors;
            }
        }

        return { toolCalls, parseErrors };
    }

    /**
     * Execute a single tool call
     */
    async executeTool(toolCall) {
        try {
            let toolResponse;
            
            // Check if it's a DOM tool
            if (this.domConnector.isTool(toolCall.name)) {
                logger.log(this, `Executing DOM tool: ${toolCall.name}`);
                toolResponse = await this.domConnector.executeTool(
                    toolCall.name, 
                    toolCall.parameters
                );
            } else if (this.mcpConnector?.isTool(toolCall.name)) {
                // Execute MCP tool
                logger.log(this, `Executing MCP tool: ${toolCall.name}`);
                toolResponse = await this.mcpConnector.executeTool(
                    toolCall.name, 
                    toolCall.parameters
                );
            } else {
                throw new Error(`Unknown tool: ${toolCall.name}`);
            }

            return {
                callId: toolCall.callId,
                name: toolCall.name,
                parameters: toolCall.parameters,
                result: toolResponse,
                success: true,
                executionTime: Date.now()
            };
        } catch (error) {
            logger.error(this, `Tool ${toolCall.name} execution failed:`, error);
            return {
                callId: toolCall.callId,
                name: toolCall.name,
                parameters: toolCall.parameters,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute multiple tool calls
     */
    async executeTools(toolCalls, autoExecute) {
        if (!autoExecute && !this.stateService.ui.getAutoExecuteTools()) {
            return null;
        }

        const toolResults = [];
        for (const toolCall of toolCalls) {
            const result = await this.executeTool(toolCall);
            toolResults.push(result);
        }
        return toolResults;
    }
}