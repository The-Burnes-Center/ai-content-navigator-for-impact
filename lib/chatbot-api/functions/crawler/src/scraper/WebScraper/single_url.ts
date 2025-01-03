import * as cheerio from "cheerio";
import axios from "axios";
import { extractMetadata } from "./utils/metadata";
import dotenv from "dotenv";
import { Document, PageOptions } from "../../lib/entities";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { excludeNonMainTags } from "./utils/excludeTags";
import { urlSpecificParams } from "./utils/custom/website_params";
import { fetchAndProcessPdf } from "./utils/pdfProcessor";

dotenv.config();

const baseScrapers = [
  "fire-engine",  
  "playwright",  
  "fetch",
] as const;


export async function generateRequestParams(
  url: string,
  wait_browser: string = "domcontentloaded",
  timeout: number = 15000
): Promise<any> {
  const defaultParams = {
    url: url,
    params: { timeout: timeout, wait_browser: wait_browser },
    // headers: { "ScrapingService-Request": "TRUE" },
  };

  try {
    const urlKey = new URL(url).hostname.replace(/^www\./, "");
    if (urlSpecificParams.hasOwnProperty(urlKey)) {
      return { ...defaultParams, ...urlSpecificParams[urlKey] };
    } else {
      return defaultParams;
    }
  } catch (error) {
    console.error(`Error generating URL key: ${error}`);
    return defaultParams;
  }
}
export async function scrapWithFireEngine(
  url: string,
  options?: any
): Promise<string> {
  try {
    const reqParams = await generateRequestParams(url);
    const wait_playwright = reqParams["params"]?.wait ?? 0;

    const response = await fetch(process.env.FIRE_ENGINE_BETA_URL+ "/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: url, wait: wait_playwright }),
    });

    if (!response.ok) {
      console.error(
        `[Fire-Engine] Error fetching url: ${url} with status: ${response.status}`
      );
      return "";
    }

    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('application/pdf')) {
      return fetchAndProcessPdf(url);
    } else {
      const data = await response.json();
      const html = data.content;
      return html ?? "";
    }
  } catch (error) {
    console.error(`[Fire-Engine][c] Error fetching url: ${url} -> ${error}`);
    return "";
  }
}

export async function scrapWithFetch(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
          'X-Scraped-By': 'EEA-GRANTS-NAV-CRAWLER',          
      }
  });
    if (!(response.status == 200)) {
      console.error(
        `[Fetch] Error fetching url: ${url} with status: ${response.status}`
      );
      return "";
    }

    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('application/pdf')) {
      return fetchAndProcessPdf(url);
    } else {
      const text = await response.data;
      return text;
    }
  } catch (error) {
    console.error(`[Fetch][c] Error fetching url: ${url} -> ${error}`);
    return "";
  }
}

/**
 * Get the order of scrapers to be used for scraping a URL
 * If the user doesn't have envs set for a specific scraper, it will be removed from the order.
 * @param defaultScraper The default scraper to use if the URL does not have a specific scraper order defined
 * @returns The order of scrapers to be used for scraping a URL
 */
function getScrapingFallbackOrder(defaultScraper?: string) {
  const availableScrapers = baseScrapers.filter(scraper => {
    switch (scraper) {      
      case "fire-engine":
        return !!process.env.FIRE_ENGINE_BETA_URL;
      case "playwright":
        return !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
      default:
        return true;
    }
  });

  const defaultOrder = ["fire-engine", "fetch"];
  const filteredDefaultOrder = defaultOrder.filter((scraper: typeof baseScrapers[number]) => availableScrapers.includes(scraper));
  const uniqueScrapers = new Set(defaultScraper ? [defaultScraper, ...filteredDefaultOrder, ...availableScrapers] : [...filteredDefaultOrder, ...availableScrapers]);
  const scrapersInOrder = Array.from(uniqueScrapers);
  return scrapersInOrder as typeof baseScrapers[number][];
}

export async function scrapSingleUrl(
  urlToScrap: string,
  pageOptions: PageOptions = { onlyMainContent: true, includeHtml: false },
  existingHtml: string = ""
): Promise<Document> {
  urlToScrap = urlToScrap.trim();

  const removeUnwantedElements = (html: string, pageOptions: PageOptions) => {
    const soup = cheerio.load(html);
    soup("script, style, iframe, noscript, meta, head").remove();
    if (pageOptions.onlyMainContent) {
      // remove any other tags that are not in the main content
      excludeNonMainTags.forEach((tag) => {
        soup(tag).remove();
      });
    }
    return soup.html();
  };

  const attemptScraping = async (
    url: string,
    method: typeof baseScrapers[number]
  ) => {
    let text = "";
    switch (method) {
      case "fire-engine":
        if (process.env.FIRE_ENGINE_BETA_URL) {
          text = await scrapWithFireEngine(url);
        }
        break;                  
      case "fetch":
        text = await scrapWithFetch(url);
        break;
    }

    //* TODO: add an optional to return markdown or structured/extracted content
    let cleanedHtml = removeUnwantedElements(text, pageOptions);

    return [await parseMarkdown(cleanedHtml), text];
  };
  try {
    let [text, html] = ["", ""];
    let urlKey = urlToScrap;
    try {
      urlKey = new URL(urlToScrap).hostname.replace(/^www\./, "");
    } catch (error) {
      console.error(`Invalid URL key, trying: ${urlToScrap}`);
    }
    const defaultScraper = urlSpecificParams[urlKey]?.defaultScraper ?? "";
    const scrapersInOrder = getScrapingFallbackOrder(defaultScraper) 

    console.log("checking scrapers...")
    
    for (const scraper of scrapersInOrder) {
      // If exists text coming from crawler, use it
      console.log(`checking existing HTML`);
      if (existingHtml && existingHtml.trim().length >= 100) {
        let cleanedHtml = removeUnwantedElements(existingHtml, pageOptions);
        text = await parseMarkdown(cleanedHtml);
        html = existingHtml;
        break;
      }
      console.log(`using ${scraper}`);
      [text, html] = await attemptScraping(urlToScrap, scraper);
      console.log("got text from scraper");
      if (text && text.trim().length >= 100) break;
      const nextScraperIndex = scrapersInOrder.indexOf(scraper) + 1;
      if (nextScraperIndex < scrapersInOrder.length) {
        console.info(`Falling back to ${scrapersInOrder[nextScraperIndex]}`);
      }
    }

    if (!text) {
      throw new Error(`All scraping methods failed for URL: ${urlToScrap}`);
    }
    console.log("loading HTML")
    const soup = cheerio.load(html);
    const metadata = extractMetadata(soup, urlToScrap);
    console.log("extracted data")
    const document: Document = {
      content: text,
      markdown: text,
      html: pageOptions.includeHtml ? html : undefined,
      metadata: { ...metadata, sourceURL: urlToScrap },
    };

    return document;
  } catch (error) {
    console.error(`Error: ${error} - Failed to fetch URL: ${urlToScrap}`);
    return {
      content: "",
      markdown: "",
      html: "",
      metadata: { sourceURL: urlToScrap },
    } as Document;
  }
}
