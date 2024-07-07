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

import {
  Project,
  ScriptTarget,
  Node,
  CallExpression,
  ArrayLiteralExpression,
} from "ts-morph";

export interface RouterLink {
  route: string;
  original: string;
  values: string[];
  start: number;
  end: number;
}

export interface RouterOutlet {
  start: number;
  end: number;
}

export interface RouterLinkByFile {
  file: string;
  routerLinks: RouterLink[];
  routerOutlets: RouterOutlet[];
}

export interface RouterLinks {
  routerLinks: RouterLinkByFile[];
  uniquePaths: string[];
}

export interface RouterLinkConstants {
  link: string;
  constant: string;
}

export interface RouterCall {
  call: string;
  path: string;
  arguments?: string[];
  start: number;
  end: number;
  lineStart: number;
  lineEnd: number;
  relative: boolean;
}

export interface RouterCallsByFile {
  file: string;
  routerCalls: RouterCall[];
}

export interface RouterCalls {
  routerCalls: RouterCallsByFile[];
  uniquePaths: string[];
}

class RouterLinkCollector extends RecursiveVisitor {
  routerLinks: RouterLink[] = [];
  routerOutlets: RouterOutlet[] = [];
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

const extractRouterLinksFromHTMLFiles = async (filePath: string): Promise<RouterLinks> =>   {
  const routerLinks: RouterLinks = { routerLinks: [], uniquePaths: []};
  const htmlFiles = await glob(filePath + "**/*.html", { ignore: "node_modules/**"});
  const routerLinksOrOutlets: RouterLinkByFile[] = [];
  for (const htmlFile of htmlFiles) {
    const template = await readFile(htmlFile, { encoding: "utf8" });
    const parsedTemplate: ParseTreeResult = new HtmlParser().parse(
      template,
      htmlFile,
      { preserveLineEndings: true, tokenizeBlocks: false }
    );
    if (parsedTemplate.errors.length > 0) {
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
    }
  }
  routerLinks.routerLinks = routerLinksOrOutlets;
  const allRouterLinks = [];
  const routerLinksOnly = routerLinksOrOutlets.filter(
    (x) => x.routerLinks.length > 0
  );
  routerLinksOnly.forEach((x) => {
    x.routerLinks.forEach((y) => allRouterLinks.push(y.route));
  });
  const uniqueLinks: string[] = allRouterLinks.filter(
    (x, i, a) => a.indexOf(x) == i
  );
  routerLinks.uniquePaths = uniqueLinks;

  writeToJSONFile("router-links.json", routerLinks);
  writeOutlets(routerLinksOrOutlets);
  return routerLinks;
};

function writeOutlets(routerLinksOrOutlets: RouterLinkByFile[]) {
  const outlets = routerLinksOrOutlets.filter(
    (x) => x.routerOutlets.length > 0
  );
  const filesWithOutlets: string[] = [];
  for (const outlet of outlets) {
    filesWithOutlets.push(outlet.file);
  }
  writeToJSONFile("router-outlets.json", filesWithOutlets);
}

function writeRouterLinkConstants( uniqueLinks: string[]) {
  const constants: RouterLinkConstants[] = [];
  uniqueLinks.forEach((l) => {
    if (l != "") {
      constants.push({
        link: l,
        constant:
          l === "/"
            ? "ROOT"
            : l.toUpperCase().replace(/[/-]/g, "_").replace(/[_]/, ""),
      });
    }
  });
  try {
    const filePath = "route-constants.ts";
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.log(err);
        }
      });
    }
    fs.appendFileSync(filePath, "export abstract class ROUTE {\r\n");
    const sortedConstants = constants.sort((a, b) =>
      b.constant.localeCompare(a.constant)
    );
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

function writeToJSONFile( file: string,
  json: any
) {
  const jsonRouterLinks = JSON.stringify(json, null, 2);
  try {
    fs.writeFileSync(file, jsonRouterLinks);
  } catch (error) {
    console.error("Error writing JSON  file:", error);
  }
}

const extractRouterNavigateCallsFromTypeScriptFile = (filePath: string, callsByFile: RouterCallsByFile[]) => {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      target: ScriptTarget.ESNext,
    },
  });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const callsForThisFile: RouterCallsByFile = { file: filePath, routerCalls: []};
  sourceFile.getClasses().forEach((c) => {
    c.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const code = node.getText();
        if (code.includes(".navigate")) {
          let routerCall: RouterCall = {
            call: node.getText(),
            path: "",
            start: node.getStart(),
            end: node.getEnd(),
            lineStart: node.getStartLineNumber(),
            lineEnd: node.getEndLineNumber(),
            arguments: [],
            relative: true
          };
          const callee = node as CallExpression;
          const args = callee.getArguments();
          args.forEach((a) => {
            if (Node.isArrayLiteralExpression(a)) {
              const elements = (a as ArrayLiteralExpression).getElements();
              elements.forEach((e, i) => {
                if (i === 0) {
                  routerCall.path = e.getText().replace(/[\\"']/g, '');
                  routerCall.relative = !routerCall.path.startsWith('/');
                } else {
                  routerCall.arguments.push(e.getText());
                }
              });
            }
            if (Node.isIdentifier(a)) {
              routerCall.arguments.push(a.getText());
            }
          });
          callsForThisFile.routerCalls.push(routerCall);
        }
      }
    });
  });
  if (callsForThisFile.routerCalls.length > 0) {
    callsByFile.push(callsForThisFile);
  }
};

const extractRouterNavigateCallsFromTypeScriptFiles = async (filePath: string): Promise<RouterCalls> => {
  const tsFiles = await glob(filePath + "**/*.ts", { ignore: "node_modules/**"});
  const routerCallsByFile: RouterCallsByFile[] = [];
  for (const tsFile of tsFiles) {
    extractRouterNavigateCallsFromTypeScriptFile( tsFile, routerCallsByFile);
  }
  const allPaths = [];
  routerCallsByFile.forEach((x) => {
    x.routerCalls.forEach((y) => allPaths.push(y.path));
  });
  const uniquePaths: string[] = allPaths.filter(
    (x, i, a) => a.indexOf(x) == i
  );
  const routerCalls: RouterCalls = { routerCalls: routerCallsByFile, uniquePaths};
  writeToJSONFile("router-calls.json", routerCalls);
  return routerCalls;
};

const extractAll = async (filePath: string) => {
  const routercalls = await extractRouterNavigateCallsFromTypeScriptFiles(projectRoot);
  const routerLinks = await extractRouterLinksFromHTMLFiles(projectRoot);
  const allPaths = routercalls.uniquePaths.concat(routerLinks.uniquePaths);
  const uniquePaths = [...new Set(allPaths)];
  writeRouterLinkConstants(uniquePaths);
  console.log("Done");
}

const projectRoot = "C:/projects/here/here-platform-client/src/app/";
extractAll(projectRoot);



