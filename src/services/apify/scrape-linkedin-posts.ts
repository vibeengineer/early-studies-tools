const ACTOR_ID = "apimaestro~linkedin-profile-posts";
const API_TOKEN = process.env.APIFY_API_KEY;

type ScrapePostsOptions = {
  resultLimit?: number;
  pageNumber?: number;
};

export async function scrapeLinkedinPosts(profileUrl: string, options: ScrapePostsOptions = {}) {
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${API_TOKEN}`;

  const input = {
    username: profileUrl,
    resultLimit: options.resultLimit || 5,
    pageNumber: options.pageNumber || 1,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apify API Error: ${response.status} ${errorText}`);
  }

  const items = await response.json();
  return items;
}
