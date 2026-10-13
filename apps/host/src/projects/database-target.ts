import ts from 'typescript';

/** Conservative support proof, not a general-purpose program analysis or sandbox.
 * Every recognized SQLite open must derive from the explicit test DB environment.
 * Unprovable targets are gaps, even when a developer may know they are safe.
 */
export function databaseTargetsUseTestEnvironment(file:string):boolean{
  const program=ts.createProgram([file],{allowJs:true,noResolve:true,noLib:true});
  const source=program.getSourceFile(file);if(!source)return false;
  const checker=program.getTypeChecker();let safe=true;
  const unwrap=(e:ts.Expression):ts.Expression=>ts.isParenthesizedExpression(e)||ts.isAsExpression(e)||ts.isNonNullExpression(e)?unwrap(e.expression):e;
  const fromTestEnv=(value:ts.Expression,seen=new Set<ts.Symbol>()):boolean=>{
    const e=unwrap(value);
    if(ts.isPropertyAccessExpression(e)&&e.name.text==='TEST_DATABASE'&&ts.isPropertyAccessExpression(e.expression)&&e.expression.name.text==='env'&&ts.isIdentifier(e.expression.expression)&&e.expression.expression.text==='process')return true;
    if(ts.isIdentifier(e)){
      const symbol=checker.getSymbolAtLocation(e);if(!symbol||seen.has(symbol))return false;seen.add(symbol);
      const declarations=symbol.declarations??[];if(declarations.length!==1)return false;
      const d=declarations[0];return !!d&&ts.isVariableDeclaration(d)&&ts.isVariableDeclarationList(d.parent)&&(d.parent.flags&ts.NodeFlags.Const)!==0&&!!d.initializer&&fromTestEnv(d.initializer,seen);
    }
    if(ts.isCallExpression(e)&&ts.isIdentifier(e.expression)&&e.arguments.length===1){
      const d=checker.getSymbolAtLocation(e.expression)?.declarations?.[0];
      if(d&&ts.isImportSpecifier(d)&&(d.propertyName??d.name).text==='resolve'){
        const importDeclaration=d.parent.parent.parent;
        if(ts.isImportDeclaration(importDeclaration)&&ts.isStringLiteral(importDeclaration.moduleSpecifier)&&['node:path','path'].includes(importDeclaration.moduleSpecifier.text))return fromTestEnv(e.arguments[0]!,seen);
      }
    }
    return false;
  };
  const databaseConstructor=(expression:ts.Expression,seen=new Set<ts.Symbol>()):boolean=>{
    const e=unwrap(expression);if(ts.isPropertyAccessExpression(e))return ['DatabaseSync','Database'].includes(e.name.text);
    if(!ts.isIdentifier(e))return false;if(['DatabaseSync','Database'].includes(e.text))return true;
    const symbol=checker.getSymbolAtLocation(e);if(!symbol||seen.has(symbol))return false;seen.add(symbol);
    return (symbol.declarations??[]).some(d=>ts.isImportSpecifier(d)&&['DatabaseSync','Database'].includes((d.propertyName??d.name).text)||ts.isBindingElement(d)&&!!d.propertyName&&['DatabaseSync','Database'].includes(d.propertyName.getText(source))||ts.isVariableDeclaration(d)&&!!d.initializer&&databaseConstructor(d.initializer,seen));
  };
  function visit(node:ts.Node):void{
    if(ts.isPropertyAccessExpression(node)&&node.name.text==='env'&&ts.isIdentifier(node.expression)&&node.expression.text==='process'){
      const access=node.parent;
      // Passing/aliasing the entire environment or assigning its properties
      // defeats the test target guarantee; only ordinary property reads qualify.
      if(!ts.isPropertyAccessExpression(access)||access.expression!==node)safe=false;
      else if(ts.isBinaryExpression(access.parent)&&access.parent.left===access&&access.parent.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&access.parent.operatorToken.kind<=ts.SyntaxKind.LastAssignment||ts.isDeleteExpression(access.parent)||ts.isPostfixUnaryExpression(access.parent)||ts.isPrefixUnaryExpression(access.parent)&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(access.parent.operator))safe=false;
    }
    // Cross-module constructor re-exports and computed SQLite access are outside
    // this deliberately narrow proof; they must not be silently treated as safe.
    if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&['node:sqlite','sqlite'].includes(node.moduleSpecifier.text))safe=false;
    if(ts.isElementAccessExpression(node)&&node.expression.getText(source)==='sqlite')safe=false;
    if((ts.isNewExpression(node)||ts.isCallExpression(node))&&databaseConstructor(node.expression)&&(!node.arguments?.[0]||!fromTestEnv(node.arguments[0])))safe=false;
    ts.forEachChild(node,visit);
  }
  visit(source);return safe;
}
