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
  VariableStatement,
  SyntaxKind,
  StringLiteral,
  ObjectLiteralExpression,
  Expression,
  ts,
  Identifier,
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

interface Route {
  path?: string;
  pathMatch?: string;
  redirectTo?: string;
  importComponent?: string;
  children?: Route[];
  hasChildren: boolean;
  canActivate?: string[];
}

interface Routes {
  name?: string;
  routes?: Route[];
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
    filesWithOutlets.push(outlet.file.replace('.component.html',''));
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

const extractAll = async (projectRoot: string) => {
  const routercalls = await extractRouterNavigateCallsFromTypeScriptFiles(projectRoot);
  const routerLinks = await extractRouterLinksFromHTMLFiles(projectRoot);
  const allPaths = routercalls.uniquePaths.concat(routerLinks.uniquePaths);
  const uniquePaths = [...new Set(allPaths)];
  writeRouterLinkConstants(uniquePaths);
  console.log("Done");
}

function writeMermaidOutlets(outlets: string[], filePath: string) {
  outlets.forEach((o, i) => {
    fs.appendFileSync(filePath, `  subgraph x${i} [${o}]\r\n`);
    fs.appendFileSync(filePath, `    o${i}(router-outlet)\r\n`);
    fs.appendFileSync(filePath, `  end\r\n`);
  });
}

const extractRoutesFromTypeScriptFile = (filePath: string) => {
  console.clear();
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      target: ScriptTarget.ESNext,
    },
  });
  const sourceFile = project.addSourceFileAtPath(filePath);

  const routeDefinitions: Routes[] = [];

  sourceFile.getVariableStatements().forEach((s: VariableStatement) => {

    s.getDeclarations().forEach( d => {

      const name = d.getName();
      //console.log(name);

      const routeEntry: Routes = { name, routes:[]};
      routeDefinitions.push( routeEntry);

      const i = d.getInitializer();

      if (i.isKind(SyntaxKind.ArrayLiteralExpression)) {

        const ale = i.asKind(SyntaxKind.ArrayLiteralExpression);

        extractRoutes(ale, routeEntry);
      }
    });
  });
  writeToJSONFile("routes.json", routeDefinitions)
  console.log('see routes.json');
};

