import axios from "axios";
import cheerio, { load } from "cheerio";
import { URL } from "url";
import { getLinksFromSitemap } from "./sitemap";
import async from "async";
import { Progress } from "../../lib/entities";
import { scrapSingleUrl } from "./single_url";
import robotsParser from "robots-parser";
import fs from "fs";

export class WebCrawler {
  private initialUrl: string;
  private initialUrls: string[];
  private baseUrl: string;
  private includes: string[];
  private excludes: string[];
  private maxCrawledLinks: number;
  private maxCrawledDepth: number;
  private visited: Set<string> = new Set();
  private crawledUrls: Map<string, string> = new Map();  
  private robotsTxtUrl: string;
  private robots: any;  
  // private logger = fs.createWriteStream('crawl_log.txt', {
  //   flags: 'a' // 'a' means appending (old data will be preserved)
  // });

  constructor({
    initialUrl,
    initialUrls,
    includes,
    excludes,
    maxCrawledLinks = 20000,     
    maxCrawledDepth = 10,
  }: {
    initialUrl: string;
    initialUrls: string[];
    includes?: string[];
    excludes?: string[];
    maxCrawledLinks?: number;        
    maxCrawledDepth?: number;
  }) {
    this.initialUrl = initialUrl;
    this.initialUrls = initialUrls;
    this.baseUrl = new URL(initialUrls[0]).origin;
    this.includes = includes ?? [];
    this.excludes = excludes ?? [];    
    this.robotsTxtUrl = `${this.baseUrl}/robots.txt`;
    this.robots = robotsParser(this.robotsTxtUrl, "");
    // Deprecated, use limit instead
    this.maxCrawledLinks = maxCrawledLinks
    this.maxCrawledDepth = maxCrawledDepth ?? 10;    
  }

  private filterLinks(sitemapLinks: string[], limit: number, maxDepth: number): string[] {
    return sitemapLinks
      .filter((link) => {
        const url = new URL(link);
        const path = url.pathname;
        const depth = url.pathname.split('/').length - 1;

        // Check if the link exceeds the maximum depth allowed
        if (depth > maxDepth) {
          console.log("exceeded depth!")
          return false;
        }

        // Check if the link should be excluded
        if (this.excludes.length > 0 && this.excludes[0] !== "") {
          if (
            this.excludes.some((excludePattern) =>
              new RegExp(excludePattern).test(path)
            )
          ) {
            console.log("filtered out!")
            return false;
          }
        }

        // Check if the link matches the include patterns, if any are specified
        if (this.includes.length > 0 && this.includes[0] !== "") {
          if (!this.includes.some((includePattern) =>
            new RegExp(includePattern).test(path)
          )) {
            return false;
          }
        }

        // Normalize the initial URL and the link to account for www and non-www versions
        const normalizedInitialUrl = new URL(this.initialUrl);
        const normalizedLink = new URL(link);
        const initialHostname = normalizedInitialUrl.hostname.replace(/^www\./, '');
        const linkHostname = normalizedLink.hostname.replace(/^www\./, '');

        // Ensure the protocol and hostname match, and the path starts with the initial URL's path
        if (linkHostname !== initialHostname || !normalizedLink.pathname.startsWith(normalizedInitialUrl.pathname)) {
          return false;
        }

        const isAllowed = this.robots.isAllowed(link, "FireCrawlAgent") ?? true;
        // Check if the link is disallowed by robots.txt
        if (!isAllowed) {
          console.log(`Link disallowed by robots.txt: ${link}`);
          return false;
        }

        return true;
      })
      .slice(0, limit);
  }

  public async start(
    inProgress?: (progress: Progress) => void,
    concurrencyLimit: number = 10,
    limit: number = 10000,
    maxDepth: number = 2
  ): Promise<{ url: string, html: string }[]> {
    // Fetch and parse robots.txt
    try {
      const response = await axios.get(this.robotsTxtUrl);
      this.robots = robotsParser(this.robotsTxtUrl, response.data);
    } catch (error) {
      console.log(`Failed to fetch robots.txt from ${this.robotsTxtUrl}`);

    }

    console.log("running scrape!")    

    const urls = await this.crawlUrls(
      // [this.initialUrl],
      this.initialUrls,
      concurrencyLimit,
      maxDepth,
      inProgress
    );
    
    if (
      urls.length === 0 &&
      this.filterLinks([this.initialUrl], limit, this.maxCrawledDepth).length > 0
    ) {
      return [{ url: this.initialUrl, html: "" }];
    }

    return urls;
    console.log("filtering links!")
    // make sure to run include exclude here again
    const filteredUrls = this.filterLinks(urls.map(urlObj => urlObj.url), limit, this.maxCrawledDepth);
    return filteredUrls.map(url => ({ url, html: urls.find(urlObj => urlObj.url === url)?.html || "" }));
  }

