import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const HISTORY_KEY = 'calculator-history-v1';
const HISTORY_LIMIT = 8;
const KEY_ROWS = [
  [
    { label: 'C', action: 'clear', style: 'dark' },
    { label: '(', value: '(' },
    { label: ')', value: ')' },
    { label: '÷', value: '/' },
  ],
  [
    { label: '7', value: '7', style: 'number' },
    { label: '8', value: '8', style: 'number' },
    { label: '9', value: '9', style: 'number' },
    { label: '×', value: '*' },
  ],
  [
    { label: '4', value: '4', style: 'number' },
    { label: '5', value: '5', style: 'number' },
    { label: '6', value: '6', style: 'number' },
    { label: '−', value: '-' },
  ],
  [
    { label: '1', value: '1', style: 'number' },
    { label: '2', value: '2', style: 'number' },
    { label: '3', value: '3', style: 'number' },
    { label: '+', value: '+' },
  ],
  [
    { label: '%', value: '%' },
    { label: '0', value: '0', style: 'number' },
    { label: '.', value: '.', style: 'number' },
    { label: '=', action: 'equals', style: 'dark' },
  ],
];

function tokenize(source) {
  const tokens = [];
  let offset = 0;

  while (offset < source.length) {
    const character = source[offset];
    if (/\s/.test(character)) {
      offset += 1;
      continue;
    }
    if ('()+-*/%'.includes(character)) {
      tokens.push({ type: character });
      offset += 1;
      continue;
    }
    const number = source.slice(offset).match(/^(?:\d+\.?\d*|\.\d+)/);
    if (!number) throw new Error('Check the expression.');
    tokens.push({ type: 'number', value: Number(number[0]) });
    offset += number[0].length;
  }

  return tokens;
}

function calculateExpression(source) {
  if (source.length > 120) throw new Error('Expression is too long.');
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
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 10 }).format(value);
}

