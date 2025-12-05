// YT-Tag-Generator MCP Server
// Generates optimized YouTube tags for video discoverability

const WebSocket = require('ws');

class YTTagGenerator {
  constructor() {
    this.name = 'YT-Tag-Generator';
    this.version = '1.0.0';
    this.capabilities = ['youtube', 'tags', 'metadata', 'seo'];
    this.port = process.env.PORT || 3000;

    // YouTube tag constraints
    this.constraints = {
      maxTagLength: 500, // Max characters per tag
      maxTotalTags: 500, // Max total characters for all tags
      recommendedTagCount: { min: 5, max: 15 },
      optimalTagLength: { min: 2, max: 30 }
    };

    // Tag categories
    this.tagCategories = {
      exact: 'Exact match keywords',
      broad: 'Broad topic tags',
      related: 'Related topic tags',
      branded: 'Channel/brand tags',
      trending: 'Trending/timely tags',
      misspellings: 'Common misspellings'
    };
  }

  start() {
    const wss = new WebSocket.Server({ port: this.port });

    wss.on('connection', (ws) => {
      console.log(`[${new Date().toISOString()}] Client connected`);

      ws.on('message', async (message) => {
        try {
          const request = JSON.parse(message.toString());
          console.log(`[${new Date().toISOString()}] Received:`, request.method);

          const response = await this.handleRequest(request);
          ws.send(JSON.stringify(response));
        } catch (error) {
          console.error('Error processing message:', error);
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error' },
            id: null
          }));
        }
      });

