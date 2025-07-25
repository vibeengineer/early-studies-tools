import { z } from 'zod';
import { ApifyClient } from 'apify-client';
import { 
  RedditOutputItem, 
  validateRedditOutput,
  validateRedditItem
} from './reddit-schemas';

const ACTOR_ID = "harshmaur/reddit-scraper-pro";
const API_TOKEN = process.env.APIFY_API_KEY;

// Type definitions
export type SearchSort = 'relevance' | 'hot' | 'top' | 'new' | 'comments';
export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';

// Use typed Reddit output items instead of generic interface
export type RedditItem = RedditOutputItem;

export interface RedditScraperResult {
  runId: string;
  status: string;
  items: RedditOutputItem[];
  totalItems: number;
}

export interface RedditScraperOptions {
  timeout?: number;
  memory?: number;
  onItem?: (item: RedditOutputItem, itemIndex: number) => void | Promise<void>;
}

const inputSchema = z.object({
  /* ───────────── START URLS ───────────── */
  startUrls: z
    .array(
      z.object({
        url: z
          .string()
          .url()
          .describe(
            'Start URLS: Enter a search query url, community url, post url, user url etc'
          ),
        method: z.literal('GET').default('GET'),
      })
    )
    .optional(),

  /* ───────────── SEARCH BLOCK ───────────── */
  searchTerms: z
    .array(
      z
        .string()
        .min(1)
        .describe(
          'Search Terms: Here you can provide a search query which will be used to search Reddit`s topics.'
        )
    )
    .optional(),

  crawlCommentsPerPost: z
    .boolean()
    .describe(
      'Crawl Comments per post: Will crawl comments for the every posts (if the link contains list of posts)'
    )
    .optional(),

  searchPosts: z
    .boolean()
    .describe('Get posts: Will search for posts with the provided search')
    .optional(),

  searchComments: z
    .boolean()
    .describe(
      'Get comments: Will search for comments with the provided search'
    )
    .optional(),

  searchCommunities: z
    .boolean()
    .describe(
      'Get communities: Will search for communities with the provided search'
    )
    .optional(),

  searchSort: z
    .enum(['relevance', 'hot', 'top', 'new', 'comments'])
    .describe(
      'Sort search: Sort search by Relevance, Hot, Top, New or Comments'
    )
    .optional(),

  /* One-subreddit search (not in the original JSON but referenced in the help text) */
  searchCommunity: z
    .string()
    .describe(
      'Search within a specific community (one community only ex: r/developers): Only search within a specific community'
    )
    .optional(),

  searchTime: z
    .enum(['hour', 'day', 'week', 'month', 'year', 'all'])
    .describe(
      'Retrieve From (Posts only): Time range for post search results'
    )
    .optional(),

  /* ───────────── SAFE SEARCH ───────────── */
  includeNSFW: z
    .boolean()
    .describe(
      'Include NSFW content: You can choose to include or exclude NSFW content from your search'
    )
    .optional(),

  /* ───────────── LIMITS ───────────── */
  maxPostsCount: z
    .number()
    .int()
    .positive()
    .max(900)
    .describe(
      'Maximum number of posts to be saved: The maximum number of posts that will be scraped for Homepage Posts, Search Posts, Communities Posts or User Posts (max: 900)'
    )
    .optional(),

  maxCommentsCount: z
    .number()
    .int()
    .positive()
    .max(900)
    .describe(
      'Limit of comments to be saved: The maximum number of comments that will be scraped for Search Query Comments or User Comments (max: 900)'
    )
    .optional(),

  maxCommentsPerPost: z
    .number()
    .int()
    .positive()
    .max(500)
    .describe(
      'Limit of comments per post: The maximum number of comments that will be scraped for each Post (max: 500)'
    )
    .optional(),

  maxCommunitiesCount: z
    .number()
    .int()
    .positive()
    .max(100)
    .describe(
      'Limit of Communities to be saved: The maximum number of Communities that will be scraped for Search Query Communities (max: 100)'
    )
    .optional(),

  /* ───────────── PROXY ───────────── */
  proxy: z
    .object({
      useApifyProxy: z.boolean(),
      apifyProxyGroups: z.array(z.string()),
    })
    .describe('Proxy configuration (Apify or custom)')
    .optional(),
});

export type RedditScraperInput = z.infer<typeof inputSchema>;


