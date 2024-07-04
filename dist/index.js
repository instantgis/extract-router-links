var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { HtmlParser, RecursiveVisitor, visitAll, } from "@angular/compiler";
import { readFile } from "node:fs/promises";
import { glob } from "glob";
import * as path from "path";
import * as fs from "fs";
class RouterLinkCollector extends RecursiveVisitor {
    constructor() {
        super();
        this.routerLinks = [];
        this.routerOutlets = [];
    }
    visitElement(element, context) {
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
const parseRouterLinks = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Globbing html files...");
    const htmlFiles = yield glob(filePath + "**/*.html", {
        ignore: "node_modules/**",
    });
    console.log("html files found ", htmlFiles.length);
    const routerLinksOrOutlets = [];
    console.log("Parsing html files...");
    let filesWithRouterLinks = 0;
    let filesWithRouterOutlets = 0;
    let totalRouterLinks = 0;
    let totalRouterOutlets = 0;
    for (const htmlFile of htmlFiles) {
        const template = yield readFile(htmlFile, { encoding: "utf8" });
        const parsedTemplate = new HtmlParser().parse(template, htmlFile, { preserveLineEndings: true, tokenizeBlocks: false });
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
    const outlets = routerLinksOrOutlets.filter((x) => x.routerOutlets.length > 0);
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
    }
    catch (error) {
        console.error("Error writing JSON RouterLinks to file:", error);
    }
    console.log("Completed");
});
parseRouterLinks("C:/projects/here/here-platform-client/src/app/");
//# sourceMappingURL=index.js.map