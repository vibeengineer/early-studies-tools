import { Action, io, ctx } from "@interval/sdk";
import {
  scrapeReddit,
  type RedditScraperInput,
  type RedditScraperOptions,
  type RedditScraperResult,
  type SearchSort,
  type TimeRange,
} from "../../services/apify/scrape-reddit";
import {
  type RedditOutputItem,
  isRedditComment,
  isRedditPost,
  isRedditCommunity,
} from "../../services/apify/reddit-schemas";

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
  method: "GET";
}

function parseCommaSeparatedUrls(input: string): StartUrl[] {
  return input
    .split(",")
    .map((url) => ({ url: url.trim(), method: "GET" as const }))
    .filter((item) => item.url.length > 0);
}

function parseCommaSeparatedTerms(input: string): string[] {
  return input
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function extractSelectValue<T>(
  value: { label: string; value: T } | T | undefined,
  defaultValue: T
): T {
  if (!value) return defaultValue;
  return typeof value === "object" && "value" in value ? value.value : value;
}

export default new Action({
  backgroundable: true,
  name: "Reddit Scraper",
  description: "Scrape Reddit data using comprehensive search and URL options",
  handler: async (): Promise<string> => {
    const formInputs: RedditScraperFormInputs = await io
      .group({
        startUrls: io.input
          .text("Start URLs (optional)", {
            helpText:
              "Enter specific Reddit URLs to scrape, separated by commas. Supports: subreddit URLs (r/technology), user profiles (user/username), specific posts, search result URLs, or popular feeds. Leave empty to use search terms instead.",
            placeholder:
              "e.g., https://www.reddit.com/r/technology/, https://www.reddit.com/user/someusername",
          })
          .optional(),
        searchTerms: io.input
          .text("Search Terms (optional)", {
            helpText:
              "Enter keywords or phrases to search across Reddit, separated by commas. Use with 'Get Posts', 'Get Comments', or 'Get Communities' options below. Example: 'artificial intelligence, machine learning'",
            placeholder: "e.g., cryptocurrency, blockchain, web scraping",
          })
          .optional(),
        crawlCommentsPerPost: io.input.boolean("Crawl Comments Per Post", {
          helpText:
            "When scraping posts from URLs or searches, also extract comments from each post. Useful for getting full discussion context. Limited by 'comments per post' setting below.",
          defaultValue: false,
        }),
        searchPosts: io.input.boolean("Get Posts", {
          helpText:
            "Search for and extract Reddit posts based on your search terms. Returns post titles, content, metadata, upvotes, and author information. Required when using search terms.",
          defaultValue: true,
        }),
        searchComments: io.input.boolean("Get Comments", {
          helpText:
            "Search for individual comments across Reddit that match your search terms. Returns comment text, author, parent post info, and upvotes. Can be used with or without 'Get Posts'.",
          defaultValue: false,
        }),
        searchCommunities: io.input.boolean("Get Communities", {
          helpText:
            "Search for and extract information about Reddit communities (subreddits) that match your search terms. Returns community name, description, subscriber count, and rules.",
          defaultValue: false,
        }),
        sortBy: io.select
          .single("Sort Search (optional)", {
            helpText:
              "Choose how search results are sorted: Relevance (best match), Hot (trending), Top (highest upvoted), New (most recent), or Comments (most discussed). Default: New",
            options: [
              { label: "Relevance", value: "relevance" },
              { label: "Hot", value: "hot" },
              { label: "Top", value: "top" },
              { label: "New", value: "new" },
              { label: "Comments", value: "comments" },
            ],
            defaultValue: { label: "New", value: "new" },
          })
          .optional(),
        searchCommunity: io.input
          .text("Search within a specific community (optional)", {
            helpText:
              "Limit your search to only one specific subreddit community. Enter the community name with or without 'r/' prefix. Example: 'technology' or 'r/technology'",
            placeholder: "e.g., technology, webdev, AskReddit",
          })
          .optional(),
        timeRange: io.select
          .single("Retrieve From (Posts only, optional)", {
            helpText:
              "Filter posts by when they were posted. Only applies to post searches. 'All Time' includes posts from any date, while other options limit to recent timeframes. Default: All Time",
            options: [
              { label: "Past Hour", value: "hour" },
              { label: "Past Day", value: "day" },
              { label: "Past Week", value: "week" },
              { label: "Past Month", value: "month" },
              { label: "Past Year", value: "year" },
              { label: "All Time", value: "all" },
            ],
            defaultValue: { label: "All Time", value: "all" },
          })
          .optional(),
        includeNSFW: io.input.boolean("Include NSFW Content", {
          helpText:
            "Include Not Safe For Work (adult/mature) content in your results. When disabled, only safe-for-work content will be scraped. Default: disabled for safety.",
          defaultValue: false,
        }),
        maxPostsCount: io.input
          .number("Maximum number of posts to be saved (optional)", {
            helpText:
              "Limit the total number of posts to scrape across all sources (homepage, search results, communities, user profiles). Higher numbers take longer but provide more data. Maximum: 900 posts.",
            min: 1,
            max: 900,
            placeholder: "10",
            defaultValue: 10,
          })
          .optional(),
        maxCommentsCount: io.input
          .number("Limit of comments to be saved (optional)", {
            helpText:
              "When searching for comments directly (not per-post comments), limit the total number of individual comments to scrape. This applies to comment searches and user comment history. Maximum: 900 comments.",
            min: 1,
            max: 900,
            placeholder: "10",
            defaultValue: 10,
          })
          .optional(),
        maxCommentsPerPost: io.input
          .number("Limit of comments per post (optional)", {
            helpText:
              "When 'Crawl Comments Per Post' is enabled, limit how many comments to extract from each individual post. Top-level and nested comments are included. Maximum: 500 comments per post.",
            min: 1,
            max: 500,
            placeholder: "10",
            defaultValue: 10,
          })
          .optional(),
        maxCommunitiesCount: io.input
          .number("Limit of Communities to be saved (optional)", {
            helpText:
              "When 'Get Communities' is enabled, limit the number of subreddit communities to scrape information about. Useful for broad searches that might return many communities. Maximum: 100 communities.",
            min: 1,
            max: 100,
            placeholder: "2",
            defaultValue: 2,
          })
          .optional(),
        timeout: io.input.number("Timeout (seconds)", {
          helpText:
            "Maximum time allowed for the entire scraping process to complete before automatically stopping. Larger datasets or more comprehensive scraping may need longer timeouts. Range: 5-120 minutes.",
          min: 300,
          max: 7200,
          placeholder: "3600",
          defaultValue: 3600,
        }),
        memory: io.input.number("Memory (MB)", {
          helpText:
            "Amount of memory allocated to the scraping process. Higher memory allows for larger datasets and faster processing but costs more. Recommended: 8192MB for most use cases.",
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
              if (!url.includes("reddit.com")) {
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
    const sortValue = extractSelectValue(sortBy, "new" as SearchSort);
    const timeRangeValue = extractSelectValue(timeRange, "all" as TimeRange);

    // Process start URLs from comma-separated string
    const processedStartUrls = startUrls ? parseCommaSeparatedUrls(startUrls) : undefined;

    // Process search terms from comma-separated string
    const searchTermsArray = searchTerms ? parseCommaSeparatedTerms(searchTerms) : undefined;

    await ctx.log(`Starting Reddit scraping...`);
    if (processedStartUrls && processedStartUrls.length > 0) {
      await ctx.log(`Start URLs: ${processedStartUrls.map((u) => u.url).join(", ")}`);
    }
    if (searchTermsArray && searchTermsArray.length > 0) {
      await ctx.log(`Search terms: ${searchTermsArray.join(", ")}`);
    }
    if (searchCommunity) {
      await ctx.log(`Community: ${searchCommunity}`);
    }
    await ctx.log(
      `Search Posts: ${searchPosts}, Comments: ${searchComments}, Communities: ${searchCommunities}`
    );
    await ctx.log(`Crawl Comments Per Post: ${crawlCommentsPerPost}`);
    await ctx.log(`Sort: ${sortValue}, Time Range: ${timeRangeValue}`);
    await ctx.log(
      `Limits - Posts: ${maxPostsCount || 10}, Comments: ${
        maxCommentsCount || 10
      }, Comments/Post: ${maxCommentsPerPost || 10}, Communities: ${maxCommunitiesCount || 2}`
    );

    // Calculate estimated total items based on limits (regardless of boolean flags)
    let estimatedItems = 0;
    estimatedItems += maxPostsCount || 10; // Posts
    estimatedItems += maxCommentsCount || 10; // Direct comments
    estimatedItems += maxCommunitiesCount || 2; // Communities
    estimatedItems += (maxPostsCount || 10) * (maxCommentsPerPost || 10); // Comments per post

    await ctx.log(`Estimated items to scrape: ${estimatedItems}`);

    await ctx.loading.start({
      label: "Scraping Reddit data...",
      description:
        "This may take a while, so please be patient. Feel free to leave this page. The number of items is based on the maximum limits so it will likely be less as not all posts will have the maximum number of comments.",
      itemsInQueue: estimatedItems,
    });

    try {
      let itemCount = 0;

      const scraperOptions: RedditScraperOptions = {
        timeout,
        memory,
        onItem: async (item: RedditOutputItem, _itemIndex) => {
          itemCount++;
          await ctx.log(`\n--- Item ${itemCount} scraped ---`);

          // Log item with type information
          let itemType = "unknown";
          if (isRedditPost(item)) {
            itemType = "post";
            await ctx.log(`Post: ${item.title}`);
          } else if (isRedditComment(item)) {
            itemType = "comment";
            await ctx.log(`Comment on: ${item.postTitle}`);
          } else if (isRedditCommunity(item)) {
            itemType = "community";
            await ctx.log(`Community: ${item.displayName}`);
          }

          console.log(`Reddit ${itemType} ${itemCount}:`, JSON.stringify(item, null, 2));
          await ctx.log(`--- End Item ${itemCount} ---\n`);

          // Update progress for each item scraped
          await ctx.loading.completeOne();
        },
      };

      // Build the input object with proper typing
      const input: RedditScraperInput = {
        ...(processedStartUrls &&
          processedStartUrls.length > 0 && { startUrls: processedStartUrls }),
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

      // Complete any remaining progress items if we scraped fewer than estimated
      const remainingItems = Math.max(0, estimatedItems - itemCount);
      for (let i = 0; i < remainingItems; i++) {
        await ctx.loading.completeOne();
      }

      await ctx.log(`Scraping completed successfully!`);
      await ctx.log(`Run ID: ${results.runId}`);
      await ctx.log(`Status: ${results.status}`);
      await ctx.log(`Total items scraped: ${results.totalItems}`);

      return `Reddit scraping complete! Scraped ${results.totalItems} items. Run ID: ${results.runId}`;
    } catch (error) {
      await ctx.loading.completeOne();
      await ctx.log(`Error during scraping: ${error}`);

      return `Reddit scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});
