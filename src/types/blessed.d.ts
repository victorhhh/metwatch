// ---------------------------------------------------------------------------
// Ambient declarations for blessed and blessed-contrib
//
// We use a local declaration file instead of @types/blessed because:
//   1. @types/blessed (0.1.20, 2019) predates many blessed APIs and conflicts
//      with Bun's bundler module resolution.
//   2. We only need the subset of the API that MetWatch actually uses.
//   3. This file is authoritative and won't drift when npm packages change.
//
// Add declarations here as new blessed features are consumed.
// ---------------------------------------------------------------------------

declare module 'blessed' {
  import { EventEmitter } from 'events';

  // ── Style objects ─────────────────────────────────────────────────────────

  interface BorderStyle {
    type?: 'line' | 'bg';
    fg?: string;
    bg?: string;
  }

  interface ScrollbarStyle {
    ch?: string;
    fg?: string;
    bg?: string;
    track?: { bg?: string; fg?: string };
  }

  interface ElementStyle {
    fg?: string;
    bg?: string;
    bold?: boolean;
    underline?: boolean;
    border?: BorderStyle;
    scrollbar?: ScrollbarStyle;
    label?: Partial<ElementStyle>;
    focus?: Partial<ElementStyle>;
    hover?: Partial<ElementStyle>;
    selected?: Partial<ElementStyle>;
    item?: Partial<ElementStyle>;
    header?: Partial<ElementStyle>;
    cell?: Partial<ElementStyle>;
    bar?: Partial<ElementStyle>;
  }

  // ── Options ───────────────────────────────────────────────────────────────

  interface ScreenOptions {
    smartCSR?: boolean;
    fastCSR?: boolean;
    fullUnicode?: boolean;
    dockBorders?: boolean;
    title?: string;
    debug?: boolean;
    ignoreLocked?: string[];
    autoPadding?: boolean;
  }

  interface ElementOptions {
    parent?: BlessedElement | BlessedScreen;
    top?: number | string;
    left?: number | string;
    width?: number | string;
    height?: number | string;
    right?: number | string;
    bottom?: number | string;
    content?: string;
    label?: string;
    tags?: boolean;
    border?: BorderStyle | { type: string };
    style?: ElementStyle;
    scrollable?: boolean;
    alwaysScroll?: boolean;
    scrollbar?: ScrollbarStyle | boolean;
    keys?: boolean;
    vi?: boolean;
    mouse?: boolean;
    hidden?: boolean;
    padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
    shrink?: boolean;
    focusable?: boolean;
    input?: boolean;
    clickable?: boolean;
    interactive?: boolean;
  }

  interface BoxOptions extends ElementOptions {}

  interface ListOptions extends ElementOptions {
    items?: string[];
    invertSelected?: boolean;
  }

  interface ListTableOptions extends ElementOptions {
    data?: string[][];
    rows?: string[][];
    pad?: number;
    noCellBorders?: boolean;
    fillCellBorders?: boolean;
  }

  interface LogOptions extends ElementOptions {
    scrollback?: number;
    scrollOnInput?: boolean;
  }

  interface ProgressBarOptions extends ElementOptions {
    orientation?: 'horizontal' | 'vertical';
    pch?: string;
    filled?: number;
    value?: number;
  }

  interface QuestionOptions extends ElementOptions {}
  interface MessageOptions extends ElementOptions {}

  // ── Elements ──────────────────────────────────────────────────────────────

  class BlessedElement extends EventEmitter {
    width: number;
    height: number;
    top: number;
    left: number;
    content: string;
    hidden: boolean;

    setContent(text: string): void;
    getContent(): string;
    setText(text: string): void;
    setLabel(text: string): void;
    show(): void;
    hide(): void;
    toggle(): void;
    focus(): void;
    render(): void;
    destroy(): void;
    key(keys: string | string[], handler: (ch: string, key: KeyEvent) => void): void;
    onceKey(keys: string | string[], handler: (ch: string, key: KeyEvent) => void): void;
    unkey(keys: string | string[], handler: (ch: string, key: KeyEvent) => void): void;
    on(event: string, handler: (...args: unknown[]) => void): this;
    append(child: BlessedElement): void;
    remove(child: BlessedElement): void;
  }

  class BlessedScreen extends BlessedElement {
    cols: number;
    rows: number;
    focused: BlessedElement;

    render(): void;
    destroy(): void;
    key(keys: string | string[], handler: (ch: string, key: KeyEvent) => void): void;
    append(child: BlessedElement): void;
    remove(child: BlessedElement): void;
  }

