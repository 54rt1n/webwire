#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert a tiktoken .model file to JSON format compatible with js-tiktoken
 * 
 * Usage: node convert-tiktoken-model.js <input.model> <output.json>
 */

function convertTiktokenModel(inputPath, outputPath) {
    console.log(`Converting ${inputPath} to ${outputPath}...`);
    
    try {
        // Read the model file
        const modelData = fs.readFileSync(inputPath);
        
        // Parse the model file
        // Tiktoken BPE files contain base64-encoded tokens and their ranks
        // Format: base64(token_bytes) space rank
        const inputLines = modelData.toString('utf8').split('\n').filter(line => line.trim());
        const bpe = {};
        let parseErrors = 0;
        
        inputLines.forEach((line, index) => {
            try {
                const parts = line.trim().split(' ');
                if (parts.length === 2) {
                    const [base64Token, rankStr] = parts;
                    
                    // Decode the base64 token to get raw bytes
                    const tokenBytes = Buffer.from(base64Token, 'base64');
                    
                    // Convert bytes to base64 string for js-tiktoken
                    // js-tiktoken expects tokens as base64 strings
                    const tokenBase64 = tokenBytes.toString('base64');
                    
                    const rank = parseInt(rankStr, 10);
                    
                    if (!isNaN(rank)) {
                        bpe[tokenBase64] = rank;
                    } else {
                        parseErrors++;
                    }
                }
            } catch (e) {
                parseErrors++;
                console.warn(`Error parsing line ${index + 1}: ${e.message}`);
            }
        });
        
        console.log(`Parsed ${Object.keys(bpe).length} tokens (${parseErrors} errors)`);
        
        // Create newline-separated format expected by js-tiktoken constructor
        // Each line format: [ignored] [offset] [token1] [token2] [token3] ...
        const rankGroups = new Map();
        
        // Group tokens by rank for efficient encoding
        for (const [tokenBase64, rank] of Object.entries(bpe)) {
            if (!rankGroups.has(rank)) {
                rankGroups.set(rank, []);
            }
            rankGroups.get(rank).push(tokenBase64);
        }
        
        // Sort ranks and create lines
        const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
        const lines = [];
        
        for (const rank of sortedRanks) {
            const tokens = rankGroups.get(rank);
            // Format: [ignored] [offset] [tokens...]
            lines.push(`_ ${rank} ${tokens.join(' ')}`);
        }
        
        // js-tiktoken expects this exact structure
        const outputData = {
            explicit_n_vocab: Object.keys(bpe).length, // Total vocabulary size
            pat_str: "('s|'S|'t|'T|'re|'rE|'Re|'RE|'ve|'vE|'Ve|'VE|'m|'M|'ll|'lL|'Ll|'LL|'d|'D)|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|\\p{N}{1,3}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+", // Common pattern
            special_tokens: {}, // Add special tokens if needed
            bpe_ranks: lines.join('\n')
        };
        
        // Write the JSON file
        fs.writeFileSync(outputPath, JSON.stringify(outputData));
        console.log(`Successfully converted to ${outputPath}`);
        
    } catch (error) {
        console.error('Error converting model:', error);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
    console.error('Usage: node convert-tiktoken-model.js <input.model> <output.json>');
    console.error('Example: node convert-tiktoken-model.js local/kimi_tiktoken.model src/tokenizers/kimi-k2.json');
    process.exit(1);
}

const [inputPath, outputPath] = args;

// Validate input file exists
if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
}

// Create output directory if it doesn't exist
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Convert the model
convertTiktokenModel(inputPath, outputPath);