export default function App() {
  const { width } = useWindowDimensions();
  const wideLayout = width >= 760;
  const [expression, setExpression] = useState('');
  const [lastValue, setLastValue] = useState(0);
  const [lastExpression, setLastExpression] = useState('');
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const keyboardActions = useRef({});

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(HISTORY_KEY)
      .then(saved => {
        if (!active || !saved) return;
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setHistory(parsed.filter(item => typeof item?.expression === 'string' && Number.isFinite(item?.result)).slice(0, HISTORY_LIMIT));
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const saveHistory = nextHistory => {
    setHistory(nextHistory);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory)).catch(() => {});
  };

  const clear = () => {
    setExpression('');
    setLastValue(0);
    setLastExpression('');
    setJustEvaluated(false);
    setMessage('');
  };

  const removeLast = () => {
    setExpression(current => current.slice(0, -1));
    setJustEvaluated(false);
    setMessage('');
  };

  const append = value => {
    const isOperator = /^[+\-*/%]$/.test(value);
    setExpression(current => {
      let next = current;
      if (justEvaluated) next = isOperator ? String(lastValue) : '';
      if (value === '.') {
        const currentNumber = next.split(/[()+\-*/%]/).at(-1);
        if (currentNumber.includes('.')) return next;
        if (!currentNumber) next += '0';
      }
      if (next.length >= 120) return next;
      return next + value;
    });
    setJustEvaluated(false);
    setMessage('');
  };

  const evaluate = () => {
    try {
      const source = expression;
      const result = calculateExpression(source);
      const nextHistory = [{ expression: source, result }, ...history].slice(0, HISTORY_LIMIT);
      setLastValue(result);
      setLastExpression(source);
      setExpression(String(result));
      setJustEvaluated(true);
      setMessage('');
      saveHistory(nextHistory);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const clearHistory = () => saveHistory([]);

  const copyResult = async () => {
    let value = lastValue;
    try {
      if (expression) value = calculateExpression(expression);
      await Clipboard.setStringAsync(String(value));
      setMessage('Result copied.');
    } catch {
      setMessage('Clipboard access is unavailable.');
    }
  };

  const restoreHistory = source => {
    setExpression(source);
    setJustEvaluated(false);
    setMessage('');
  };

  keyboardActions.current = { append, clear, evaluate, removeLast };
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const handleKeyDown = event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const actions = keyboardActions.current;
      if (/^[0-9.+\-*/()%]$/.test(event.key)) {
        event.preventDefault();
        actions.append(event.key);
      } else if (event.key === 'Enter' || event.key === '=') {
        event.preventDefault();
        actions.evaluate();
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        actions.removeLast();
      } else if (event.key === 'Escape' || event.key.toLowerCase() === 'c') {
        actions.clear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  let preview = null;
  if (expression) {
    try {
      preview = calculateExpression(expression);
    } catch {
      preview = null;
    }
  }
  const resultText = expression ? (preview === null ? '...' : formatNumber(preview)) : '0';
  const shownExpression = justEvaluated ? `${lastExpression} =` : (expression || '0');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#d7ef4a" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.shell, wideLayout && styles.shellWide]}>
          <View style={styles.masthead}>
            <Text style={styles.eyebrow}>EVERYDAY MATH, MADE CLEAR</Text>
            <Text style={styles.title}>Calculator<Text style={styles.titleAccent}>.</Text></Text>
          </View>

          <View style={[styles.card, wideLayout && styles.cardWide]}>
            <View style={styles.workbench}>
              <View style={styles.display}>
                <View style={styles.displayTopline}>
                  <Text style={styles.displayLabel}>DISPLAY</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Copy result" onPress={copyResult} hitSlop={8}>
                    <Text style={styles.textButton}>Copy result</Text>
                  </Pressable>
                </View>
                <Text numberOfLines={1} style={styles.expression}>{shownExpression}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.result}>{resultText}</Text>
              </View>

              <View style={styles.keypad}>
                {KEY_ROWS.map((row, rowIndex) => (
                  <View key={`row-${rowIndex}`} style={styles.keyRow}>
                    {row.map(key => {
                      const dark = key.style === 'dark';
                      const number = key.style === 'number';
                      const onPress = key.action === 'clear' ? clear : key.action === 'equals' ? evaluate : () => append(key.value);
                      return (
                        <Pressable
                          key={key.label}
                          accessibilityRole="button"
                          accessibilityLabel={key.action === 'clear' ? 'Clear all' : key.action === 'equals' ? 'Equals' : key.label}
                          onPress={onPress}
                          style={({ pressed }) => [
                            styles.key,
                            number && styles.numberKey,
                            dark && styles.darkKey,
                            pressed && styles.keyPressed,
                          ]}
                        >
                          <Text style={[styles.keyText, number && styles.numberText, dark && styles.darkText]}>{key.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
              <Text accessibilityRole="alert" style={styles.message}>{message}</Text>
            </View>

            <View style={[styles.historyPane, wideLayout ? styles.historyWide : styles.historyMobile]}>
              <View style={styles.historyHeading}>
                <View>
                  <Text style={styles.displayLabel}>RECENT WORK</Text>
                  <Text style={styles.historyTitle}>History</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Clear history" onPress={clearHistory} hitSlop={8}>
                  <Text style={styles.textButton}>Clear</Text>
                </Pressable>
              </View>
              {history.length === 0 ? (
                <Text style={styles.emptyHistory}>Your calculations will appear here.</Text>
              ) : (
                <ScrollView style={styles.historyList} nestedScrollEnabled>
                  {history.map((item, index) => (
                    <Pressable
                      key={`${item.expression}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.expression} equals ${formatNumber(item.result)}`}
                      onPress={() => restoreHistory(item.expression)}
                      style={styles.historyEntry}
                    >
                      <Text numberOfLines={1} style={styles.historyExpression}>{item.expression} =</Text>
                      <Text style={styles.historyValue}>{formatNumber(item.result)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
          <Text style={styles.footer}>A LITTLE SPACE FOR BIG NUMBERS</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#d7ef4a' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 30 },
  shell: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 18 },
  shellWide: { maxWidth: 1060, paddingHorizontal: 28 },
  masthead: { marginBottom: 18, paddingHorizontal: 5 },
  eyebrow: { color: '#343a18', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 10, fontWeight: '500', letterSpacing: 0 },
  title: { marginTop: 7, color: '#171912', fontSize: 38, fontWeight: '800', lineHeight: 44 },
  titleAccent: { color: '#ef7657' },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(23,25,18,0.08)', borderRadius: 8, backgroundColor: '#fbfaef', elevation: 8, shadowColor: '#31390c', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.18, shadowRadius: 25 },
  cardWide: { flexDirection: 'row' },
  workbench: { minWidth: 0, flex: 1, padding: 22 },
  display: { minHeight: 150, justifyContent: 'flex-end', alignItems: 'flex-end', paddingHorizontal: 2, paddingBottom: 20 },
  displayTopline: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  displayLabel: { color: '#77796e', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 10, fontWeight: '500', letterSpacing: 0 },
  textButton: { paddingVertical: 5, paddingLeft: 8, color: '#77796e', fontSize: 12, fontWeight: '700' },
  expression: { width: '100%', minHeight: 23, color: '#77796e', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 15, textAlign: 'right' },
  result: { width: '100%', color: '#171912', fontSize: 54, fontWeight: '700', lineHeight: 68, textAlign: 'right' },
  keypad: { gap: 8 },
  keyRow: { flexDirection: 'row', gap: 8 },
  key: { minWidth: 0, flex: 1, aspectRatio: 1.48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 5, backgroundColor: '#e8edc8' },
  numberKey: { backgroundColor: '#f0efe4' },
  darkKey: { backgroundColor: '#171912' },
  keyPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  keyText: { color: '#556214', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 20, fontWeight: '500' },
  numberText: { color: '#171912' },
  darkText: { color: '#d7ef4a' },
  message: { minHeight: 22, marginTop: 8, color: '#b44732', fontSize: 12, textAlign: 'right' },
  historyPane: { minWidth: 0, backgroundColor: '#f5f4e9' },
  historyWide: { width: '34%', padding: 27, borderLeftWidth: 1, borderLeftColor: '#e8e7dc' },
  historyMobile: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 15, borderTopWidth: 1, borderTopColor: '#e8e7dc' },
  historyHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  historyTitle: { marginTop: 7, color: '#171912', fontSize: 20, fontWeight: '800' },
  emptyHistory: { paddingVertical: 18, color: '#77796e', fontSize: 13, lineHeight: 20 },
  historyList: { maxHeight: 360, marginTop: 12 },
  historyEntry: { alignItems: 'flex-end', gap: 5, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#e8e7dc' },
  historyExpression: { maxWidth: '100%', color: '#77796e', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 11 },
  historyValue: { color: '#171912', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 17, fontWeight: '500' },
  footer: { marginTop: 15, paddingHorizontal: 5, color: '#3e461f', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 10, fontWeight: '500', letterSpacing: 0, textAlign: 'right' },
});