function extractRoutesChildren(ale: ArrayLiteralExpression, routeEntry: Routes, childRoute: Route) {
  ale.getElements().forEach(e => {
    if (e.isKind(SyntaxKind.ObjectLiteralExpression)) {
      const routeDef: Route = { hasChildren: false, children: [], canActivate: [] };
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
            extractLoadComponent( pai, routeDef);
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

function extractRoutes(ale: ArrayLiteralExpression, routeEntry: Routes) {

 ale.getElements().forEach(e => {

    if (e.isKind(SyntaxKind.ObjectLiteralExpression)) {

      const routeDef: Route = { hasChildren: false, children: [], canActivate: [] };

      const ole : ObjectLiteralExpression = e.asKind(SyntaxKind.ObjectLiteralExpression);

      ole.getProperties().forEach(p => {

        if (p.isKind(SyntaxKind.PropertyAssignment)) {

          const pa = p.asKind(SyntaxKind.PropertyAssignment);
          const pai = pa.getInitializer();

          if (pai.isKind(SyntaxKind.StringLiteral)) {
            extractRouteProperties(pa, pai, routeDef);
          }
          else if (pai.isKind(SyntaxKind.ArrowFunction)) {
            extractLoadComponent( pai, routeDef);
          }
          else if (pa.getName() === 'canActivate') {
            extractCanActivate(pa, routeDef);
          } else if (pa.getName() === 'children') {
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

function extractCanActivate(pa, routeDef: Route) {
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

function extractLoadComponent(pai, routeDef: Route) {

  //console.log(pa.getName(), pai.asKind(SyntaxKind.ArrowFunction).getText());

  if (pai.asKind(SyntaxKind.ArrowFunction).getBody().isKind(SyntaxKind.CallExpression)) {
    const ce = pai.asKind(SyntaxKind.ArrowFunction).getBody().asKind(SyntaxKind.CallExpression);
    if (ce.getExpression().isKind(SyntaxKind.PropertyAccessExpression)) {
      const cepae = ce.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
      //console.log(cepae.getText());
      const imp = cepae.getFirstDescendantByKind(SyntaxKind.ImportKeyword);
      // console.log(imp.getText());
      const args = (imp.getParent() as CallExpression).getArguments();

      // console.log((args as StringLiteral[])[0].getText());
      routeDef.importComponent = (args as StringLiteral[])[0].getText().replace(/[\"]/g, '');
    }
  }
}

function extractRouteProperties(pa, pai: StringLiteral, routeDef: Route) {

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

function writeMermaidEnd(filePath: string) {
  fs.appendFileSync(filePath, "```\r\n");
}

function writeMermaidStart(filePath: string) {
  fs.appendFileSync(filePath, "```mermaid\r\n");
  fs.appendFileSync(filePath, "graph BT;\r\n");
}

function deleteFileIfExists(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.log(err);
      }
    });
  }
}

function writeMermaidComponentsToAppOutlet(outlets: string[], routes: Routes[], filePath: string) {
  const indexOfRootOutlet = outlets.indexOf( 'app');
  routes.forEach(r => {
    let componentIndex = 0;
    const mainOutletComponents = r.routes.filter( x => !x.hasChildren && x.importComponent);
    mainOutletComponents.forEach( c => {
      const componentParts = c.importComponent.replace(".component",'').split(/[./]/);
      const component = componentParts[componentParts.length - 1];
      fs.appendFileSync(filePath, `  c${componentIndex}[${component}]-->|${c.path}|o${indexOfRootOutlet}\r\n`); 
      componentIndex++;
    });
  });
}

function collectRoutesWithChildrenRecusrive(routes: Route[], routesWithChildren: Route[]) {
  routes.forEach( r => {
    if (r.hasChildren) {
      routesWithChildren.push(r);
      collectRoutesWithChildrenRecusrive(r.children, routesWithChildren);
    }
  });
}

function getIndexOfOutlet(outlets: string[], importComponent: string)
{
  const name = getCompomentNameFromImportComponent(importComponent);
  const found = outlets.find( x => x.includes(name));
  return outlets.indexOf(found);
}
function getCompomentNameFromImportComponent(importComponent: string) {
  const componentParts = importComponent.replace(".component",'').split(/[./]/);
  const component = componentParts[componentParts.length - 1];
  return component;
}

function writeMermaidComponentsRoutedToOutlets(outlets: string[], routes: Routes[], filePath: string) {
  // find all routes with children
  const routesWithChildren: Route[] = [];
  routes.forEach( r => {
    collectRoutesWithChildrenRecusrive(r.routes, routesWithChildren);
  });
  //console.log(routesWithChildren);
  let componentIndex: number = 0;
  routesWithChildren.forEach( rwc => {
    //console.log(rwc.path, rwc.importComponent);
    if (rwc.importComponent != undefined) {
      const indexOfRootOutlet: number = getIndexOfOutlet(outlets, rwc.importComponent);
      rwc.children.forEach( c => {
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

const generateMermaid = async () => {
  const outlets: string[] = JSON.parse(await readFile("router-outlets.json", "utf8"));
  const routes: Routes[] = JSON.parse(await readFile("routes.json", "utf8"));
  try {
    const filePath = "app.md";
    deleteFileIfExists(filePath);
    writeMermaidStart(filePath);
    writeMermaidOutlets(outlets, filePath);
    writeMermaidComponentsToAppOutlet(outlets, routes, filePath);
    writeMermaidComponentsRoutedToOutlets(outlets, routes, filePath);
    writeMermaidEnd(filePath);
  } catch (error) {
    console.error("Error writing mermaid file:", error);
  }
  console.log('done');
}

extractAll("C:/projects/here/here-platform-client/src/app/");

generateMermaid();

//extractRoutesFromTypeScriptFile("C:/projects/here/here-platform-client/src/app/routes.ts");
//extractRoutesFromTypeScriptFile("C:/projects/here/here-platform-client/src/app/child-routes.ts");




