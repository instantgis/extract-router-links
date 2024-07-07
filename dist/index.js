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
import { Project, ScriptTarget, Node, } from "ts-morph";
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
                    const splitted = attr.value.split(",");
                    if (splitted.length > 0 && !splitted[0].includes(".routerLink")) {
                        const values = [];
                        let route = "";
                        splitted.forEach((x, i) => {
                            const shaved = x.replace(/[\[\]\s']/g, "").replace("]", "");
                            if (i === 0) {
                                route = shaved;
                            }
                            else {
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
const extractRouterLinksFromHTMLFiles = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    const routerLinks = { routerLinks: [], uniquePaths: [] };
    const htmlFiles = yield glob(filePath + "**/*.html", { ignore: "node_modules/**" });
    const routerLinksOrOutlets = [];
    for (const htmlFile of htmlFiles) {
        const template = yield readFile(htmlFile, { encoding: "utf8" });
        const parsedTemplate = new HtmlParser().parse(template, htmlFile, { preserveLineEndings: true, tokenizeBlocks: false });
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
    const routerLinksOnly = routerLinksOrOutlets.filter((x) => x.routerLinks.length > 0);
    routerLinksOnly.forEach((x) => {
        x.routerLinks.forEach((y) => allRouterLinks.push(y.route));
    });
    const uniqueLinks = allRouterLinks.filter((x, i, a) => a.indexOf(x) == i);
    routerLinks.uniquePaths = uniqueLinks;
    writeToJSONFile("router-links.json", routerLinks);
    writeOutlets(routerLinksOrOutlets);
    return routerLinks;
});
function writeOutlets(routerLinksOrOutlets) {
    const outlets = routerLinksOrOutlets.filter((x) => x.routerOutlets.length > 0);
    const filesWithOutlets = [];
    for (const outlet of outlets) {
        filesWithOutlets.push(outlet.file);
    }
    writeToJSONFile("router-outlets.json", filesWithOutlets);
}
function writeRouterLinkConstants(uniqueLinks) {
    const constants = [];
    uniqueLinks.forEach((l) => {
        if (l != "") {
            constants.push({
                link: l,
                constant: l === "/"
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
        const sortedConstants = constants.sort((a, b) => b.constant.localeCompare(a.constant));
        sortedConstants.forEach((c) => {
            fs.appendFileSync(filePath, `  static readonly ${c.constant} = "${c.link}";\r\n`);
        });
        fs.appendFileSync(filePath, "};\r\n");
    }
    catch (error) {
        console.error("Error writing constants to file:", error);
    }
}
function writeToJSONFile(file, json) {
    const jsonRouterLinks = JSON.stringify(json, null, 2);
    try {
        fs.writeFileSync(file, jsonRouterLinks);
    }
    catch (error) {
        console.error("Error writing JSON  file:", error);
    }
}
const extractRouterNavigateCallsFromTypeScriptFile = (filePath, callsByFile) => {
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
        compilerOptions: {
            target: ScriptTarget.ESNext,
        },
    });
    const sourceFile = project.addSourceFileAtPath(filePath);
    const callsForThisFile = { file: filePath, routerCalls: [] };
    sourceFile.getClasses().forEach((c) => {
        c.forEachDescendant((node) => {
            if (Node.isCallExpression(node)) {
                const code = node.getText();
                if (code.includes(".navigate")) {
                    let routerCall = {
                        call: node.getText(),
                        path: "",
                        start: node.getStart(),
                        end: node.getEnd(),
                        lineStart: node.getStartLineNumber(),
                        lineEnd: node.getEndLineNumber(),
                        arguments: [],
                        relative: true
                    };
                    const callee = node;
                    const args = callee.getArguments();
                    args.forEach((a) => {
                        if (Node.isArrayLiteralExpression(a)) {
                            const elements = a.getElements();
                            elements.forEach((e, i) => {
                                if (i === 0) {
                                    routerCall.path = e.getText().replace(/[\\"']/g, '');
                                    routerCall.relative = !routerCall.path.startsWith('/');
                                }
                                else {
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
const extractRouterNavigateCallsFromTypeScriptFiles = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    const tsFiles = yield glob(filePath + "**/*.ts", { ignore: "node_modules/**" });
    const routerCallsByFile = [];
    for (const tsFile of tsFiles) {
        extractRouterNavigateCallsFromTypeScriptFile(tsFile, routerCallsByFile);
    }
    const allPaths = [];
    routerCallsByFile.forEach((x) => {
        x.routerCalls.forEach((y) => allPaths.push(y.path));
    });
    const uniquePaths = allPaths.filter((x, i, a) => a.indexOf(x) == i);
    const routerCalls = { routerCalls: routerCallsByFile, uniquePaths };
    writeToJSONFile("router-calls.json", routerCalls);
    return routerCalls;
});
const extractAll = (filePath) => __awaiter(void 0, void 0, void 0, function* () {
    const routercalls = yield extractRouterNavigateCallsFromTypeScriptFiles(projectRoot);
    const routerLinks = yield extractRouterLinksFromHTMLFiles(projectRoot);
    const allPaths = routercalls.uniquePaths.concat(routerLinks.uniquePaths);
    const uniquePaths = [...new Set(allPaths)];
    writeRouterLinkConstants(uniquePaths);
    console.log("Done");
});
const projectRoot = "C:/projects/here/here-platform-client/src/app/";
extractAll(projectRoot);
//# sourceMappingURL=index.js.map