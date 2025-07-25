import { Action, io, ctx } from "@interval/sdk";
import { 
  scrapeReddit, 
  type RedditScraperInput, 
  type RedditScraperOptions,
  type RedditScraperResult,
  type SearchSort,
  type TimeRange 
} from "../../services/apify/scrape-reddit";

// Type definitions for form inputs (using any for form values since they come from io.group)
interface RedditScraperFormInputs {
  startUrls?: string;
  searchTerms?: string;
  crawlCommentsPerPost: boolean;
  searchPosts: boolean;
  searchComments: boolean;
  searchCommunities: boolean;
  sortBy?: any;
  searchCommunity?: string;
  timeRange?: any;
  includeNSFW: boolean;
  maxPostsCount?: number;
  maxCommentsCount?: number;
  maxCommentsPerPost?: number;
  maxCommunitiesCount?: number;
  timeout: number;
  memory: number;
}

interface StartUrl {
  url: string;
  method: 'GET';
}

function parseCommaSeparatedUrls(input: string): StartUrl[] {
  return input
    .split(',')
    .map(url => ({ url: url.trim(), method: 'GET' as const }))
    .filter(item => item.url.length > 0);
}

function parseCommaSeparatedTerms(input: string): string[] {
  return input
    .split(',')
    .map(term => term.trim())
    .filter(term => term.length > 0);
}

function extractSelectValue<T>(value: { label: string; value: T } | T | undefined, defaultValue: T): T {
  if (!value) return defaultValue;
  return typeof value === 'object' && 'value' in value ? value.value : value;
}

