import React, { useState, useEffect, useCallback, useRef } from 'react';
import Cell from './Cell';
import './Spreadsheet.css';

const ROWS = 10;
const COLS = 10;
const COL_LABELS = 'ABCDEFGHIJ'.split('');

class DependencyGraph {
  constructor() {
    this.graph = new Map();
    this.reverseGraph = new Map();
  }

  addDependency(source, target) {
    if (!this.graph.has(target)) {
      this.graph.set(target, new Set());
    }
    this.graph.get(target).add(source);

    if (!this.reverseGraph.has(source)) {
      this.reverseGraph.set(source, new Set());
    }
    this.reverseGraph.get(source).add(target);
  }

  removeDependencies(cell) {
    if (this.reverseGraph.has(cell)) {
      const dependencies = this.reverseGraph.get(cell);
      dependencies.forEach(dep => {
        this.graph.get(dep)?.delete(cell);
      });
      this.reverseGraph.delete(cell);
    }
  }

  getDependents(cell) {
    return Array.from(this.graph.get(cell) || []);
  }

  detectCircular(startCell, visited = new Set()) {
    if (visited.has(startCell)) {
      return true;
    }
    
    visited.add(startCell);
    const dependencies = this.reverseGraph.get(startCell) || new Set();
    
    for (const dep of dependencies) {
      if (this.detectCircular(dep, new Set(visited))) {
        return true;
      }
    }
    
    return false;
  }

  getAllDependents(cell, result = new Set()) {
    const directDeps = this.graph.get(cell) || new Set();
    
    directDeps.forEach(dep => {
      if (!result.has(dep)) {
        result.add(dep);
        this.getAllDependents(dep, result);
      }
    });
    
    return Array.from(result);
  }
}

class FormulaParser {
  static parse(formula, getCellValue) {
    if (!formula.startsWith('=')) {
      return { value: formula, error: null };
    }
    
    const expression = formula.substring(1).trim();
    
    if (expression.length === 0) {
      return { value: '#ERROR', error: 'Empty formula' };
    }
    
    // Extract cell references
    const cellRefs = expression.match(/[A-J](10|[1-9])/g) || [];
    
    let evalExpression = expression;
    
    try {
      cellRefs.forEach(ref => {
        const value = getCellValue(ref);
        
        if (value === undefined || isNaN(value)) {
          throw new Error(`Invalid reference: ${ref}`);
        }
        
        evalExpression = evalExpression.replace(new RegExp(ref, 'g'), value);
      });
      
      evalExpression = evalExpression.replace(/\s+/g, '');
      
      const validChars = /^[0-9+\-*/().]+$/;
      if (!validChars.test(evalExpression)) {
        throw new Error('Invalid characters in formula');
      }
      
      if (evalExpression.length === 0) {
        throw new Error('Empty expression after replacements');
      }
      
      // Use safe evaluation
      const result = this.safeEvaluate(evalExpression);
      
      if (isNaN(result) || !isFinite(result)) {
        return { value: '#ERROR', error: 'Invalid result' };
      }
      
      return { value: result, error: null };
    } catch (error) {
      return { value: '#ERROR', error: error.message };
    }
  }
  
  static safeEvaluate(expression) {
    // Simple safe evaluator for basic arithmetic
    try {
      const cleanExpr = expression.replace(/[^0-9+\-*/().]/g, '');
      const tokens = this.tokenize(cleanExpr);
      return this.calculate(tokens);
    } catch (error) {
      // Fallback for complex expressions - using Function in controlled environment
      // eslint-disable-next-line no-new-func
      return Function(`"use strict"; return (${expression})`)();
    }
  }
  
  static tokenize(expr) {
    const tokens = [];
    let currentNumber = '';
    
    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];
      
      if ('0123456789.'.includes(char)) {
        currentNumber += char;
      } else {
        if (currentNumber) {
          tokens.push(parseFloat(currentNumber));
          currentNumber = '';
        }
        if ('+-*/()'.includes(char)) {
          tokens.push(char);
        }
      }
    }
    
    if (currentNumber) {
      tokens.push(parseFloat(currentNumber));
    }
    
    return tokens;
  }
  
  static calculate(tokens) {
    const precedence = {
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2
    };
    
    const output = [];
    const operators = [];
    
    // Convert to RPN (Reverse Polish Notation)
    tokens.forEach(token => {
      if (typeof token === 'number') {
        output.push(token);
      } else if (token === '(') {
        operators.push(token);
      } else if (token === ')') {
        while (operators.length && operators[operators.length - 1] !== '(') {
          output.push(operators.pop());
        }
        operators.pop();
      } else {
        while (operators.length && 
               operators[operators.length - 1] !== '(' && 
               precedence[operators[operators.length - 1]] >= precedence[token]) {
          output.push(operators.pop());
        }
        operators.push(token);
      }
    });
    
    while (operators.length) {
      output.push(operators.pop());
    }
    
    // Evaluate RPN
    const stack = [];
    output.forEach(token => {
      if (typeof token === 'number') {
        stack.push(token);
      } else {
        const b = stack.pop();
        const a = stack.pop();
        
        switch (token) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/': stack.push(a / b); break;
          default: throw new Error('Unknown operator');
        }
      }
    });
    
    return stack[0];
  }
}