  private async crawlUrls(
    urls: string[],
    concurrencyLimit: number,
    maxDepth,
    inProgress?: (progress: Progress) => void,
  ): Promise<{ url: string, html: string }[]> {
    const queue = async.queue(async (task: string, callback) => {
      if (this.crawledUrls.size >= this.maxCrawledLinks) {
        console.log("hit total url limit")
        if (callback && typeof callback === "function") {
          callback();
        }
        return;
      }
      if (maxDepth == 0) {
        // console.log("hit depth limit")
        if (callback && typeof callback === "function") {
          callback();
        }
        return;
      }
      const delay = (m) => new Promise(resolve => setTimeout(resolve, m));
      await delay(Math.random() * 2000);
      const newUrls = await this.crawl(task,maxDepth);
      // add the initial url if not already added
      // if (this.visited.size === 1) {
      //   let normalizedInitial = this.initialUrl;
      //   if (!normalizedInitial.endsWith("/")) {
      //     normalizedInitial = normalizedInitial + "/";
      //   }
      //   if (!newUrls.some(page => page.url === this.initialUrl)) {
      //     newUrls.push({ url: this.initialUrl, html: "" });
      //   }
      // }


      newUrls.forEach((page) => this.crawledUrls.set(page.url, page.html));
      
      if (inProgress && newUrls.length > 0) {
        inProgress({
          current: this.crawledUrls.size,
          total: this.maxCrawledLinks,
          status: "SCRAPING",
          currentDocumentUrl: newUrls[newUrls.length - 1].url,
        });
      } else if (inProgress) {
        inProgress({
          current: this.crawledUrls.size,
          total: this.maxCrawledLinks,
          status: "SCRAPING",
          currentDocumentUrl: task,
        });
      }
      await this.crawlUrls(newUrls.map((p) => p.url), concurrencyLimit, maxDepth - 1, inProgress);
      if (callback && typeof callback === "function") {
        callback();
      }
    }, concurrencyLimit);

    queue.push(
      urls.filter(
        (url) =>
          !this.visited.has(url) && this.robots.isAllowed(url, "FireCrawlAgent")
      ),
      (err) => {
        if (err) console.error(err);
      }
    );
    await queue.drain();
    return Array.from(this.crawledUrls.entries()).map(([url, html]) => ({ url, html }));
  }

  async crawl(url: string, currentDepth : number): Promise<{url: string, html: string}[]> {
    if (this.visited.has(url) || !this.robots.isAllowed(url, "FireCrawlAgent")){
      return [];
    }
    this.visited.add(url);
    
    // console.log(`Crawled ${this.visited.size} links!`);

    if (!url.startsWith("http")) {
      url = "https://" + url;

    }
    if (url.endsWith("/")) {
      url = url.slice(0, -1);

    }
    
    if (this.isFile(url) || this.isSocialMediaOrEmail(url)) {
      return [];
    }

    try {
      let content : string = "";
      // If it is the first link, fetch with single url
      if (this.visited.size === 1) {
        const page = await scrapSingleUrl(url, {includeHtml: true});
        content = page.html ?? ""
      } else {
        const response = await axios.get(url, {
          headers: {
              'X-Scraped-By': 'EEA-GRANTS-NAV-CRAWLER',          
          }
      });
        if (response.status == 403) {
          console.log(`Could not crawl ${url}`)
        }
        content = response.data ?? "";
      }
      const $ = load(content);
      let links: {url: string, html: string}[] = [];

      // Add the initial URL to the list of links
      if(this.visited.size === 1)
      {
        links.push({url, html: content});
      }

      console.log(`Crawling: ${url}, Layers remaining: ${currentDepth}`);
      // this.logger.write(`\nCrawling: ${url}, Layers remaining: ${currentDepth}`)
      
      const parentURL = url;
      $("a").each((_, element) => {
        // console.log("Found element:", element);
        const href = $(element).attr("href");
        if (href) {
          let fullUrl = href;
          if (!href.startsWith("http")) {
            fullUrl = new URL(href, this.baseUrl).toString();
          }
          const url = new URL(fullUrl);
          const path = url.pathname;
          
          if (
            this.isInternalLink(fullUrl) &&
            this.matchesPattern(fullUrl) &&
            this.noSections(fullUrl) &&
            this.matchesIncludes(path) &&
            !this.matchesExcludes(fullUrl) &&
            !this.matchesExcludes(path) &&
            // we want the initial urls to only be crawled from the first level of depth
            // so we don't want them being crawled by discovery
            !this.initialUrls.includes(fullUrl) &&
            this.robots.isAllowed(fullUrl, "FireCrawlAgent")
          ) {                      
            // this.logger.write(`\nFound: ${fullUrl} on ${parentURL}`)
            links.push({url: fullUrl, html: content});
          } else {
            // this.logger.write(`\nSkipped: ${fullUrl} on ${parentURL}`)
            // console.log(`Skipping link: ${fullUrl}`);
          }
        }
      });
      console.log(`Found ${links.length} links on page ${url}`);
      // if(this.visited.size === 1){
      //   return links;
      // }
      // Create a new list to return to avoid modifying the visited list
      return links.filter((link) => !this.visited.has(link.url));
    } catch (error) {
      console.log(error);
      return [];
    }
  }