export async function scrapeReddit(
  input: RedditScraperInput,
  options: RedditScraperOptions = {}
): Promise<RedditScraperResult> {
  if (!API_TOKEN) {
    throw new Error('APIFY_API_KEY environment variable is required');
  }

  // Validate input against schema
  const validatedInput = inputSchema.parse(input);

  // Initialize Apify client
  const client = new ApifyClient({ token: API_TOKEN });

  try {
    // Start the Actor run (don't wait for completion if onItem callback is provided)
    if (options.onItem) {
      return await scrapeWithStreaming(client, validatedInput, options);
    }

    // Simple run without streaming
    const run = await client.actor(ACTOR_ID).call(validatedInput, {
      timeout: options.timeout || 3600,
      memory: options.memory || 8192,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    // Validate the output using our Reddit schemas
    const validatedItems = validateRedditOutput(items);
    
    return {
      runId: run.id,
      status: run.status,
      items: validatedItems,
      totalItems: validatedItems.length,
    };
  } catch (error) {
    throw new Error(`Reddit scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Separate function for streaming results
async function scrapeWithStreaming(
  client: ApifyClient,
  input: RedditScraperInput,
  options: RedditScraperOptions
): Promise<RedditScraperResult> {
  // Start the Actor run (don't wait for completion)
  const run = await client.actor(ACTOR_ID).start(input, {
    timeout: options.timeout || 3600,
    memory: options.memory || 8192,
  });

  let allItems: RedditOutputItem[] = [];
  let itemIndex = 0;
  let offset = 0;
  const limit = 100;

  // Poll for results while the run is in progress
  while (true) {
    // Check run status
    const runInfo = await client.run(run.id).get();
    
    // Try to fetch new items from the dataset
    try {
      const { items: newItems } = await client.dataset(run.defaultDatasetId).listItems({
        offset,
        limit,
      });

      // Process any new items with validation
      for (const item of newItems) {
        try {
          const validatedItem = validateRedditItem(item);
          allItems.push(validatedItem);
          if (options.onItem) {
            await options.onItem(validatedItem, itemIndex);
          }
          itemIndex++;
        } catch (validationError) {
          console.warn('Failed to validate Reddit item:', validationError);
          // Skip invalid items
        }
      }

      // Update offset for next batch
      if (newItems.length > 0) {
        offset += newItems.length;
      }
    } catch (datasetError) {
      // Dataset might not be ready yet, continue polling
    }

    // Check if run is finished
    if (runInfo && ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'].includes(runInfo.status)) {
      // Final fetch to get any remaining items
      try {
        const { items: finalItems } = await client.dataset(run.defaultDatasetId).listItems({
          offset,
        });

        for (const item of finalItems) {
          try {
            const validatedItem = validateRedditItem(item);
            allItems.push(validatedItem);
            if (options.onItem) {
              await options.onItem(validatedItem, itemIndex);
            }
            itemIndex++;
          } catch (validationError) {
            console.warn('Failed to validate Reddit item:', validationError);
            // Skip invalid items
          }
        }
      } catch (finalError) {
        // Ignore errors on final fetch
      }
      break;
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const finalRunInfo = await client.run(run.id).get();
  
  return {
    runId: run.id,
    status: finalRunInfo?.status || 'UNKNOWN',
    items: allItems,
    totalItems: allItems.length,
  };
}

// Helper functions for common use cases
export interface PostScrapingOptions {
  maxPosts?: number;
  sort?: SearchSort;
  timeRange?: TimeRange;
  includeNSFW?: boolean;
  scraperOptions?: RedditScraperOptions;
}

export async function scrapeRedditPosts(
  searchTerms: string[],
  options: PostScrapingOptions = {}
): Promise<RedditScraperResult> {
  return scrapeReddit({
    searchTerms,
    searchPosts: true,
    maxPostsCount: options.maxPosts || 50,
    searchSort: options.sort || 'relevance',
    searchTime: options.timeRange || 'week',
    includeNSFW: options.includeNSFW || false,
  }, options.scraperOptions);
}

export interface CommentScrapingOptions {
  maxComments?: number;
  sort?: SearchSort;
  includeNSFW?: boolean;
  scraperOptions?: RedditScraperOptions;
}

export async function scrapeRedditComments(
  searchTerms: string[],
  options: CommentScrapingOptions = {}
): Promise<RedditScraperResult> {
  return scrapeReddit({
    searchTerms,
    searchComments: true,
    maxCommentsCount: options.maxComments || 100,
    searchSort: options.sort || 'relevance',
    includeNSFW: options.includeNSFW || false,
  }, options.scraperOptions);
}

export interface CommunityScrapingOptions {
  maxPosts?: number;
  crawlComments?: boolean;
  maxCommentsPerPost?: number;
  includeNSFW?: boolean;
  scraperOptions?: RedditScraperOptions;
}

export async function scrapeCommunityPosts(
  community: string,
  options: CommunityScrapingOptions = {}
): Promise<RedditScraperResult> {
  return scrapeReddit({
    searchCommunity: community,
    searchPosts: true,
    maxPostsCount: options.maxPosts || 50,
    crawlCommentsPerPost: options.crawlComments || false,
    maxCommentsPerPost: options.maxCommentsPerPost || 20,
    includeNSFW: options.includeNSFW || false,
  }, options.scraperOptions);
}

export interface CommunitySearchOptions {
  maxCommunities?: number;
  scraperOptions?: RedditScraperOptions;
}

export async function scrapeRedditCommunities(
  searchTerms: string[],
  options: CommunitySearchOptions = {}
): Promise<RedditScraperResult> {
  return scrapeReddit({
    searchTerms,
    searchCommunities: true,
    maxCommunitiesCount: options.maxCommunities || 20,
  }, options.scraperOptions);
}