  class Box extends BlessedElement {
    constructor(options?: BoxOptions);
  }

  class Log extends BlessedElement {
    constructor(options?: LogOptions);
    log(text: string): void;
    add(text: string): void;
  }

  class ListTable extends BlessedElement {
    constructor(options?: ListTableOptions);
    setData(data: string[][]): void;
    setRows(rows: string[][]): void;
  }

  class ProgressBar extends BlessedElement {
    constructor(options?: ProgressBarOptions);
    setProgress(amount: number): void;
    progress(amount: number): void;
    reset(): void;
  }

  class Question extends BlessedElement {
    constructor(options?: QuestionOptions);
    ask(question: string, callback: (err: Error | null, value: boolean) => void): void;
  }

  class Message extends BlessedElement {
    constructor(options?: MessageOptions);
    display(text: string, time: number, callback?: () => void): void;
    error(text: string, time: number, callback?: () => void): void;
  }

  // ── Keyboard event ────────────────────────────────────────────────────────

  interface KeyEvent {
    name: string;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
    sequence: string;
    full: string;
  }

  // ── Factory functions ─────────────────────────────────────────────────────

  function screen(options?: ScreenOptions): BlessedScreen;
  function box(options?: BoxOptions): Box;
  function log(options?: LogOptions): Log;
  function listtable(options?: ListTableOptions): ListTable;
  function progressbar(options?: ProgressBarOptions): ProgressBar;
  function question(options?: QuestionOptions): Question;
  function message(options?: MessageOptions): Message;
}

declare module 'blessed-contrib' {
  import type { BlessedElement, BlessedScreen, ElementOptions } from 'blessed';

  // ── Grid ──────────────────────────────────────────────────────────────────

  interface GridOptions {
    rows: number;
    cols: number;
    screen: BlessedScreen;
    hideBorder?: boolean;
    color?: string;
  }

  type WidgetConstructor<T> = new (options: ElementOptions) => T;

  class grid {
    constructor(options: GridOptions);
    set<T extends BlessedElement>(
      row: number,
      col: number,
      rowSpan: number,
      colSpan: number,
      widget: WidgetConstructor<T> | ((options: ElementOptions) => T),
      options: Record<string, unknown>
    ): T;
  }

  // ── Gauge ─────────────────────────────────────────────────────────────────

  interface GaugeOptions extends ElementOptions {
    label?: string;
    stroke?: string;
    fill?: string;
    percent?: number;
    showLabel?: boolean;
  }

  class gauge extends BlessedElement {
    constructor(options?: GaugeOptions);
    setPercent(percent: number): void;
    setData(data: { percent: number; label?: string }): void;
  }

  // ── GaugeList (stacked gauges) ────────────────────────────────────────────

  interface GaugeListOptions extends ElementOptions {
    label?: string;
    gauges?: Array<{ percent: number; stroke?: string; label?: string }>;
  }

  class gaugeList extends BlessedElement {
    constructor(options?: GaugeListOptions);
    setGauges(gauges: Array<{ percent: number; stroke?: string; label?: string }>): void;
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  interface TableOptions extends ElementOptions {
    keys?: boolean;
    vi?: boolean;
    mouse?: boolean;
    interactive?: boolean;
    label?: string;
    columnSpacing?: number;
    columnWidth?: number[];
  }

  class table extends BlessedElement {
    constructor(options?: TableOptions);
    setData(data: { headers: string[]; data: string[][] }): void;
  }

  // ── Log ───────────────────────────────────────────────────────────────────

  interface ContribLogOptions extends ElementOptions {
    label?: string;
    bufferLength?: number;
    scrollbar?: { ch?: string };
  }

  class log extends BlessedElement {
    constructor(options?: ContribLogOptions);
    log(text: string): void;
    add(text: string): void;
  }

  // ── Line chart ────────────────────────────────────────────────────────────

  interface LineSeries {
    title?: string;
    x: string[];
    y: number[];
    style?: { line?: string };
  }

  interface LineOptions extends ElementOptions {
    label?:          string;
    showLegend?:     boolean;
    legend?:         { width?: number };
    xLabelPadding?:  number;
    xPadding?:       number;
    numYLabels?:     number;
    showNthLabel?:   number;
    wholeNumbersOnly?: boolean;
    minY?:           number;
    maxY?:           number;
    style?: {
      line?:     string | string[];
      text?:     string;
      baseline?: string;
    };
  }

  class line extends BlessedElement {
    constructor(options?: LineOptions);
    setData(data: LineSeries | LineSeries[]): void;
  }
}