  private matchesIncludes(url: string): boolean {
    if (this.includes.length === 0 || this.includes[0] == "") return true;
    return this.includes.some((pattern) => new RegExp(pattern).test(url));
  }

  private matchesExcludes(url: string): boolean {    
    if (this.excludes.length === 0 || this.excludes[0] == "") return false;
    const excluded = this.excludes.some((pattern) => new RegExp(pattern).test(url));    
    return excluded;
  }

  private noSections(link: string): boolean {
    return !link.includes("#");
  }

  private isInternalLink(link: string): boolean {
    const urlObj = new URL(link, this.baseUrl);
    const domainWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, "");
    return urlObj.hostname === domainWithoutProtocol;
  }

  private matchesPattern(link: string): boolean {
    return true; // Placeholder for future pattern matching implementation
  }

  private isFile(url: string): boolean {
    const fileExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".css",
      ".js",
      ".ico",
      ".svg",
      // ".pdf", 
      ".zip",
      ".exe",
      ".dmg",
      ".mp4",
      ".mp3",
      ".pptx",
      // ".docx",
      ".xlsx",
      ".xml",
      ".avi",
      ".flv",
      ".woff",
      ".ttf",
      ".woff2",
      ".webp"
    ];
    return fileExtensions.some((ext) => url.endsWith(ext));
  }

  private isSocialMediaOrEmail(url: string): boolean {
    const socialMediaOrEmail = [
      "facebook.com",
      "twitter.com",
      "linkedin.com",
      "instagram.com",
      "pinterest.com",
      "mailto:",
    ];
    return socialMediaOrEmail.some((ext) => url.includes(ext));
  }

  // 
  private async tryFetchSitemapLinks(url: string): Promise<string[]> {
    const normalizeUrl = (url: string) => {
      url = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
      if (url.endsWith("/")) {
        url = url.slice(0, -1);
      }
      return url;
    };

    const sitemapUrl = url.endsWith("/sitemap.xml")
      ? url
      : `${url}/sitemap.xml`;

    let sitemapLinks: string[] = [];

    try {
      const response = await axios.get(sitemapUrl);
      if (response.status === 200) {
        sitemapLinks = await getLinksFromSitemap(sitemapUrl);
      }
    } catch (error) {
      // Error handling for failed sitemap fetch
      // console.error(`Failed to fetch sitemap from ${sitemapUrl}: ${error}`);
    }

    if (sitemapLinks.length === 0) {
      // If the first one doesn't work, try the base URL
      const baseUrlSitemap = `${this.baseUrl}/sitemap.xml`;
      try {
        const response = await axios.get(baseUrlSitemap);
        if (response.status === 200) {
          sitemapLinks = await getLinksFromSitemap(baseUrlSitemap);
        }
      } catch (error) {
        // Error handling for failed base URL sitemap fetch
        // console.error(`Failed to fetch sitemap from ${baseUrlSitemap}: ${error}`);
      }
    }

    // Normalize and check if the URL is present in any of the sitemaps
    const normalizedUrl = normalizeUrl(url);

    const normalizedSitemapLinks = sitemapLinks.map(link => normalizeUrl(link));

    // has to be greater than 0 to avoid adding the initial URL to the sitemap links, and preventing crawler to crawl
    if (!normalizedSitemapLinks.includes(normalizedUrl) && sitemapLinks.length > 0) {
      // do not push the normalized url
      sitemapLinks.push(url);
    }

    return sitemapLinks;
  }
}
