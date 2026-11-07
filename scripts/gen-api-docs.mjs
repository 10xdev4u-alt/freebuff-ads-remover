import ts from 'typescript';
import fs from 'node:fs';

const program = ts.createProgram(['src/index.ts'], { noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true });
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile('src/index.ts');
const lines = [];
lines.push('# API\n');
if (sourceFile) {
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) lines.push(`- export \`${el.name.text}\``);
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      lines.push(`- function \`${node.name.text}\``);
    } else if (ts.isClassDeclaration(node) && node.name) {
      lines.push(`- class \`${node.name.text}\``);
    } else if (ts.isInterfaceDeclaration(node)) {
      lines.push(`- interface \`${node.name.text}\``);
    } else if (ts.isTypeAliasDeclaration(node)) {
      lines.push(`- type \`${node.name.text}\``);
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) lines.push(`- const \`${decl.name.text}\``);
      }
    }
  });
}
fs.writeFileSync('docs/API.md', lines.join('\n') + '\n');
console.log('wrote docs/API.md');
