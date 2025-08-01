/**
 * Utility class for formatting MCP tools into AI-readable prompts and descriptions.
 * Provides static methods to generate system prompts, tool descriptions, and user headers
 * for AI interactions with MCP tools.
 * 
 * @example
 * // Generate system prompt with tool descriptions
 * const systemPrompt = ToolFormatter.generateSystemPrompt(tools);
 * 
 * // Create user header with available tools
 * const userHeader = ToolFormatter.generateUserHeader(tools, toolResults);
 * 
 * // Validate tool format
 * const validation = ToolFormatter.validateToolsFormat(tools);
 * if (!validation.valid) {
 *   logger.error('ToolFormatter', 'Invalid tools:', validation.errors);
 * }
 */
import { logger } from '../core/logging.js';

export class ToolFormatter {
    /**
     * Generate a complete system prompt with tool calling instructions and tool descriptions
     * @param {Array} tools - Array of tools in OpenAI format from stateService.state.mcp.tools
     * @returns {string} Complete system prompt with tool calling instructions
     */
    static generateSystemPrompt(tools = []) {
        const genericHeader = `You are a helpful assistant that can use MCP (Model Context Protocol) tools to help users.

TOOL CALLING INSTRUCTIONS:
When you need to use a tool, respond with a JSON code block containing the tool call in this exact format:
\`\`\`json
{
    "name": "tool_name",
    "parameters": {
        "param1": "value1",
        "param2": "value2"
    }
}
\`\`\`

- You can use multiple tools by providing multiple JSON blocks in your response
- Always include the required parameters as specified in the tool schema
- Be conversational and explain what you're doing when using tools
- If a tool call fails, acknowledge it and try to help the user another way`;

        if (tools.length === 0) {
            return `${genericHeader}\n\nNo tools are currently available.`;
        }

        const toolDescriptions = this.generateToolDescriptions(tools);
        
        return `${genericHeader}

AVAILABLE TOOLS:
${toolDescriptions}`;
    }

    /**
     * Generate detailed tool descriptions with parameters
     * @param {Array} tools - Array of tools in OpenAI format
     * @returns {string} Formatted tool descriptions
     */
    static generateToolDescriptions(tools = []) {
        return tools.map(tool => {
            const func = tool.function;
            let description = `• ${func.name}: ${func.description}`;
            
            // Add parameter information if available
            if (func.parameters && func.parameters.properties) {
                const params = Object.entries(func.parameters.properties).map(([name, schema]) => {
                    const required = func.parameters.required?.includes(name) ? ' (required)' : ' (optional)';
                    const type = this.formatParameterType(schema);
                    const desc = schema.description ? ` - ${schema.description}` : '';
                    const defaultValue = schema.default !== undefined ? ` (default: ${JSON.stringify(schema.default)})` : '';
                    return `    - ${name}${type}${required}${desc}${defaultValue}`;
                }).join('\n');
                
                if (params) {
                    description += '\n' + params;
                }
            }
            
            return description;
        }).join('\n\n');
    }

    /**
     * Generate a simple user header with available function names and optional tool results
     * @param {Array} tools - Array of tools in OpenAI format from stateService.state.mcp.tools
     * @param {Array} toolResults - Optional array of tool execution results from previous turn
     * @returns {string} Simple list of available function names and tool results for user context
     */
    static generateUserHeader(tools = [], toolResults = []) {
        let header = '';
        
        // Add tool results from previous turn if available
        if (toolResults && toolResults.length > 0) {
            header += "PREVIOUS TOOL RESULTS:\n";
            toolResults.forEach((result, index) => {
                const toolName = result.request?.name || 'unknown';
                const success = result.success ? '✓' : '✗';
                const executionTime = result.executionTime ? ` (${result.executionTime}ms)` : '';
                
                header += `${index + 1}. ${success} ${toolName}${executionTime}\n`;
                
                if (result.response) {
                    const responseStr = typeof result.response === 'string' 
                        ? result.response 
                        : JSON.stringify(result.response, null, 2);
                    header += `   Result: ${responseStr}\n`;
                }
                
                if (result.error) {
                    header += `   Error: ${result.error}\n`;
                }
            });
            header += "\n";
        }
        
        // Add available tools section
        if (tools.length === 0) {
            header += "No tools available.";
        } else {
            const functionNames = tools.map(tool => tool.function.name).join(', ');
            header += `To execute a tool, put the response in a JSON code block with the tool name and parameters. Available tools: ${functionNames}`;
        }
        
        return header;
    }

    /**
     * Format parameter type from MCP schema
     * @param {Object} schema - Parameter schema object
     * @returns {string} Formatted type string
     */
    static formatParameterType(schema) {
        if (!schema) return '';
        
        if (schema.type) {
            return ` [${schema.type}]`;
        }
        
        if (schema.anyOf) {
            const types = schema.anyOf.map(option => {
                if (option.type === 'null') return 'null';
                return option.type || 'unknown';
            });
            return ` [${types.join('|')}]`;
        }
        
        if (schema.enum) {
            return ` [enum: ${schema.enum.join('|')}]`;
        }
        
        return '';
    }

    /**
     * Generate a compact tool summary for debugging or status display
     * @param {Array} tools - Array of tools in OpenAI format
     * @returns {Object} Summary object with tool statistics and names
     */
    static generateToolSummary(tools = []) {
        const summary = {
            count: tools.length,
            names: tools.map(tool => tool.function.name),
            byCategory: {}
        };

        // Group tools by name prefix (simple categorization)
        tools.forEach(tool => {
            const prefix = tool.function.name.split('_')[0];
            if (!summary.byCategory[prefix]) {
                summary.byCategory[prefix] = [];
            }
            summary.byCategory[prefix].push(tool.function.name);
        });

        return summary;
    }

    /**
     * Validate tools array format
     * @param {Array} tools - Array of tools to validate
     * @returns {Object} Validation result with success status and errors
     */
    static validateToolsFormat(tools) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        if (!Array.isArray(tools)) {
            result.valid = false;
            result.errors.push('Tools must be an array');
            return result;
        }

        tools.forEach((tool, index) => {
            if (!tool.type || tool.type !== 'function') {
                result.warnings.push(`Tool ${index}: missing or invalid type (expected 'function')`);
            }

            if (!tool.function) {
                result.valid = false;
                result.errors.push(`Tool ${index}: missing function object`);
                return;
            }

            const func = tool.function;
            
            if (!func.name || typeof func.name !== 'string') {
                result.valid = false;
                result.errors.push(`Tool ${index}: missing or invalid function name`);
            }

            if (!func.description || typeof func.description !== 'string') {
                result.warnings.push(`Tool ${index} (${func.name}): missing or invalid description`);
            }

            if (func.parameters && typeof func.parameters !== 'object') {
                result.warnings.push(`Tool ${index} (${func.name}): invalid parameters object`);
            }
        });

        return result;
    }
}
