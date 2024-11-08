
// import * as TurndownService from "turndown";
// import * as turndownPluginGfm from 'joplin-turndown-plugin-gfm';
import TurndownService from 'turndown';
import { gfm } from 'joplin-turndown-plugin-gfm';

export function parseMarkdown(html: string) {
  // var TurndownService  = require("turndown");
  // var turndownPluginGfm = require('joplin-turndown-plugin-gfm')

  console.log(typeof TurndownService)
  const turndownService = new TurndownService();
  turndownService.addRule("inlineLink", {
    filter: function (node: HTMLElement, options: any) {
      return (
        options.linkStyle === "inlined" &&
        node.nodeName === "A" &&
        node.getAttribute("href") !== null
      );    
    },
    replacement: function (content: string, node: HTMLElement) {
      const href = node.getAttribute("href")!.trim();
      const title = node.title ? ` "${node.title}"` : "";
      return `[${content.trim()}](${href}${title})\n`;
    },
  });

  // var gfm = turndownPluginGfm.gfm;
  turndownService.use(gfm);
  let markdownContent = turndownService.turndown(html);

  // multiple line links
  let insideLinkContent = false;
  let newMarkdownContent = "";
  let linkOpenCount = 0;
  for (let i = 0; i < markdownContent.length; i++) {
    const char = markdownContent[i];

    if (char == "[") {
      linkOpenCount++;
    } else if (char == "]") {
      linkOpenCount = Math.max(0, linkOpenCount - 1);
    }
    insideLinkContent = linkOpenCount > 0;

    if (insideLinkContent && char == "\n") {
      newMarkdownContent += "\\" + "\n";
    } else {
      newMarkdownContent += char;
    }
  }
  markdownContent = newMarkdownContent;

  // Remove [Skip to Content](#page) and [Skip to content](#skip)
  markdownContent = markdownContent.replace(
    /\[Skip to Content\]\(#[^\)]*\)/gi,
    ""
  );

  return markdownContent;
}
