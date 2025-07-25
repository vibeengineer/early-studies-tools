/**
 * Output type produced by the Reddit-scraper actor.
 *
 * Two record shapes are possible and they are distinguished by the
 * `dataType` discriminator:
 *   •  "comment" – a single Reddit comment (plus the parent post data)
 *   •  "post"    – a top-level Reddit submission
 *
 * Any extra properties returned by the scraper are preserved (`passthrough`),
 * so a version update that introduces new keys will not break validation.
 */

import { z } from 'zod';

/* ────────────────────────────────────────────────────────────────── */
/* Comment rows ─ dataType === "comment"                             */
/* ────────────────────────────────────────────────────────────────── */
const commentSchema = z
  .object({
    dataType: z.literal('comment'),

    /* id keys */
    id: z.string(),
    postId: z.string(),          // e.g. "t3_72bkr5"
    parsedPostId: z.string(),    // e.g. "72bkr5"
    parentId: z.string(),
    parsedParentId: z.string(),

    /* URL & meta */
    url: z.string().url(),
    postTitle: z.string(),

    /* author */
    authorId: z.string(),
    parsedAuthorId: z.string(),
    authorName: z.string(),

    /* subreddit */
    subredditId: z.string(),
    parsedSubredditId: z.string(),
    subredditName: z.string(),

    /* metrics */
    postCommentsCount: z.number(),
    commentUpVotes: z.number(),

    /* timestamps */
    commentCreatedAt: z.string().datetime(),
    crawledAt: z.string().datetime(),

    /* body */
    body: z.string(),
    bodyHtml: z.string().nullable().optional(),
  })
  .passthrough();

/* ────────────────────────────────────────────────────────────────── */
/* Post rows ─ dataType === "post"                                   */
/* ────────────────────────────────────────────────────────────────── */
const postSchema = z
  .object({
    dataType: z.literal('post'),

    /* id keys */
    id: z.string(),
    parsedId: z.string(),

    /* content */
    title: z.string(),
    body: z.string().optional().default(''),
    bodyHtml: z.string().nullable().optional(),

    /* URLs */
    postUrl: z.string().url(),
    contentUrl: z.string().url().optional(),
    flair: z.string().nullable().optional(),

    /* author */
    authorId: z.string(),
    parsedAuthorId: z.string(),
    authorName: z.string(),

    /* community */
    communityId: z.string(),
    parsedCommunityId: z.string(),
    communityName: z.string(),
    parsedCommunityName: z.string(),

    /* metrics */
    postType: z.enum(['text', 'link', 'image', 'video']).optional(),
    upVotes: z.number(),
    commentsCount: z.number(),

    /* timestamps */
    createdAt: z.string().datetime(),
    crawledAt: z.string().datetime(),
  })
  .passthrough();

/* ────────────────────────────────────────────────────────────────── */
/* Community rows ─ dataType === "community" (subreddit info)        */
/* ────────────────────────────────────────────────────────────────── */
const communitySchema = z
  .object({
    dataType: z.literal('community'),

    /* id keys */
    id: z.string(),
    parsedId: z.string(),

    /* basic info */
    name: z.string(),
    displayName: z.string(),
    title: z.string(),
    description: z.string().optional(),

    /* URLs */
    url: z.string().url(),

    /* metrics */
    subscribers: z.number(),
    activeUsers: z.number().optional(),

    /* meta */
    isNSFW: z.boolean(),
    communityType: z.enum(['public', 'private', 'restricted']).optional(),

    /* timestamps */
    createdAt: z.string().datetime().optional(),
    crawledAt: z.string().datetime(),
  })
  .passthrough();

/* ────────────────────────────────────────────────────────────────── */
/* Discriminated union                                                */
/* ────────────────────────────────────────────────────────────────── */
export const outputItemSchema = z.discriminatedUnion('dataType', [
  commentSchema,
  postSchema,
  communitySchema,
]);

/* An entire dataset file is just an array of the above */
export const outputArraySchema = z.array(outputItemSchema);

/* Types for TypeScript consumers */
export type RedditCommentRow = z.infer<typeof commentSchema>;
export type RedditPostRow = z.infer<typeof postSchema>;
export type RedditCommunityRow = z.infer<typeof communitySchema>;
export type RedditOutputItem = z.infer<typeof outputItemSchema>;

/* Helper type guards for discriminating between data types */
export function isRedditComment(item: RedditOutputItem): item is RedditCommentRow {
  return item.dataType === 'comment';
}

export function isRedditPost(item: RedditOutputItem): item is RedditPostRow {
  return item.dataType === 'post';
}

export function isRedditCommunity(item: RedditOutputItem): item is RedditCommunityRow {
  return item.dataType === 'community';
}

/* Validation functions */
export function validateRedditOutput(data: unknown): RedditOutputItem[] {
  return outputArraySchema.parse(data);
}

export function validateRedditItem(data: unknown): RedditOutputItem {
  return outputItemSchema.parse(data);
}