export default new Action({
  backgroundable: true,
  name: "Reddit Scraper",
  description: "Scrape Reddit data using comprehensive search and URL options",
  handler: async (): Promise<string> => {
    const formInputs: RedditScraperFormInputs = await io
      .group({
        startUrls: io.input.text("Start URLs (optional)", {
          helpText: "Enter Reddit URLs to scrape, separated by commas (community URLs, post URLs, user URLs, etc.)",
          placeholder: "e.g., https://www.reddit.com/r/developers/, https://www.reddit.com/user/username",
        }).optional(),
        searchTerms: io.input.text("Search Terms (optional)", {
          helpText: "Search queries to find Reddit topics, separated by commas",
          placeholder: "e.g., web scraping, automation, programming",
        }).optional(),
        crawlCommentsPerPost: io.input.boolean("Crawl Comments Per Post", {
          helpText: "Will crawl comments for every post (if the link contains list of posts)",
          defaultValue: false,
        }),
        searchPosts: io.input.boolean("Get Posts", {
          helpText: "Will search for posts with the provided search",
          defaultValue: true,
        }),
        searchComments: io.input.boolean("Get Comments", {
          helpText: "Will search for comments with the provided search",
          defaultValue: false,
        }),
        searchCommunities: io.input.boolean("Get Communities", {
          helpText: "Will search for communities with the provided search",
          defaultValue: false,
        }),
        sortBy: io.select.single("Sort Search (optional)", {
          helpText: "Sort search by Relevance, Hot, Top, New or Comments",
          options: [
            { label: "Relevance", value: "relevance" },
            { label: "Hot", value: "hot" },
            { label: "Top", value: "top" },
            { label: "New", value: "new" },
            { label: "Comments", value: "comments" },
          ],
          defaultValue: { label: "New", value: "new" },
        }).optional(),
        searchCommunity: io.input.text("Search within a specific community (optional)", {
          helpText: "Only search within a specific community (one community only, ex: r/developers)",
          placeholder: "e.g., r/developers, r/webdev",
        }).optional(),
        timeRange: io.select.single("Retrieve From (Posts only, optional)", {
          helpText: "Time range for post search results",
          options: [
            { label: "Past Hour", value: "hour" },
            { label: "Past Day", value: "day" },
            { label: "Past Week", value: "week" },
            { label: "Past Month", value: "month" },
            { label: "Past Year", value: "year" },
            { label: "All Time", value: "all" },
          ],
          defaultValue: { label: "All Time", value: "all" },
        }).optional(),
        includeNSFW: io.input.boolean("Include NSFW Content", {
          helpText: "You can choose to include or exclude NSFW content from your search",
          defaultValue: false,
        }),
        maxPostsCount: io.input.number("Maximum number of posts to be saved (optional)", {
          helpText: "The maximum number of posts that will be scraped for Homepage Posts, Search Posts, Communities Posts or User Posts (max: 900)",
          min: 1,
          max: 900,
          placeholder: "10",
          defaultValue: 10,
        }).optional(),
        maxCommentsCount: io.input.number("Limit of comments to be saved (optional)", {
          helpText: "The maximum number of comments that will be scraped for Search Query Comments or User Comments (max: 900)",
          min: 1,
          max: 900,
          placeholder: "10",
          defaultValue: 10,
        }).optional(),
        maxCommentsPerPost: io.input.number("Limit of comments per post (optional)", {
          helpText: "The maximum number of comments that will be scraped for each Post (max: 500)",
          min: 1,
          max: 500,
          placeholder: "10",
          defaultValue: 10,
        }).optional(),
        maxCommunitiesCount: io.input.number("Limit of Communities to be saved (optional)", {
          helpText: "The maximum number of Communities that will be scraped for Search Query Communities (max: 100)",
          min: 1,
          max: 100,
          placeholder: "2",
          defaultValue: 2,
        }).optional(),
        timeout: io.input.number("Timeout (seconds)", {
          helpText: "Maximum time to wait for scraping to complete",
          min: 300,
          max: 7200,
          placeholder: "3600",
          defaultValue: 3600,
        }),
        memory: io.input.number("Memory (MB)", {
          helpText: "Memory allocation for the scraper",
          min: 1024,
          max: 32768,
          placeholder: "8192",
          defaultValue: 8192,
        }),
      })
      .validate((inputs): string | undefined => {
        const { startUrls, searchTerms, searchPosts, searchComments, searchCommunities } = inputs;
        const hasUrls = startUrls && startUrls.trim().length > 0;
        const hasSearchTerms = searchTerms && searchTerms.trim().length > 0;
        const hasSearchOptions = searchPosts || searchComments || searchCommunities;
        
        if (!hasUrls && !hasSearchTerms) {
          return "Please provide either Start URLs or Search Terms";
        }
        
        if (hasSearchTerms && !hasSearchOptions) {
          return "Please select at least one search option: Get Posts, Get Comments, or Get Communities";
        }
        
        // Validate URLs if provided
        if (hasUrls) {
          const urls = parseCommaSeparatedUrls(startUrls);
          for (const { url } of urls) {
            try {
              new URL(url);
              if (!url.includes('reddit.com')) {
                return `Invalid Reddit URL: ${url}. URLs must be from reddit.com`;
              }
            } catch {
              return `Invalid URL format: ${url}`;
            }
          }
        }
        
        return undefined;
      });

    // Extract and process form inputs with proper typing
    const {
      startUrls,
      searchTerms,
      crawlCommentsPerPost,
      searchPosts,
      searchComments,
      searchCommunities,
      sortBy,
      searchCommunity,
      timeRange,
      includeNSFW,
      maxPostsCount,
      maxCommentsCount,
      maxCommentsPerPost,
      maxCommunitiesCount,
      timeout,
      memory,
    } = formInputs;

    // Process form values with proper type safety
    const sortValue = extractSelectValue(sortBy, 'new' as SearchSort);
    const timeRangeValue = extractSelectValue(timeRange, 'all' as TimeRange);

    // Process start URLs from comma-separated string
    const processedStartUrls = startUrls ? parseCommaSeparatedUrls(startUrls) : undefined;

    // Process search terms from comma-separated string
    const searchTermsArray = searchTerms ? parseCommaSeparatedTerms(searchTerms) : undefined;

    await ctx.log(`Starting Reddit scraping...`);
    if (processedStartUrls && processedStartUrls.length > 0) {
      await ctx.log(`Start URLs: ${processedStartUrls.map(u => u.url).join(", ")}`);
    }
    if (searchTermsArray && searchTermsArray.length > 0) {
      await ctx.log(`Search terms: ${searchTermsArray.join(", ")}`);
    }
    if (searchCommunity) {
      await ctx.log(`Community: ${searchCommunity}`);
    }
    await ctx.log(`Search Posts: ${searchPosts}, Comments: ${searchComments}, Communities: ${searchCommunities}`);
    await ctx.log(`Crawl Comments Per Post: ${crawlCommentsPerPost}`);
    await ctx.log(`Sort: ${sortValue}, Time Range: ${timeRangeValue}`);
    await ctx.log(`Limits - Posts: ${maxPostsCount || 10}, Comments: ${maxCommentsCount || 10}, Comments/Post: ${maxCommentsPerPost || 10}, Communities: ${maxCommunitiesCount || 2}`);

    await ctx.loading.start({
      label: "Scraping Reddit data...",
      itemsInQueue: 1,
    });

    try {
      let itemCount = 0;
      
      const scraperOptions: RedditScraperOptions = { 
        timeout, 
        memory,
        onItem: async (item, _itemIndex) => {
          itemCount++;
          await ctx.log(`\n--- Item ${itemCount} scraped ---`);
          console.log(`Reddit Item ${itemCount}:`, JSON.stringify(item, null, 2));
          await ctx.log(`--- End Item ${itemCount} ---\n`);
        }
      };

      // Build the input object with proper typing
      const input: RedditScraperInput = {
        ...(processedStartUrls && processedStartUrls.length > 0 && { startUrls: processedStartUrls }),
        ...(searchTermsArray && searchTermsArray.length > 0 && { searchTerms: searchTermsArray }),
        crawlCommentsPerPost,
        searchPosts,
        searchComments,
        searchCommunities,
        searchSort: sortValue,
        ...(searchCommunity && { searchCommunity }),
        searchTime: timeRangeValue,
        includeNSFW,
        ...(maxPostsCount && { maxPostsCount }),
        ...(maxCommentsCount && { maxCommentsCount }),
        ...(maxCommentsPerPost && { maxCommentsPerPost }),
        ...(maxCommunitiesCount && { maxCommunitiesCount }),
      };

      const results: RedditScraperResult = await scrapeReddit(input, scraperOptions);

      await ctx.loading.completeOne();

      await ctx.log(`Scraping completed successfully!`);
      await ctx.log(`Run ID: ${results.runId}`);
      await ctx.log(`Status: ${results.status}`);
      await ctx.log(`Total items scraped: ${results.totalItems}`);

      return `Reddit scraping complete! Scraped ${results.totalItems} items. Run ID: ${results.runId}`;

    } catch (error) {
      await ctx.loading.completeOne();
      await ctx.log(`Error during scraping: ${error}`);
      
      return `Reddit scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
});