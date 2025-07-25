// Define constants for the API call
const ACTOR_ID = 'dev_fusion~Linkedin-Profile-Scraper';
const API_TOKEN = process.env.APIFY_API_KEY;

export async function scrapeLinkedinProfile(profileUrl: string) {
  // This is the endpoint for a synchronous run that returns dataset items directly
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${API_TOKEN}`;

  const input = {
    profileUrls: [profileUrl],
  };

  // Use native fetch to make the API call
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  // Check if the request was successful
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apify API Error: ${response.status} ${errorText}`);
  }

  // If successful, the response body is the JSON array of results
  const items = await response.json();

  return items;
}