      ws.on('close', () => {
        console.log(`[${new Date().toISOString()}] Client disconnected`);
      });
    });

    console.log(`🚀 ${this.name} MCP server running on port ${this.port}`);

    if (process.env.REPLIT_ENVIRONMENT === 'production') {
      console.log(`📡 Published WebSocket URL: wss://yt-tag-generator-agt.replit.app`);
    } else {
      console.log(`📡 Dev WebSocket URL: ws://localhost:${this.port}`);
    }
  }

  async handleRequest(request) {
    const { method, params, id } = request;

    switch(method) {
      case 'ping':
        return this.handlePing(id);

      case 'tools/list':
        return this.handleToolsList(id);

      case 'tools/call':
        return await this.handleToolCall(params, id);

      default:
        return {
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id
        };
    }
  }

  handlePing(id) {
    return {
      jsonrpc: '2.0',
      result: {
        status: 'ok',
        agent: this.name,
        version: this.version,
        timestamp: new Date().toISOString()
      },
      id
    };
  }

  handleToolsList(id) {
    return {
      jsonrpc: '2.0',
      result: {
        tools: [
          {
            name: 'generateTags',
            description: 'Generate optimized YouTube tags based on analyzed keywords',
            inputSchema: {
              type: 'object',
              properties: {
                concept: {
                  type: 'string',
                  description: 'The video concept/topic'
                },
                title: {
                  type: 'string',
                  description: 'The video title'
                },
                keywords: {
                  type: 'object',
                  description: 'Analyzed keywords with recommendations'
                },
                channelName: {
                  type: 'string',
                  description: 'Channel name for branded tags'
                },
                niche: {
                  type: 'string',
                  description: 'Content niche'
                },
                maxTags: {
                  type: 'number',
                  default: 15,
                  description: 'Maximum number of tags to generate'
                },
                includeMisspellings: {
                  type: 'boolean',
                  default: true,
                  description: 'Include common misspellings'
                }
              },
              required: ['concept', 'keywords']
            }
          }
        ]
      },
      id
    };
  }

  async handleToolCall(params, id) {
    const { name, arguments: args } = params;

    if (name !== 'generateTags') {
      return {
        jsonrpc: '2.0',
        error: { code: -32602, message: `Unknown tool: ${name}` },
        id
      };
    }

    try {
      const result = await this.generateTags(args);
      return {
        jsonrpc: '2.0',
        result: {
          content: result
        },
        id
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: { code: -32603, message: error.message },
        id
      };
    }
  }

  async generateTags({
    concept,
    title,
    keywords,
    channelName,
    niche,
    maxTags = 15,
    includeMisspellings = true
  }) {
    if (!concept) {
      throw new Error('Concept is required');
    }

    console.log(`Generating tags for: "${concept}"`);

    const allTags = [];

    // Extract keywords from analyzer results
    const primaryKeywords = keywords?.recommended?.primary || [];
    const secondaryKeywords = keywords?.recommended?.secondary || [];
    const longTailKeywords = keywords?.recommended?.longTail || [];

    // 1. Exact match tags (highest priority)
    const exactTags = this.generateExactMatchTags(concept, title, primaryKeywords);
    allTags.push(...exactTags);

    // 2. Broad topic tags
    const broadTags = this.generateBroadTags(concept, niche);
    allTags.push(...broadTags);

    // 3. Related/secondary tags
    const relatedTags = this.generateRelatedTags(secondaryKeywords, longTailKeywords);
    allTags.push(...relatedTags);

    // 4. Trending/timely tags
    const trendingTags = this.generateTrendingTags(concept);
    allTags.push(...trendingTags);

    // 5. Branded tags
    if (channelName) {
      const brandedTags = this.generateBrandedTags(channelName, concept);
      allTags.push(...brandedTags);
    }

    // 6. Misspelling tags
    if (includeMisspellings) {
      const misspellingTags = this.generateMisspellingTags(concept);
      allTags.push(...misspellingTags);
    }

    // Remove duplicates and filter by constraints
    const uniqueTags = this.deduplicateAndFilter(allTags);

    // Sort by priority and limit
    uniqueTags.sort((a, b) => b.priority - a.priority);
    const selectedTags = uniqueTags.slice(0, maxTags);

    // Calculate total character count
    const totalCharacters = selectedTags.reduce((sum, t) => sum + t.tag.length, 0);

    // Validate against YouTube limits
    const validation = this.validateTags(selectedTags);

    return {
      concept,
      title: title || 'Not specified',
      generatedAt: new Date().toISOString(),
      tags: selectedTags,
      tagList: selectedTags.map(t => t.tag),
      copyPasteFormat: selectedTags.map(t => t.tag).join(', '),
      statistics: {
        totalTags: selectedTags.length,
        totalCharacters,
        averageTagLength: Math.round(totalCharacters / selectedTags.length),
        byCategory: this.countByCategory(selectedTags)
      },
      validation,
      recommendations: this.generateRecommendations(selectedTags, validation),
      tips: [
        'Put your most important tags first - YouTube gives them more weight',
        'Use a mix of broad and specific tags',
        'Include your channel name as a tag',
        'Use 2-3 word phrases, not just single words',
        'Check competitor videos for tag ideas'
      ]
    };
  }

  generateExactMatchTags(concept, title, primaryKeywords) {
    const tags = [];

    // Main concept as tag
    tags.push({
      tag: concept.toLowerCase(),
      category: 'exact',
      priority: 100,
      reason: 'Main video concept'
    });

    // Title-based tags
    if (title) {
      const titleWords = title.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(' ')
        .filter(w => w.length > 2);

      // Full title (if not too long)
      if (title.length <= 30) {
        tags.push({
          tag: title.toLowerCase(),
          category: 'exact',
          priority: 95,
          reason: 'Video title'
        });
      }

      // Key phrases from title (2-3 word combinations)
      for (let i = 0; i < titleWords.length - 1; i++) {
        const phrase = titleWords.slice(i, i + 2).join(' ');
        if (phrase.length >= 5 && phrase.length <= 30) {
          tags.push({
            tag: phrase,
            category: 'exact',
            priority: 85,
            reason: 'Title phrase'
          });
        }
      }
    }

    // Primary keywords as tags
    primaryKeywords.forEach((kw, index) => {
      tags.push({
        tag: kw.keyword.toLowerCase(),
        category: 'exact',
        priority: 90 - index * 5,
        reason: 'Primary keyword'
      });
    });

    return tags;
  }

  generateBroadTags(concept, niche) {
    const tags = [];
    const conceptWords = concept.toLowerCase().split(' ');

    // Single word tags from concept
    conceptWords.filter(w => w.length > 3).forEach((word, index) => {
      tags.push({
        tag: word,
        category: 'broad',
        priority: 60 - index * 2,
        reason: 'Concept word'
      });
    });

    // Niche-based tags
    if (niche) {
      tags.push({
        tag: niche.toLowerCase(),
        category: 'broad',
        priority: 65,
        reason: 'Content niche'
      });

      tags.push({
        tag: `${niche.toLowerCase()} video`,
        category: 'broad',
        priority: 55,
        reason: 'Niche + video'
      });
    }

    // Common broad tags
    const broadPatterns = ['tutorial', 'guide', 'how to', 'tips', 'learn'];
    broadPatterns.forEach((pattern, index) => {
      tags.push({
        tag: `${concept.toLowerCase()} ${pattern}`,
        category: 'broad',
        priority: 50 - index * 2,
        reason: 'Broad pattern'
      });
    });

    return tags;
  }

  generateRelatedTags(secondaryKeywords, longTailKeywords) {
    const tags = [];

    // Secondary keywords
    secondaryKeywords.slice(0, 5).forEach((kw, index) => {
      tags.push({
        tag: kw.keyword.toLowerCase(),
        category: 'related',
        priority: 70 - index * 3,
        reason: 'Secondary keyword'
      });
    });

    // Long-tail keywords (often make great tags)
    longTailKeywords.slice(0, 5).forEach((kw, index) => {
      const tag = kw.keyword.toLowerCase();
      if (tag.length <= 30) {
        tags.push({
          tag,
          category: 'related',
          priority: 65 - index * 3,
          reason: 'Long-tail keyword'
        });
      }
    });

    return tags;
  }

  generateTrendingTags(concept) {
    const tags = [];
    const year = new Date().getFullYear();

    // Year-based tags
    tags.push({
      tag: `${concept.toLowerCase()} ${year}`,
      category: 'trending',
      priority: 75,
      reason: 'Current year tag'
    });

    tags.push({
      tag: `${concept.toLowerCase()} tutorial ${year}`,
      category: 'trending',
      priority: 70,
      reason: 'Year + tutorial'
    });

    // Common trending patterns
    const trendingPatterns = ['new', 'latest', 'updated', 'best'];
    trendingPatterns.forEach((pattern, index) => {
      tags.push({
        tag: `${pattern} ${concept.toLowerCase()}`,
        category: 'trending',
        priority: 55 - index * 3,
        reason: 'Trending pattern'
      });
    });

    return tags;
  }

  generateBrandedTags(channelName, concept) {
    const tags = [];
    const cleanChannel = channelName.toLowerCase().replace(/[^\w\s]/g, '');

    tags.push({
      tag: cleanChannel,
      category: 'branded',
      priority: 80,
      reason: 'Channel name'
    });

    tags.push({
      tag: `${cleanChannel} ${concept.toLowerCase().split(' ')[0]}`,
      category: 'branded',
      priority: 75,
      reason: 'Channel + topic'
    });

    return tags;
  }

  generateMisspellingTags(concept) {
    const tags = [];
    const words = concept.toLowerCase().split(' ');

    // Common misspelling patterns
    const misspellingPatterns = [
      { find: /ie/g, replace: 'ei' },
      { find: /ei/g, replace: 'ie' },
      { find: /tion/g, replace: 'sion' },
      { find: /sion/g, replace: 'tion' },
      { find: /([aeiou])\1/g, replace: '$1' }, // Double vowels
      { find: /([^aeiou])\1/g, replace: '$1' }  // Double consonants
    ];

    words.forEach(word => {
      if (word.length > 4) {
        misspellingPatterns.forEach((pattern, index) => {
          const misspelled = word.replace(pattern.find, pattern.replace);
          if (misspelled !== word && misspelled.length > 3) {
            tags.push({
              tag: misspelled,
              category: 'misspellings',
              priority: 30 - index * 2,
              reason: 'Common misspelling'
            });
          }
        });
      }
    });

    return tags.slice(0, 3); // Limit misspellings
  }

  deduplicateAndFilter(tags) {
    const seen = new Set();
    return tags.filter(tagObj => {
      const normalized = tagObj.tag.toLowerCase().trim();

      // Skip if duplicate
      if (seen.has(normalized)) return false;
      seen.add(normalized);

      // Skip if too short or too long
      if (normalized.length < 2 || normalized.length > 30) return false;

      // Skip if just common words
      const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were'];
      if (stopWords.includes(normalized)) return false;

      return true;
    });
  }

  countByCategory(tags) {
    const counts = {};
    tags.forEach(t => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return counts;
  }

  validateTags(tags) {
    const issues = [];
    const totalChars = tags.reduce((sum, t) => sum + t.tag.length, 0);

    if (tags.length < this.constraints.recommendedTagCount.min) {
      issues.push({
        type: 'warning',
        message: `Only ${tags.length} tags - consider adding more (recommended: ${this.constraints.recommendedTagCount.min}-${this.constraints.recommendedTagCount.max})`
      });
    }

    if (totalChars > this.constraints.maxTotalTags) {
      issues.push({
        type: 'error',
        message: `Total tag characters (${totalChars}) exceeds YouTube limit (${this.constraints.maxTotalTags})`
      });
    }

    const longTags = tags.filter(t => t.tag.length > 30);
    if (longTags.length > 0) {
      issues.push({
        type: 'warning',
        message: `${longTags.length} tag(s) are longer than 30 characters`
      });
    }

    return {
      valid: issues.filter(i => i.type === 'error').length === 0,
      issues,
      characterCount: totalChars,
      characterLimit: this.constraints.maxTotalTags,
      charactersRemaining: this.constraints.maxTotalTags - totalChars
    };
  }

  generateRecommendations(tags, validation) {
    const recommendations = [];

    if (!validation.valid) {
      recommendations.push('Fix validation errors before uploading');
    }

    const categories = this.countByCategory(tags);

    if (!categories.exact || categories.exact < 3) {
      recommendations.push('Add more exact-match tags for your main keywords');
    }

    if (!categories.trending) {
      recommendations.push('Include year-based tags for better recency signals');
    }

    if (!categories.branded) {
      recommendations.push('Add your channel name as a tag for brand association');
    }

    if (validation.charactersRemaining > 100) {
      recommendations.push(`You have ${validation.charactersRemaining} characters remaining - consider adding more tags`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Tags look well-optimized!');
    }

    return recommendations;
  }
}

// Start the server
const server = new YTTagGenerator();
server.start();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing WebSocket server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing WebSocket server');
  process.exit(0);
});
