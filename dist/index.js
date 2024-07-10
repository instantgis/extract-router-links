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
import { Project, ScriptTarget, Node, SyntaxKind, } from "ts-morph";
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
        filesWithOutlets.push(outlet.file.replace('.component.html', ''));
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
const extractAll = (projectRoot) => __awaiter(void 0, void 0, void 0, function* () {
    const routercalls = yield extractRouterNavigateCallsFromTypeScriptFiles(projectRoot);
    const routerLinks = yield extractRouterLinksFromHTMLFiles(projectRoot);
    const allPaths = routercalls.uniquePaths.concat(routerLinks.uniquePaths);
    const uniquePaths = [...new Set(allPaths)];
    writeRouterLinkConstants(uniquePaths);
    console.log("Done");
});
function writeMermaidOutlets(outlets, filePath) {
    outlets.forEach((o, i) => {
        fs.appendFileSync(filePath, `  subgraph x${i} [${o}]\r\n`);
        fs.appendFileSync(filePath, `    o${i}(router-outlet)\r\n`);
        fs.appendFileSync(filePath, `  end\r\n`);
    });
}
const extractRoutesFromTypeScriptFile = (filePath) => {
    console.clear();
    const project = new Project({
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
        compilerOptions: {
            target: ScriptTarget.ESNext,
        },
    });
    const sourceFile = project.addSourceFileAtPath(filePath);
    const routeDefinitions = [];
    sourceFile.getVariableStatements().forEach((s) => {
        s.getDeclarations().forEach(d => {
            const name = d.getName();
            //console.log(name);
            const routeEntry = { name, routes: [] };
            routeDefinitions.push(routeEntry);
            const i = d.getInitializer();
            if (i.isKind(SyntaxKind.ArrayLiteralExpression)) {
                const ale = i.asKind(SyntaxKind.ArrayLiteralExpression);
                extractRoutes(ale, routeEntry);
            }
        });
    });
    writeToJSONFile("routes.json", routeDefinitions);
    console.log('see routes.json');
};
function extractRoutesChildren(ale, routeEntry, childRoute) {
    ale.getElements().forEach(e => {
        if (e.isKind(SyntaxKind.ObjectLiteralExpression)) {
            const routeDef = { hasChildren: false, children: [], canActivate: [] };
            const ole = e.asKind(SyntaxKind.ObjectLiteralExpression);
            ole.getProperties().forEach(p => {
                if (p.isKind(SyntaxKind.PropertyAssignment)) {
                    const pa = p.asKind(SyntaxKind.PropertyAssignment);
                    const pai = pa.getInitializer();
                    if (pai.isKind(SyntaxKind.StringLiteral)) {
                        extractRouteProperties(pa, pai, routeDef);
                    }
                    else if (pa.getName() === 'canActivate') {
                        extractCanActivate(pa, routeDef);
                    }
                    else if (pai.isKind(SyntaxKind.ArrowFunction)) {
                        extractLoadComponent(pai, routeDef);
                    }
                    else if (pa.getName() === 'children') {
                        const i = pa.getInitializer();
                        if (i.isKind(SyntaxKind.ArrayLiteralExpression)) {
                            const ale = i.asKind(SyntaxKind.ArrayLiteralExpression);
                            routeDef.hasChildren = true;
                            extractRoutesChildren(ale, routeEntry, routeDef);
                        }
                    }
                }
            });
            if (routeDef.path !== undefined) {
                childRoute.children.push(routeDef);
            }
        }
    });
}
function extractRoutes(ale, routeEntry) {
    ale.getElements().forEach(e => {
        if (e.isKind(SyntaxKind.ObjectLiteralExpression)) {
            const routeDef = { hasChildren: false, children: [], canActivate: [] };
            const ole = e.asKind(SyntaxKind.ObjectLiteralExpression);
            ole.getProperties().forEach(p => {
                if (p.isKind(SyntaxKind.PropertyAssignment)) {
                    const pa = p.asKind(SyntaxKind.PropertyAssignment);
                    const pai = pa.getInitializer();
                    if (pai.isKind(SyntaxKind.StringLiteral)) {
                        extractRouteProperties(pa, pai, routeDef);
                    }
                    else if (pai.isKind(SyntaxKind.ArrowFunction)) {
                        extractLoadComponent(pai, routeDef);
                    }
                    else if (pa.getName() === 'canActivate') {
                        extractCanActivate(pa, routeDef);
                    }
                    else if (pa.getName() === 'children') {
                        const i = pa.getInitializer();
                        if (i.isKind(SyntaxKind.ArrayLiteralExpression)) {
                            const ale = i.asKind(SyntaxKind.ArrayLiteralExpression);
                            routeDef.hasChildren = true;
                            extractRoutesChildren(ale, routeEntry, routeDef);
                        }
                    }
                }
            });
            if (routeDef.path !== undefined) {
                routeEntry.routes.push(routeDef);
            }
        }
    });
}
function extractCanActivate(pa, routeDef) {
    const i = pa.getInitializer();
    if (i.isKind(SyntaxKind.ArrayLiteralExpression)) {
        const ale = i.asKind(SyntaxKind.ArrayLiteralExpression);
        ale.getElements().forEach(e => {
            if (e.isKind(SyntaxKind.Identifier)) {
                routeDef.canActivate.push(e.getText());
            }
        });
    }
}
function extractLoadComponent(pai, routeDef) {
    //console.log(pa.getName(), pai.asKind(SyntaxKind.ArrowFunction).getText());
    if (pai.asKind(SyntaxKind.ArrowFunction).getBody().isKind(SyntaxKind.CallExpression)) {
        const ce = pai.asKind(SyntaxKind.ArrowFunction).getBody().asKind(SyntaxKind.CallExpression);
        if (ce.getExpression().isKind(SyntaxKind.PropertyAccessExpression)) {
            const cepae = ce.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
            //console.log(cepae.getText());
            const imp = cepae.getFirstDescendantByKind(SyntaxKind.ImportKeyword);
            // console.log(imp.getText());
            const args = imp.getParent().getArguments();
            // console.log((args as StringLiteral[])[0].getText());
            routeDef.importComponent = args[0].getText().replace(/[\"]/g, '');
        }
    }
}
function extractRouteProperties(pa, pai, routeDef) {
    //console.log(pa.getName(), pai.asKind(SyntaxKind.StringLiteral).getText());
    switch (pa.getName()) {
        case 'path':
            routeDef.path = pai.asKind(SyntaxKind.StringLiteral).getText().replace(/[\"]/g, '');
            break;
        case 'redirectTo':
            routeDef.redirectTo = pai.asKind(SyntaxKind.StringLiteral).getText().replace(/[\"]/g, '');
            break;
        case 'pathMatch':
            routeDef.pathMatch = pai.asKind(SyntaxKind.StringLiteral).getText().replace(/[\"]/g, '');
            break;
        default:
            break;
    }
}
function writeMermaidEnd(filePath) {
    fs.appendFileSync(filePath, "```\r\n");
}
function writeMermaidStart(filePath) {
    fs.appendFileSync(filePath, "```mermaid\r\n");
    fs.appendFileSync(filePath, "graph BT;\r\n");
}
function deleteFileIfExists(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.log(err);
            }
        });
    }
}
function writeMermaidComponentsToAppOutlet(outlets, routes, filePath) {
    const indexOfRootOutlet = outlets.indexOf('app');
    routes.forEach(r => {
        let componentIndex = 0;
        const mainOutletComponents = r.routes.filter(x => !x.hasChildren && x.importComponent);
        mainOutletComponents.forEach(c => {
            const componentParts = c.importComponent.replace(".component", '').split(/[./]/);
            const component = componentParts[componentParts.length - 1];
            fs.appendFileSync(filePath, `  c${componentIndex}[${component}]-->|${c.path}|o${indexOfRootOutlet}\r\n`);
            componentIndex++;
        });
    });
}
function collectRoutesWithChildrenRecusrive(routes, routesWithChildren) {
    routes.forEach(r => {
        if (r.hasChildren) {
            routesWithChildren.push(r);
            collectRoutesWithChildrenRecusrive(r.children, routesWithChildren);
        }
    });
}
function getIndexOfOutlet(outlets, importComponent) {
    const name = getCompomentNameFromImportComponent(importComponent);
    const found = outlets.find(x => x.includes(name));
    return outlets.indexOf(found);
}
function getCompomentNameFromImportComponent(importComponent) {
    const componentParts = importComponent.replace(".component", '').split(/[./]/);
    const component = componentParts[componentParts.length - 1];
    return component;
}
function writeMermaidComponentsRoutedToOutlets(outlets, routes, filePath) {
    // find all routes with children
    const routesWithChildren = [];
    routes.forEach(r => {
        collectRoutesWithChildrenRecusrive(r.routes, routesWithChildren);
    });
    //console.log(routesWithChildren);
    let componentIndex = 0;
    routesWithChildren.forEach(rwc => {
        //console.log(rwc.path, rwc.importComponent);
        if (rwc.importComponent != undefined) {
            const indexOfRootOutlet = getIndexOfOutlet(outlets, rwc.importComponent);
            rwc.children.forEach(c => {
                if (c.importComponent != undefined) {
                    const component = getCompomentNameFromImportComponent(c.importComponent);
                    fs.appendFileSync(filePath, `  x${componentIndex}[${component}]-->|${c.path}|o${indexOfRootOutlet}\r\n`);
                    componentIndex++;
                }
                else {
                    // Ignore redirects typically
                    //console.log(c);
                }
            });
        }
        else {
            console.log('hun?', rwc);
        }
    });
}
const generateMermaid = () => __awaiter(void 0, void 0, void 0, function* () {
    const outlets = JSON.parse(yield readFile("router-outlets.json", "utf8"));
    const routes = JSON.parse(yield readFile("routes.json", "utf8"));
    try {
        const filePath = "app.md";
        deleteFileIfExists(filePath);
        writeMermaidStart(filePath);
        writeMermaidOutlets(outlets, filePath);
        writeMermaidComponentsToAppOutlet(outlets, routes, filePath);
        writeMermaidComponentsRoutedToOutlets(outlets, routes, filePath);
        writeMermaidEnd(filePath);
    }
    catch (error) {
        console.error("Error writing mermaid file:", error);
    }
    console.log('done');
});
extractAll("C:/projects/here/here-platform-client/src/app/");
generateMermaid();
//extractRoutesFromTypeScriptFile("C:/projects/here/here-platform-client/src/app/routes.ts");
//extractRoutesFromTypeScriptFile("C:/projects/here/here-platform-client/src/app/child-routes.ts");
//# sourceMappingURL=index.js.map