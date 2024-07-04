import {
  HtmlParser,
  ParseTreeResult,
  ParsedTemplate,
  RecursiveVisitor,
  parseTemplate,
  Text as Text_2,
  Element as Element_2,
  Block,
  visitAll,
} from "@angular/compiler";
import { readFile } from "node:fs/promises";
import { glob } from "glob";
import * as path from "path";
import * as fs from "fs";

export interface RouterLinkInstance {
  parameters: string;
  start: number;
  end: number;
}

export interface RouterOutletInstance {
  start: number;
  end: number;
}

export interface RouterLinkInstancesByFile {
  file: string;
  routerLinks: RouterLinkInstance[];
  routerOutlets: RouterOutletInstance[];
}

class RouterLinkCollector extends RecursiveVisitor {
  routerLinks: RouterLinkInstance[] = [];
  routerOutlets: RouterOutletInstance[] = [];
  constructor() {
    super();
  }
  override visitElement(element: Element_2, context: any) {
    if (element.attrs.length > 0) {
      for (const attr of element.attrs) {
        if (attr.name === "[routerLink]" || attr.name === "routerLink") {
          this.routerLinks.push({
            parameters: attr.value,
            start: attr.valueSpan.start.offset,
            end: attr.valueSpan.end.offset,
          });
        }
      }
    }
    if (element.name === "router-outlet") {
      this.routerOutlets.push({
        start: element.sourceSpan.start.offset,
        end: element.sourceSpan.end.offset,
      });
    }
    return super.visitElement(element, context);
  }
}

const parseRouterLinks = async (filePath: string) => {
  console.log("Globbing html files...");

  const htmlFiles = await glob(filePath + "**/*.html", {
    ignore: "node_modules/**",
  });

  console.log("html files found ", htmlFiles.length);

  const routerLinksOrOutlets: RouterLinkInstancesByFile[] = [];

  console.log("Parsing html files...");
  let filesWithRouterLinks = 0;
  let filesWithRouterOutlets = 0;
  let totalRouterLinks = 0;
  let totalRouterOutlets = 0;
  for (const htmlFile of htmlFiles) {
    const template = await readFile(htmlFile, { encoding: "utf8" });
    const parsedTemplate: ParseTreeResult = new HtmlParser().parse(
      template,
      htmlFile,
      { preserveLineEndings: true, tokenizeBlocks: false }
    );
    if (parsedTemplate.errors.length > 0) {
      console.log("html file has parse errors", htmlFile);

      parsedTemplate.errors.forEach((e) => {
        console.log(e);
      });
      break;
    }
    const visitor = new RouterLinkCollector();
    visitAll(visitor, parsedTemplate.rootNodes);
    if (visitor.routerLinks.length > 0 || visitor.routerOutlets.length > 0) {
      routerLinksOrOutlets.push({
        file: path.basename(htmlFile),
        routerLinks: visitor.routerLinks,
        routerOutlets: visitor.routerOutlets,
      });
      if (visitor.routerLinks.length > 0) {
        filesWithRouterLinks++;
        totalRouterLinks += visitor.routerLinks.length;
      }
      if (visitor.routerOutlets.length > 0) {
        filesWithRouterOutlets++;
        totalRouterOutlets += visitor.routerOutlets.length;
      }
    }
  }
  console.log("Parsing html files done");
  console.log("Files with router links", filesWithRouterLinks);
  console.log("Files with router outlets", totalRouterOutlets);
  console.log("RouterLinks", totalRouterLinks);
  console.log("RouterOutlets", totalRouterOutlets);

  const outlets = routerLinksOrOutlets.filter(
    (x) => x.routerOutlets.length > 0
  );
  console.log("RouterOutlets are in...");
  for (const outlet of outlets) {
    console.log(outlet);
  }

  const jsonRouterLinks = JSON.stringify(routerLinksOrOutlets, null, 2);
  try {
    const filePath = "router-links.json";
    console.log("Saving to", filePath);
    fs.writeFileSync(filePath, jsonRouterLinks);
    console.log("JSON RouterLinks saved to file successfully.");
  } catch (error) {
    console.error("Error writing JSON RouterLinks to file:", error);
  }

  console.log("Completed");
};

parseRouterLinks("C:/projects/here/here-platform-client/src/app/");
