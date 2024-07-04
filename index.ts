import {
  HtmlParser,
  ParseTreeResult,
  ParsedTemplate,
  RecursiveVisitor,
  TmplAstNode,
  parseTemplate,
  Text as Text_2,
  Element as Element_2,
  Block,
  visitAll,
} from "@angular/compiler";
import { readFile } from "node:fs/promises";
import { glob } from "glob";

export interface RouterLinkInstance {
  value: string;
  start: number;
  end: number;
}

export interface RouterLinkInstancesByFile {
  file: string;
  routerLinkInstances: RouterLinkInstance[];
}

class ElementCollector extends RecursiveVisitor {
  readonly elements: RouterLinkInstance[] = [];
  constructor() {
    super();
  }
  override visitElement(element: Element_2, context: any) {
    if (element.attrs.length > 0) {
      for (const attr of element.attrs) {
        if (attr.name === "[routerLink]") {
          this.elements.push({
            value: attr.value,
            start: attr.valueSpan.start.offset,
            end: attr.valueSpan.end.offset,
          });
        }
      }
    }
    return super.visitElement(element, context);
  }
}

const parseRouterLinks = async (filePath: string) => {
  const htmlFiles = await glob(filePath + "**/*.html", {
    ignore: "node_modules/**",
  });
  const routerLinks: RouterLinkInstancesByFile[] = [];
  htmlFiles.forEach(async (htmlFile) => {
    const template = await readFile(htmlFile, { encoding: "utf8" });
    const parsedTemplate: ParseTreeResult = new HtmlParser().parse(
      template,
      htmlFile,
      { preserveLineEndings: true, tokenizeBlocks: false }
    );
    const visitor = new ElementCollector();
    visitAll(visitor, parsedTemplate.rootNodes);
    const instance = { file: htmlFile, routerLinkInstances: visitor.elements };

    if (instance.routerLinkInstances.length > 0) {
      console.log(instance.file);
      instance.routerLinkInstances.forEach((l) => {
        console.log(l.value);
      });
    }
  });
  routerLinks.forEach((rl) => {
    console.log(rl, rl.routerLinkInstances);
  });
};

parseRouterLinks(
  //   "C:/projects/here/here-platform-client/src/app/admin/activity/activity-table/activity-table.component.html"
  "C:/projects/here/here-platform-client/src/app/"
);
