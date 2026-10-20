'use strict';

(() => {
  const expressionNode = document.querySelector('#expression');
  const resultNode = document.querySelector('#result');
  const statusNode = document.querySelector('#status');
  const historyNode = document.querySelector('#history-list');
  const keypad = document.querySelector('.keypad');
  const copyButton = document.querySelector('[data-action="copy"]');
  const storageKey = 'calculator-history-v1';
  let expression = '';
  let shownResult = 0;
  let justEvaluated = false;
  let history = loadHistory();

  function tokenize(source) {
    const tokens = [];
    const tokenPattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([()+\-*/%]))/y;
    let offset = 0;

    while (offset < source.length) {
      tokenPattern.lastIndex = offset;
      const match = tokenPattern.exec(source);
      if (!match) throw new Error('Check the expression.');
      tokens.push(match[1] !== undefined ? { type: 'number', value: Number(match[1]) } : { type: match[2] });
      offset = tokenPattern.lastIndex;
    }

    return tokens;
  }

  function calculate(source) {
    const tokens = tokenize(source);
    let position = 0;

    function primary() {
      const token = tokens[position++];
      if (!token) throw new Error('Finish the expression.');
      if (token.type === 'number') return token.value;
      if (token.type === '(') {
        const value = sum();
        if (tokens[position]?.type !== ')') throw new Error('Close the parenthesis.');
        position += 1;
        return value;
      }
      throw new Error('Check the expression.');
    }

    function postfix() {
      let value = primary();
      while (tokens[position]?.type === '%') {
        position += 1;
        value /= 100;
      }
      return value;
    }

    function unary() {
      if (tokens[position]?.type === '+') {
        position += 1;
        return unary();
      }
      if (tokens[position]?.type === '-') {
        position += 1;
        return -unary();
      }
      return postfix();
    }

    function product() {
      let value = unary();
      while (tokens[position]?.type === '*' || tokens[position]?.type === '/') {
        const operator = tokens[position++].type;
        const right = unary();
        if (operator === '/' && right === 0) throw new Error('Cannot divide by zero.');
        value = operator === '*' ? value * right : value / right;
      }
      return value;
    }

    function sum() {
      let value = product();
      while (tokens[position]?.type === '+' || tokens[position]?.type === '-') {
        const operator = tokens[position++].type;
        const right = product();
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    }

    if (tokens.length === 0) throw new Error('Enter a calculation.');
    const value = sum();
    if (position !== tokens.length) throw new Error('Check the expression.');
    if (!Number.isFinite(value)) throw new Error('Result is out of range.');
    return Object.is(value, -0) ? 0 : value;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 10, useGrouping: true }).format(value);
  }

  function render() {
    expressionNode.textContent = expression || '0';
    statusNode.textContent = '';
    if (!expression) {
      shownResult = 0;
      resultNode.textContent = '0';
      return;
    }
    try {
      shownResult = calculate(expression);
      resultNode.textContent = formatNumber(shownResult);
    } catch {
      resultNode.textContent = '...';
    }
  }

  function append(value) {
    const isOperator = /^[+\-*/%]$/.test(value);
    if (justEvaluated && !isOperator && value !== ')') expression = '';
    if (justEvaluated && isOperator) expression = String(shownResult);
    justEvaluated = false;

    if (value === '.') {
      const currentNumber = expression.split(/[()+\-*/%]/).at(-1);
      if (currentNumber.includes('.')) return;
      if (!currentNumber) expression += '0';
    }
    expression += value;
    render();
  }

  function clear() {
    expression = '';
    justEvaluated = false;
    render();
  }

  function removeLast() {
    expression = expression.slice(0, -1);
    justEvaluated = false;
    render();
  }

  function evaluate() {
    try {
      const original = expression;
      const value = calculate(original);
      shownResult = value;
      resultNode.textContent = formatNumber(value);
      expressionNode.textContent = `${original} =`;
      expression = String(value);
      justEvaluated = true;
      addHistory(original, value);
      statusNode.textContent = '';
    } catch (error) {
      statusNode.textContent = error.message;
    }
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(saved) ? saved.filter(item => typeof item?.expression === 'string' && Number.isFinite(item?.result)).slice(0, 8) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(history));
    } catch {
      statusNode.textContent = 'History could not be saved.';
    }
  }

  function addHistory(source, value) {
    history.unshift({ expression: source, result: value });
    history = history.slice(0, 8);
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    historyNode.replaceChildren();
    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = 'Your calculations will appear here.';
      historyNode.append(empty);
      return;
    }
    history.forEach(item => {
      const row = document.createElement('li');
      row.className = 'history-item';
      const button = document.createElement('button');
      button.className = 'history-entry';
      button.type = 'button';
      button.dataset.historyExpression = item.expression;
      const source = document.createElement('span');
      source.className = 'history-expression';
      source.textContent = `${item.expression} =`;
      const value = document.createElement('span');
      value.className = 'history-value';
      value.textContent = formatNumber(item.result);
      button.append(source, value);
      row.append(button);
      historyNode.append(row);
    });
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(String(shownResult));
      statusNode.textContent = 'Result copied.';
    } catch {
      statusNode.textContent = 'Clipboard access is unavailable.';
    }
  }

  keypad.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.action === 'clear') clear();
    else if (button.dataset.action === 'equals') evaluate();
    else if (button.dataset.value) append(button.dataset.value);
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action="clear-history"]');
    if (!button) return;
    history = [];
    saveHistory();
    renderHistory();
  });

  historyNode.addEventListener('click', event => {
    const button = event.target.closest('[data-history-expression]');
    if (!button) return;
    expression = button.dataset.historyExpression;
    justEvaluated = false;
    render();
  });

  copyButton.addEventListener('click', copyResult);

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[0-9.+\-*/()%]$/.test(event.key)) {
      event.preventDefault();
      append(event.key);
    } else if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault();
      evaluate();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      removeLast();
    } else if (event.key === 'Escape' || event.key.toLowerCase() === 'c') {
      clear();
    }
  });

  render();
  renderHistory();
})();