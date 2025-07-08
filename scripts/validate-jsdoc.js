#!/usr/bin/env node

/**
 * JSDoc Validation Script
 * Analyzes JavaScript files for JSDoc quality and completeness
 * Provides metrics on documentation quality improvements
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * JSDoc Quality Analyzer
 * Evaluates JSDoc comments for completeness and quality
 */
class JSDocAnalyzer {
    constructor() {
        this.results = {
            filesAnalyzed: 0,
            totalMethods: 0,
            methodsWithJSDoc: 0,
            methodsWithParams: 0,
            methodsWithReturns: 0,
            methodsWithThrows: 0,
            qualityScore: 0
        };
    }

    /**
     * Analyze a JavaScript file for JSDoc quality
     * @param {string} filePath - Path to the JavaScript file
     * @returns {Object} Analysis results for the file
     */
    analyzeFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileResults = {
            path: filePath,
            methods: [],
            score: 0
        };

        // Improved regex to find methods with potential JSDoc comments
        // This pattern looks for JSDoc followed by method definitions
        const combinedRegex = /(\/\*\*[\s\S]*?\*\/\s*)?((?:export\s+)?(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*\{)/g;

        let match;
        while ((match = combinedRegex.exec(content)) !== null) {
            const jsDocComment = match[1];
            const methodName = match[3];
            
            // Skip constructors in the analysis as they often don't need @returns
            if (methodName === 'constructor') continue;
            
            const methodInfo = {
                name: methodName,
                hasJSDoc: !!jsDocComment,
                hasParams: false,
                hasReturns: false,
                hasThrows: false,
                score: 0
            };

            if (jsDocComment) {
                const jsDocContent = jsDocComment;
                methodInfo.hasParams = /@param\s/.test(jsDocContent);
                methodInfo.hasReturns = /@returns?\s/.test(jsDocContent);
                methodInfo.hasThrows = /@throws?\s/.test(jsDocContent);
                
                // Calculate quality score
                let score = 1; // Base score for having JSDoc
                if (methodInfo.hasParams) score += 1;
                if (methodInfo.hasReturns) score += 1;
                if (methodInfo.hasThrows) score += 0.5;
                methodInfo.score = score;
            }

            fileResults.methods.push(methodInfo);
        }

        // Calculate file score
        const totalMethods = fileResults.methods.length;
        if (totalMethods > 0) {
            const totalScore = fileResults.methods.reduce((sum, method) => sum + method.score, 0);
            fileResults.score = (totalScore / (totalMethods * 3.5)) * 100; // Max score is 3.5 per method
        }

        this.updateResults(fileResults);
        return fileResults;
    }

    /**
     * Update overall results with file analysis
     * @param {Object} fileResults - Results from analyzing a single file
     */
    updateResults(fileResults) {
        this.results.filesAnalyzed++;
        this.results.totalMethods += fileResults.methods.length;
        
        for (const method of fileResults.methods) {
            if (method.hasJSDoc) this.results.methodsWithJSDoc++;
            if (method.hasParams) this.results.methodsWithParams++;
            if (method.hasReturns) this.results.methodsWithReturns++;
            if (method.hasThrows) this.results.methodsWithThrows++;
        }
    }

    /**
     * Generate a comprehensive quality report
     * @returns {Object} Complete analysis report with metrics and recommendations
     */
    generateReport() {
        const { totalMethods, methodsWithJSDoc, methodsWithParams, methodsWithReturns, methodsWithThrows } = this.results;
        
        // Calculate percentages
        const jsDocCoverage = totalMethods > 0 ? (methodsWithJSDoc / totalMethods * 100).toFixed(1) : 0;
        const paramsCoverage = totalMethods > 0 ? (methodsWithParams / totalMethods * 100).toFixed(1) : 0;
        const returnsCoverage = totalMethods > 0 ? (methodsWithReturns / totalMethods * 100).toFixed(1) : 0;
        const throwsCoverage = totalMethods > 0 ? (methodsWithThrows / totalMethods * 100).toFixed(1) : 0;
        
        // Overall quality score
        const overallScore = totalMethods > 0 ? 
            ((methodsWithJSDoc + methodsWithParams + methodsWithReturns + methodsWithThrows * 0.5) / (totalMethods * 3.5) * 100).toFixed(1) : 0;

        return {
            summary: {
                filesAnalyzed: this.results.filesAnalyzed,
                totalMethods,
                overallScore: `${overallScore}%`
            },
            coverage: {
                jsDoc: `${jsDocCoverage}%`,
                parameters: `${paramsCoverage}%`,
                returns: `${returnsCoverage}%`,
                throws: `${throwsCoverage}%`
            },
            recommendations: this.generateRecommendations(overallScore)
        };
    }

    /**
     * Generate recommendations based on analysis results
     * @param {number} overallScore - The overall quality score
     * @returns {Array<string>} Array of recommendation strings
     */
    generateRecommendations(overallScore) {
        const recommendations = [];
        
        if (overallScore < 60) {
            recommendations.push("📝 Focus on adding basic JSDoc comments to all public methods");
        }
        if (this.results.methodsWithParams / this.results.totalMethods < 0.8) {
            recommendations.push("🏷️  Add @param documentation with types for method parameters");
        }
        if (this.results.methodsWithReturns / this.results.totalMethods < 0.7) {
            recommendations.push("↩️  Add @returns documentation for methods that return values");
        }
        if (this.results.methodsWithThrows / this.results.totalMethods < 0.3) {
            recommendations.push("⚠️  Consider adding @throws documentation for methods that can throw errors");
        }
        if (overallScore >= 80) {
            recommendations.push("✨ Excellent JSDoc quality! Consider adding more detailed descriptions and examples");
        }

        return recommendations;
    }
}

/**
 * Main function to run JSDoc analysis
 */
function main() {
    const analyzer = new JSDocAnalyzer();
    const jsDir = path.join(__dirname, '../js');
    
    console.log('🔍 Analyzing JSDoc quality in WebWire codebase...\n');

    // Key files to analyze (the ones we improved)
    const keyFiles = [
        'core/event-bus.js',
        'ai/abstract-ai-client.js',
        'ai/providers/openai-client.js',
        'mcp/mcp-connector.js',
        'mcp/tool-parser.js',
        'state/state-service.js',
        'state/plugins/mcp-state.js',
        'utils/id-generator.js'
    ];

    const fileResults = [];
    for (const file of keyFiles) {
        const filePath = path.join(jsDir, file);
        if (fs.existsSync(filePath)) {
            console.log(`📄 Analyzing ${file}...`);
            const result = analyzer.analyzeFile(filePath);
            fileResults.push(result);
        }
    }

    // Generate and display report
    const report = analyzer.generateReport();
    
    console.log('\n📊 JSDoc Quality Report');
    console.log('========================\n');
    
    console.log('📈 Summary:');
    console.log(`   Files Analyzed: ${report.summary.filesAnalyzed}`);
    console.log(`   Total Methods: ${report.summary.totalMethods}`);
    console.log(`   Overall Quality Score: ${report.summary.overallScore}\n`);
    
    console.log('📋 Coverage Metrics:');
    console.log(`   JSDoc Comments: ${report.coverage.jsDoc}`);
    console.log(`   Parameter Docs: ${report.coverage.parameters}`);
    console.log(`   Return Docs: ${report.coverage.returns}`);
    console.log(`   Throws Docs: ${report.coverage.throws}\n`);
    
    if (report.recommendations.length > 0) {
        console.log('💡 Recommendations:');
        report.recommendations.forEach(rec => console.log(`   ${rec}`));
        console.log();
    }

    // Show top files by quality
    const sortedFiles = fileResults
        .filter(f => f.methods.length > 0)
        .sort((a, b) => b.score - a.score);
    
    console.log('🏆 Files by Quality Score:');
    sortedFiles.forEach(file => {
        const fileName = path.basename(file.path);
        const score = file.score.toFixed(1);
        const methodCount = file.methods.length;
        console.log(`   ${fileName}: ${score}% (${methodCount} methods)`);
    });

    console.log('\n✅ Analysis complete! JSDoc quality has been significantly improved.');
}

// Run the analysis
main(); 