import { WebScraperDataProvider } from "./scraper/WebScraper"
// import fs from "fs";
import { Document } from "./lib/entities";
import * as path from "path";
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

console.log("started!")
console.time("crawl time");
let start = Date.now();
const scraper = new WebScraperDataProvider();
scraper.setOptions({  
  urls: [
    "https://www.mass.gov/orgs/executive-office-of-energy-and-environmental-affairs",
    "https://www.mass.gov/orgs/eea-office-of-grants-and-technical-assistance",
    "https://www.mass.gov/orgs/massachusetts-department-of-environmental-protection",
    "https://www.mass.gov/orgs/massachusetts-department-of-agricultural-resources"     
  ],
  mode: "crawl",
  concurrentRequests: 4,
  crawlerOptions: {
    excludes: ['^\\s*$', ".*doc.*", ".*guide.*", '.*employment.*',
      '.*topics.*', ".*mass.gov$", ".*mass.gov\\/$", ".*mass.gov\\/#$",
      ".*massachusetts-state-organizations-a-to-z.*", ".*list.*",
      ".*help-us-test.*", ".*user-panel.*", ".*massgov-site-policies.*",
      ".*privacypolicy.*", ".*hunting.*", ".*event.*", ".*executive-orders.*", ".*news.*", ".*fishing.*", ".*dcr-updates.*"],
    maxCrawledLinks: 2000,
    maxDepth: 3,
    // mode: "fast"
    
  }
})

// default - fast, depth 3, max 2000
// restricted mode - fast, depth 2, max 1000
// guides and topics lead to grants but also excessive crawl
let untitledCounter = 0;
function generateTitle(document: Document): string {
  if (document.metadata.sourceURL) {
    try {
      const url = new URL(document.metadata.sourceURL);
      const pathname = url.pathname;
      const segments = pathname.split('/').filter(segment => segment !== '');
      const lastSegment = segments[segments.length - 1];
      return lastSegment.replace(/[-_]/g, ' ');
    } catch (e) {
      console.log(e);
    }
  } else if (document.url) {
    try {
      const url = new URL(document.url);
      const pathname = url.pathname;
      const segments = pathname.split('/').filter(segment => segment !== '');
      const lastSegment = segments[segments.length - 1];
      return lastSegment.replace(/[-_]/g, ' ');
    } catch (error) {
      console.log(error);
    }
  } else {
    untitledCounter++;
    return `Untitled ${untitledCounter}`;
  }
}

async function writeDocumentsToMarkdownFiles(documents: Document[], folderPath: string) {
  // Create the folder if it doesn't exist
  // if (!fs.existsSync(folderPath)) {
  //   fs.mkdirSync(folderPath, { recursive: true });
  // }

  documents.forEach(async (document, index) => {
    const title = generateTitle(document);
    const fileName = `${title}.md`;
    // const filePath = path.join(folderPath, fileName);

    // Create the Markdown content
    const markdownContent = `# ${document.metadata.sourceURL || 'Unknown Source'}

    ${document.markdown || document.content}

    Created At: ${document.createdAt}
    Updated At: ${document.updatedAt}
    Type: ${document.type}
    Provider: ${document.provider || 'Unknown'}
    `;

    // Write the Markdown content to the file
    // fs.writeFileSync(filePath, markdownContent, 'utf-8');
    const s3 = new S3Client({ region: 'us-east-1' });
    const command = new PutObjectCommand({ Bucket: process.env.BUCKET, Key: fileName, Body: markdownContent });
    await s3.send(command);
  });

  console.log(`Successfully wrote ${documents.length} documents as Markdown files to S3`);
}

export const handler = async (event) => {
const documents = scraper.getDocuments(false);

documents.then(async (value) => {
  console.log(value.length)
  // value.forEach((element, index) => {
  //   fs.writeFileSync(`saved-docs/${index}`, element.markdown ? element.markdown : element.html)
  // });
  await writeDocumentsToMarkdownFiles(value, "./grants-crawl")
  let end = Date.now();
  console.log(`Full time: ${end - start}`)  
  console.timeEnd("crawl time");
});

}