export default function Spreadsheet() {
  const [cells, setCells] = useState(() => {
    const initial = {};
    for (let col = 0; col < COLS; col++) {
      for (let row = 1; row <= ROWS; row++) {
        const id = `${COL_LABELS[col]}${row}`;
        initial[id] = { 
          rawValue: '', 
          formula: '', 
          display: '',
          error: null 
        };
      }
    }
    return initial;
  });

  const dependencyGraph = useRef(new DependencyGraph());

  const getCellValue = useCallback((cellId) => {
    const cell = cells[cellId];
    if (!cell) return undefined;
    
    if (cell.display === '#CIRCULAR' || cell.display === '#ERROR') {
      return undefined;
    }
    
    const num = parseFloat(cell.display);
    return isNaN(num) ? undefined : num;
  }, [cells]);

  const evaluateCell = useCallback((cellId, formula = null) => {
    const cell = cells[cellId];
    const cellFormula = formula !== null ? formula : cell.formula;
    
    dependencyGraph.current.removeDependencies(cellId);
    
    if (!cellFormula || !cellFormula.startsWith('=')) {
      return { 
        display: cellFormula || '', 
        formula: cellFormula || '',
        error: null 
      };
    }
    
    const cellRefs = cellFormula.match(/[A-J](10|[1-9])/g) || [];
    
    cellRefs.forEach(ref => {
      dependencyGraph.current.addDependency(cellId, ref);
    });
    
    if (dependencyGraph.current.detectCircular(cellId)) {
      return { 
        display: '#CIRCULAR', 
        formula: cellFormula,
        error: 'Circular reference detected' 
      };
    }
    
    const result = FormulaParser.parse(cellFormula, getCellValue);
    
    if (result.value === '#ERROR') {
      return { 
        display: '#ERROR', 
        formula: cellFormula,
        error: result.error 
      };
    }
    
    return { 
      display: result.value.toString(), 
      formula: cellFormula,
      error: null 
    };
  }, [cells, getCellValue]);

  const updateCell = useCallback((cellId, rawValue) => {
    setCells(prev => {
      const newCells = { ...prev };
      
      const cellResult = evaluateCell(cellId, rawValue);
      newCells[cellId] = {
        rawValue: rawValue,
        formula: cellResult.formula,
        display: cellResult.display,
        error: cellResult.error
      };
      
      const dependents = dependencyGraph.current.getAllDependents(cellId);
      
      const visited = new Set([cellId]);
      const recalcQueue = [...dependents];
      
      while (recalcQueue.length > 0) {
        const dependentId = recalcQueue.shift();
        
        if (visited.has(dependentId)) continue;
        visited.add(dependentId);
        
        const dependentCell = newCells[dependentId];
        if (dependentCell?.formula) {
          const result = evaluateCell(dependentId, dependentCell.formula);
          newCells[dependentId] = {
            ...dependentCell,
            display: result.display,
            error: result.error
          };
          
          const nextDeps = dependencyGraph.current.getAllDependents(dependentId);
          // FIXED: Added parentheses to clarify operator precedence
          recalcQueue.push(...nextDeps.filter(dep => !visited.has(dep)));
        }
      }
      
      return newCells;
    });
  }, [evaluateCell]);

  // FIXED: Added updateCell to useEffect dependencies
  useEffect(() => {
    updateCell('A1', '5');
    updateCell('B1', '=A1+3');
    updateCell('C1', '=B1*2');
  }, [updateCell]);

  return (
    <div className="spreadsheet">
      <h1>📊 Spreadsheet Engine with Formula Evaluation</h1>
      
      <div className="grid-container">
        <div className="cell header"></div>
        
        {COL_LABELS.map(col => (
          <div key={`header-${col}`} className="cell header">{col}</div>
        ))}
        
        {Array.from({ length: ROWS }, (_, rowIndex) => {
          const rowNum = rowIndex + 1;
          return (
            <React.Fragment key={`row-${rowNum}`}>
              <div className="cell header">{rowNum}</div>
              
              {COL_LABELS.map(col => {
                const cellId = `${col}${rowNum}`;
                const cell = cells[cellId];
                return (
                  <Cell
                    key={cellId}
                    id={cellId}
                    value={cell?.rawValue || ''}
                    display={cell?.display || ''}
                    error={cell?.error}
                    onUpdate={updateCell}
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
      
      <div className="instructions">
        <h3>Instructions:</h3>
        <ul>
          <li>Click any cell to edit</li>
          <li>Enter numbers directly (e.g., <code>42</code>)</li>
          <li>Enter formulas starting with <code>=</code> (e.g., <code>=A1+B2</code>)</li>
          <li>Supported operations: <code>+ - * /</code> and parentheses</li>
          <li>Cell references: <code>A1</code>, <code>B10</code>, etc.</li>
          <li>Circular references show: <strong>#CIRCULAR</strong></li>
          <li>Errors show: <strong>#ERROR</strong></li>
        </ul>
        
        <div className="example">
  <h3> Example:</h3>
  <ol>
    <li>
      Cell A1 already has <code>5</code>
    </li>
    <li>
      Cell B1 has <code>=A1+3</code> → shows <code>8</code>
    </li>
    <li>
      Cell C1 has <code>=B1*2</code> → shows <code>16</code>
    </li>
    <li>
      Try changing A1 to <code>10</code> → B1 updates to <code>13</code>,
      C1 to <code>26</code>
    </li>
  </ol>
</div>

      </div>
    </div>
  );
}