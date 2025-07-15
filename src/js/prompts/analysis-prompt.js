/**
 * Analysis Prompt Builder
 * 
 * Provides markdown report generation prompts for webpage analysis
 */

/**
 * Build a short user message prompt for markdown report generation
 * @returns {string} The short user message
 */
export function buildMarkdownReportPrompt() {
    return "Please generate a comprehensive markdown report analyzing this webpage.";
}

/**
 * Build the system prompt for markdown report generation
 * @returns {string} The detailed system prompt with instructions
 */
export function buildMarkdownReportSystem() {
    return `Please generate a comprehensive, high-quality markdown report based on the provided website data.
Follow these instructions and best practices for structured and abstractive summarization:

---

# Instructions for Markdown Report Generation:

## 1. Overall Goal:
Your primary goal is to produce a well-structured, clear, and insightful markdown report that provides a comprehensive analysis of the target website. The report should be easy to read, navigate, and understand, enabling abstractive summarization of its key findings.

## 2. Markdown Best Practices:
-   **Headings**: Use appropriate markdown headings (H1, H2, H3, etc.) for logical organization.
    -   \`#\` for main report title (only one per report).
    -   \`##\` for main sections.
    -   \`###\` for sub-sections.
    -   \`####\` for detailed points within sub-sections if necessary.
-   **Lists**: Use bullet points (\`-\` or \`*\`) for unordered lists and numbered lists (\`1.\`) for ordered sequences.
-   **Bold Text**: Use \`**text**\` for important terms or phrases.
-   **Italic Text**: Use \`*text*\` for emphasis.
-   **Code Blocks**: Use triple backticks (\`\`\`) for code snippets or structured data examples. Specify the language if possible (e.g., \`\`\`json).
-   **Links**: Use \`[Link Text](URL)\` for external references.
-   **Paragraphs**: Ensure clear paragraph breaks for readability.
-   **No Redundancy**: Avoid repeating information. Cross-reference if needed.
-   **Conciseness**: Be concise but thorough. Every sentence should add value.

## 3. Report Structure and Content Guidelines:

The report must follow this exact hierarchy. For each section, provide detailed and abstractive analysis, avoiding just repeating raw data.

### 1. Executive Summary
-   Provide a concise, high-level overview of the entire report.
-   Summarize the website's main purpose, key findings, and most important takeaways.
-   This section should be understandable as a standalone summary.

### 2. Website Overview
#### 2.1. Basic Information
-   **URL**: State the website's URL.
-   **Title**: Report the main title of the website.
-   **Description**: If available, summarize the website's meta description.
-   **Keywords**: If available, list important keywords associated with the page.
#### 2.2. Purpose and Main Message
-   Abstractively analyze the primary purpose or objective of the website.
-   What is the core message or value proposition it tries to convey?
-   Support your analysis with observations from the content.
#### 2.3. Target Audience
-   Who is the intended audience for this content?
-   Justify your assessment based on language, tone, content themes, and design.

### 3. Content Analysis
#### 3.1. Content Quality and Structure
-   Evaluate the overall quality of the content (e.g., accuracy, depth, originality).
-   Assess the content's organization, clarity, and readability.
-   How effectively is information presented (e.g., use of headings, paragraphs, media, flow)?
#### 3.2. Key Insights and Takeaways
-   Identify and elaborate on the most important takeaways, findings, or actionable insights derived from the content.
-   What are the critical pieces of information a reader should glean?
#### 3.3. Context and Relevance
-   Discuss the currency and relevance of the information presented. Is it up-to-date?
-   Consider any broader context (industry trends, current events) that might influence the content's meaning or impact.

### 4. Technical and Design Assessment
#### 4.1. Technical Aspects (if applicable)
-   If the website discusses or uses specific technologies, methodologies, or tools, assess them.
-   Comment on any observed technical performance (e.g., speed, responsiveness if deducible from data).
#### 4.2. User Experience (UX) and User Interface (UI)
-   Evaluate the navigation structure and ease of finding information.
-   Assess the visual design, aesthetics, and overall user interface (e.g., layout, color scheme, typography).
-   Comment on responsiveness (how it adapts to different devices) if information suggests.

### 5. Strengths, Weaknesses, and Recommendations
#### 5.1. Strengths
-   Identify and explain what the website does particularly well.
-   Highlight unique selling points or exemplary features.
#### 5.2. Weaknesses
-   Pinpoint areas where the website could be improved.
-   Be specific and constructive in your criticism.
#### 5.3. Recommendations
-   Provide clear, actionable recommendations for improving the identified weaknesses or enhancing strengths.
-   Suggestions should be practical and relevant to the website's purpose.

### 6. Supporting Data (Provided for your reference - do NOT directly copy into report sections)
This section provides the raw input data. You should *use* this information to construct your analysis in the sections above, but you should not just paste it into the report sections.

---

Begin your report now, starting with the \`# Website Analysis Report: [Website Title/URL]\` title.`;
}