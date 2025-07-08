#!/usr/bin/env node
// sig-extract.js
import fs          from "node:fs/promises";
import path        from "node:path";
import { fileURLToPath } from "node:url";
import { parse }   from "@babel/parser";
import traverse    from "@babel/traverse";
const { default: _traverse } = traverse;
const traverseNode = _traverse || traverse;
import * as t      from "@babel/types";

/**
 * Return an array of human-readable signatures found in `source`.
 *
 * @param {string} source  JS source code
 * @param {string} file    filename (for nice error messages)
 */
export function signaturesFrom(source, file = "<inline>") {
  const ast = parse(source, {
    sourceType: "unambiguous",              // handles CJS & ESM
    plugins: ["jsx", "classProperties"],    // add more if needed
    attachComments: true,                   // attach comments to AST nodes
    ranges: true,                           // include start/end positions
  });

  const out = [];
  
  const fmtParams = params =>
    params
      .map(p =>
        t.isAssignmentPattern(p)
          ? `${p.left.name} = ${source.slice(p.right.start, p.right.end)}`
          : p.name                           // simple identifiers
      )
      .join(", ");

  // Extract object method invocations from a function/method body
  const extractDependencies = (functionNode) => {
    const methodCalls = new Set();  // Only track method calls on objects

    // Helper function to recursively traverse nodes
    const traverseNode = (node) => {
      if (!node) return;
      
      if (t.isCallExpression(node)) {
        const callee = node.callee;
        if (t.isMemberExpression(callee)) {
          // Handle obj.method() calls
          const objName = t.isIdentifier(callee.object) ? callee.object.name : '[complex]';
          const propName = t.isIdentifier(callee.property) ? callee.property.name : '[computed]';
          methodCalls.add(`${objName}.${propName}()`);
        }
      }
      
      // Recursively traverse child nodes
      if (Array.isArray(node)) {
        node.forEach(child => traverseNode(child));
      } else if (node && typeof node === 'object') {
        Object.values(node).forEach(child => {
          if (child && typeof child === 'object') {
            traverseNode(child);
          }
        });
      }
    };

    // Traverse the function body
    if (functionNode.body) {
      traverseNode(functionNode.body);
    }

    // Convert Set to sorted array for consistent output
    return Array.from(methodCalls).sort();
  };

  // Extract JSDoc comment from a node's leading comments
  const extractDocstring = (node) => {
    // First, try the node's own leading comments
    let comments = node.leadingComments;
    
    // If no comments found and this is a class, check if it's exported
    // and look for comments on the export declaration
    if (!comments && t.isClassDeclaration(node)) {
      // For export class declarations, comments might be on the parent export node
      // We'll search through all comments in the AST
      const allComments = ast.comments || [];
      
      // Find comments that appear before this node
      const nodeStart = node.start;
      const potentialComments = allComments
        .filter(comment => comment.end < nodeStart)
        .filter(comment => comment.type === 'CommentBlock' && comment.value.startsWith('*'));
      
      if (potentialComments.length > 0) {
        // Take the closest comment before this node
        const closestComment = potentialComments
          .sort((a, b) => b.end - a.end)[0];
        
        // Make sure there's not too much space between comment and class
        const gap = nodeStart - closestComment.end;
        if (gap < 200) { // Allow reasonable gap for whitespace/newlines
          comments = [closestComment];
        }
      }
    }
    
    if (!comments || comments.length === 0) return null;
    
    // Find the last JSDoc comment (/** ... */) before this node
    const jsdocComment = comments
      .filter(comment => comment.type === 'CommentBlock' && comment.value.startsWith('*'))
      .pop();
    
    if (!jsdocComment) return null;
    
    // Clean up the JSDoc comment - remove leading * and trim
    return jsdocComment.value
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line.length > 0)
      .join(' ');
  };

  // Format output with optional docstring and dependencies
  const formatSignature = (signature, docstring, dependencies = null) => {
    let result = signature;
    
    if (docstring) {
      result = `/** ${docstring} */\n${signature}`;
    }
    
    if (dependencies && dependencies.length > 0) {
      result += `\n  // Calls: ${dependencies.join(', ')}`;
    }
    
    return result;
  };

  traverseNode(ast, {
    // ── standalone functions ───────────────────────────────────────
    FunctionDeclaration(path) {
      const fn = path.node;
      const signature = `function ${fn.id.name}(${fmtParams(fn.params)})`;
      const docstring = extractDocstring(fn);
      const dependencies = extractDependencies(fn);
      out.push(formatSignature(signature, docstring, dependencies));
    },

    // const foo = () => {}   or   let bar = function () {}
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (
        t.isIdentifier(id) &&
        (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init))
      ) {
        const signature = `function ${id.name}(${fmtParams(init.params)})`;
        // For variable declarators, check the parent VariableDeclaration for comments
        const docstring = extractDocstring(path.parent) || extractDocstring(init);
        const dependencies = extractDependencies(init);
        out.push(formatSignature(signature, docstring, dependencies));
      }
    },

    // ── classes & their methods ────────────────────────────────────
    ClassDeclaration(path) {
      const cls = path.node;
      const className = cls.id?.name ?? "<anonymous>";
      const classSignature = `class ${className}`;
      const classDocstring = extractDocstring(cls);
      out.push({ type: 'class', signature: formatSignature(classSignature, classDocstring) });

      cls.body.body.forEach(el => {
        if (t.isClassMethod(el) || t.isClassPrivateMethod(el)) {
          const name = t.isPrivateName(el.key)
            ? `#${el.key.id.name}`
            : el.key.name ?? "[computed]";
          const prefix = el.kind === "constructor" ? "" : el.static ? "static " : "";
          const methodSignature = `${prefix}${name}(${fmtParams(el.params)})`;
          const methodDocstring = extractDocstring(el);
          const dependencies = extractDependencies(el);
          out.push({ 
            type: 'method', 
            signature: formatSignature(methodSignature, methodDocstring, dependencies) 
          });
        }
      });
    },

    // ── object-literal methods (optional) ──────────────────────────
    ObjectExpression(path) {
      path.node.properties.forEach(prop => {
        if (
          t.isObjectMethod(prop) ||
          (t.isObjectProperty(prop) &&
            (t.isFunctionExpression(prop.value) ||
             t.isArrowFunctionExpression(prop.value)))
        ) {
          const name = prop.key.name ?? "[computed]";
          const fn   = t.isObjectMethod(prop) ? prop : prop.value;
          const signature = `objectMethod ${name}(${fmtParams(fn.params)})`;
          const docstring = extractDocstring(prop);
          const dependencies = extractDependencies(fn);
          out.push(formatSignature(signature, docstring, dependencies));
        }
      });
    },
  });

  return out;
}

/* ── CLI driver ─────────────────────────────────────────────────── */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error("usage: node sig-extract.js <fileOrDir>…");
    process.exit(1);
  }

  async function collectFiles(p) {
    const stat = await fs.stat(p);
    if (stat.isDirectory()) {
      const children = await fs.readdir(p);
      return (
        await Promise.all(children.map(c => collectFiles(path.join(p, c))))
      ).flat();
    }
    return p.endsWith(".js") ? [p] : [];
  }

  const files = (await Promise.all(targets.map(collectFiles))).flat();

  for (const file of files) {
    const src  = await fs.readFile(file, "utf8");
    const sigs = signaturesFrom(src, file);
    
    if (sigs.length > 0) {
      console.log(`${file}:`);
      sigs.forEach(sig => {
        if (typeof sig === 'string') {
          // Handle legacy string signatures (functions, object methods)
          console.log(`  ${sig}`);
        } else {
          // Handle structured signatures (classes and methods)
          const indent = sig.type === 'method' ? '    ' : '  ';
          const lines = sig.signature.split('\n');
          lines.forEach(line => {
            console.log(`${indent}${line}`);
          });
        }
      });
      console.log(); // Empty line between files
    }
  }
}
