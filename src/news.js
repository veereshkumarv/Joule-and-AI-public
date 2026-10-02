const BBC_WORLD_NEWS_RSS_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";

function decodeXmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTagText(itemXml, tagName) {
  const match = itemXml.match(new RegExp(`<${tagName}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tagName}>`));
  return match ? decodeXmlEntities(match[1].trim()) : "";
}

function parseItems(rssXml) {
  const itemMatches = rssXml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  return itemMatches.map((itemXml) => ({
    title: extractTagText(itemXml, "title"),
    link: extractTagText(itemXml, "link"),
    publishedAt: extractTagText(itemXml, "pubDate"),
  }));
}

export async function getLatestWorldNews(limit = 5) {
  const response = await fetch(BBC_WORLD_NEWS_RSS_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch world news: ${response.status} ${response.statusText}`);
  }

  const rssXml = await response.text();
  const items = parseItems(rssXml);

  if (items.length === 0) {
    throw new Error("No news items found in the BBC World News feed.");
  }

  return items.slice(0, limit);
}
