import {
  HtmlParser,
  ParseTreeResult,
  RecursiveVisitor,
  Element as Element_2,
  visitAll,
} from "@angular/compiler";
import { readFile } from "node:fs/promises";
import { glob } from "glob";
import * as path from "path";
import * as fs from "fs";

export interface RouterLinkInstance {
  route: string;
  original: string;
  values: string[];
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

export interface RouterLinkConstants {
  link: string;
  constant: string;
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
          const splitted = attr.value.split(",");
          if (splitted.length > 0 && !splitted[0].includes(".routerLink")) {
            const values = [];
            let route = "";
            splitted.forEach((x, i) => {
              const shaved = x.replace(/[\[\]\s']/g, "").replace("]", "");
              if (i === 0) {
                route = shaved;
              } else {
                values.push(shaved);
              }
            });
            this.routerLinks.push({
              original: attr.value,
              route: route,
              values: values,
              start: attr.valueSpan.start.offset,
              end: attr.valueSpan.end.offset,
            });
          }
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

  writeRouterLinksToJSON(routerLinksOrOutlets);
  writeOutlets(routerLinksOrOutlets);
  writeRouterLinkConstants(routerLinksOrOutlets);

  console.log("Completed");
};

function writeOutlets(routerLinksOrOutlets: RouterLinkInstancesByFile[]) {
  const outlets = routerLinksOrOutlets.filter(
    (x) => x.routerOutlets.length > 0
  );
  const filesWithOutlets : string [] = [];
  for (const outlet of outlets) {
    console.log(outlet);
    filesWithOutlets.push(outlet.file);
  }
  try {
    const filePath = "router-outlets.txt";
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.log(err);
        }
      });
    }
    filesWithOutlets.forEach((c) => {
      fs.appendFileSync(
        filePath,
        `${c}\r\n`
      );
    });
  } catch (error) {
    console.error("Error writing files with outlets to file:", error);
  }
}

function writeRouterLinkConstants(routerLinksOrOutlets: RouterLinkInstancesByFile[]) {
  const allRouterLinks = [];
  const routerLinksOnly = routerLinksOrOutlets.filter(
    (x) => x.routerLinks.length > 0
  );
  routerLinksOnly.forEach((x) => {
    x.routerLinks.forEach((y) => allRouterLinks.push(y.route));
  });

  console.log(allRouterLinks);
  const uniqueLinks: string[] = allRouterLinks.filter(
    (x, i, a) => a.indexOf(x) == i
  );
  console.log(uniqueLinks);

  const constants: RouterLinkConstants[] = [];
  uniqueLinks.forEach((l) => {
    constants.push({
      link: l,
      constant: l === "/" ? "ROOT" : l.toUpperCase().replace(/[/-]/g, "_").replace(/[_]/, ""),
    });
  });
  console.log(constants);
  try {
    const filePath = "route-constants.ts";
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.log(err);
        }
        console.log("deleted");
      });
    }
    fs.appendFileSync(filePath, "export abstract class ROUTE {\r\n");
    const sortedConstants = constants.sort((a, b) => b.constant.localeCompare(a.constant));
    sortedConstants.forEach((c) => {
      fs.appendFileSync(
        filePath,
        `  static readonly ${c.constant} = "${c.link}";\r\n`
      );
    });
    fs.appendFileSync(filePath, "};\r\n");
  } catch (error) {
    console.error("Error writing constants to file:", error);
  }
}

function writeRouterLinksToJSON(routerLinksOrOutlets: RouterLinkInstancesByFile[]) {
  const jsonRouterLinks = JSON.stringify(routerLinksOrOutlets, null, 2);
  try {
    const filePath = "router-links.json";
    console.log("Saving to", filePath);
    fs.writeFileSync(filePath, jsonRouterLinks);
    console.log("JSON RouterLinks saved to file successfully.");
  } catch (error) {
    console.error("Error writing JSON RouterLinks to file:", error);
  }
}

parseRouterLinks("C:/projects/here/here-platform-client/src/app/");


