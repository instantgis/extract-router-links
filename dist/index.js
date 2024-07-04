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
class ElementCollector extends RecursiveVisitor {
    constructor() {
        super();
        this.elements = [];
    }
    visitElement(element, context) {
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
const parseRouterLinks = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    const htmlFiles = yield glob(filePath + "**/*.html", {
        ignore: "node_modules/**",
    });
    const routerLinks = [];
    htmlFiles.forEach((htmlFile) => __awaiter(void 0, void 0, void 0, function* () {
        const template = yield readFile(htmlFile, { encoding: "utf8" });
        const parsedTemplate = new HtmlParser().parse(template, htmlFile, { preserveLineEndings: true, tokenizeBlocks: false });
        const visitor = new ElementCollector();
        visitAll(visitor, parsedTemplate.rootNodes);
        const instance = { file: htmlFile, routerLinkInstances: visitor.elements };
        if (instance.routerLinkInstances.length > 0) {
            console.log(instance.file);
            instance.routerLinkInstances.forEach((l) => {
                console.log(l.value);
            });
        }
    }));
    routerLinks.forEach((rl) => {
        console.log(rl, rl.routerLinkInstances);
    });
});
parseRouterLinks(
//   "C:/projects/here/here-platform-client/src/app/admin/activity/activity-table/activity-table.component.html"
"C:/projects/here/here-platform-client/src/app/");
//# sourceMappingURL=index.js.map