/**
 * Timeline/Newsfeed Prompt Builder
 * 
 * Provides trend analysis and summary prompts for timeline/newsfeed content
 */

/**
 * Build a short user message prompt for timeline/newsfeed analysis
 * @returns {string} The short user message
 */
export function buildPrompt() {
    return "Analyze this timeline or newsfeed to identify key trends, patterns, and the most significant items that capture the current zeitgeist.";
}

/**
 * Build the system prompt for timeline/newsfeed analysis
 * @returns {string} The detailed system prompt with instructions
 */
export function buildSystemPrompt() {
    return `You are analyzing a timeline or newsfeed to find trends and important posts. Follow these exact steps:

## Step 1: Find Ten Important Posts

Look through the timeline and pick exactly ten posts that stand out:

1. The most popular or shared posts with lots of engagement
2. Breaking news or urgent updates that just happened
3. Posts that started arguments or big discussions
4. Topics that keep showing up from different people
5. Posts from famous people or verified accounts that got attention
6. Photos or videos that went viral or got lots of views
7. Personal stories that connect to bigger issues
8. Posts with data, statistics, or research results
9. Posts where lots of people are reacting the same way
10. Unusual posts that go against what everyone else is saying

## Step 2: Initial Analysis

When I look at a timeline, I start by finding the main topics everyone is talking about. What subjects keep coming up over and over? I notice if people are posting about the same things at the same time, like they're all reacting to the same event. I also look at who is posting - are they regular people, news outlets, or influencers?

Next, I check which posts are spreading the fastest. Some posts get thousands of shares in minutes while others slowly build up over days. I also notice the overall mood - are people mostly happy, angry, worried, or excited? This tells me a lot about what's really going on in the community.

## Step 3: Find Five Things I Missed

What important patterns did I not notice yet:

1. Are people only seeing posts that agree with their views?
2. Which groups of people aren't being heard in this timeline?
3. How does the platform decide which posts to show first?
4. What times of day do people post and engage the most?
5. How do posts spread from one person to their friends and beyond?

## Step 4: Deeper Analysis

When I look at a timeline more carefully, I need to think about what controls what I see. The main topics might be popular because they're actually important, or maybe the platform's algorithm is pushing them to the top. Some topics might be trending because a group coordinated to make them trend. I need to consider both what I can see and what might be hidden.

I also think about which posts go viral and why. Sometimes it's not about quality - it's about timing, who posted it, or how it makes people feel. The platform itself affects this too. If the platform rewards short, emotional posts over long, thoughtful ones, that's what we'll see more of. This shapes how people communicate and what information spreads.

Finally, I consider what this timeline tells us about how information moves online. People often see posts that confirm what they already believe. Some voices get amplified while others get ignored. The platform makes money by keeping people scrolling, which affects what content gets promoted. Understanding these factors helps explain why we see what we see in our feeds.

## Final Output Instructions

You must write your analysis in this EXACT format:

**First Section - Ten Important Posts:**
List exactly ten posts (numbered 1-10) from the timeline. Write one clear sentence about each post. Include details like how many likes/shares it got, who posted it, or when it was posted.

**Second Section - Initial Analysis:**
Write exactly TWO paragraphs (4-6 sentences each) about the trends you see. Talk about the main topics, how fast things are spreading, and the overall mood of the timeline.

**Third Section - Five Things I Missed:**
List exactly five things (numbered 1-5) that affect the timeline but weren't in your first analysis. Think about how the platform works and what might be hidden.

**Fourth Section - Deeper Analysis:**
Write exactly THREE paragraphs (4-6 sentences each) that include the five things you missed. Build on your initial analysis without contradicting it. Explain how the platform and social factors affect what we see.

Use specific examples from the actual posts. Show how individual posts connect to bigger trends. Explain how information spreads online.`;
}