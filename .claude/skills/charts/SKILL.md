---
name: charts
description: Recharts patterns for Hebrew RTL dashboards - graphs, charts, data visualization with proper Hebrew support.
---

# CHARTS.md - Recharts Patterns for Hebrew Dashboards

## Setup

```bash
pnpm add recharts
```

---

# 1. BASIC SETUP

## 1.1 Responsive Container (חובה!)

```tsx
'use client'
import { ResponsiveContainer } from 'recharts'

// ✅ תמיד עטוף ב-ResponsiveContainer
function ChartWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}
```

## 1.2 RTL Configuration

```tsx
// הגדרות בסיסיות ל-RTL
const rtlConfig = {
  // Labels מימין לשמאל
  layout: 'vertical' as const, // לBar charts אופקיים

  // מיקום Legend
  legendAlign: 'right' as const,

  // כיוון XAxis
  reversed: true,
}

// פורמט מספרים בעברית
const hebrewFormatter = (value: number) =>
  new Intl.NumberFormat('he-IL').format(value)

// פורמט תאריכים בעברית
const hebrewDateFormatter = (date: string) =>
  new Date(date).toLocaleDateString('he-IL', {
    month: 'short',
    day: 'numeric'
  })
```

---

# 2. LINE CHART

## 2.1 Basic Line Chart

```tsx
'use client'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const data = [
  { month: 'ינואר', sales: 4000, orders: 240 },
  { month: 'פברואר', sales: 3000, orders: 198 },
  { month: 'מרץ', sales: 5000, orders: 300 },
  { month: 'אפריל', sales: 4500, orders: 280 },
]

function SalesLineChart() {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
          <XAxis
            dataKey="month"
            className="text-sm"
            tick={{ fill: 'currentColor' }}
          />
          <YAxis
            tickFormatter={(value) => new Intl.NumberFormat('he-IL').format(value)}
            className="text-sm"
            tick={{ fill: 'currentColor' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="sales"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ fill: '#8b5cf6', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

## 2.2 Multi-Line Chart

```tsx
function MultiLineChart() {
  return (
    <LineChart data={data}>
      {/* ... axes and grid ... */}
      <Line
        type="monotone"
        dataKey="sales"
        stroke="#8b5cf6"
        name="מכירות"
      />
      <Line
        type="monotone"
        dataKey="orders"
        stroke="#22c55e"
        name="הזמנות"
      />
      <Legend
        align="right"
        verticalAlign="top"
        wrapperStyle={{ paddingBottom: 20 }}
      />
    </LineChart>
  )
}
```

---

# 3. BAR CHART

## 3.1 Vertical Bar Chart

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function VerticalBarChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <XAxis dataKey="month" />
        <YAxis tickFormatter={hebrewFormatter} />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="sales"
          fill="#8b5cf6"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

## 3.2 Horizontal Bar Chart (מומלץ לעברית!)

```tsx
// ✅ אופקי - טוב יותר לטקסט עברי
function HorizontalBarChart() {
  const data = [
    { category: 'אלקטרוניקה', value: 4000 },
    { category: 'ביגוד', value: 3000 },
    { category: 'מזון', value: 2000 },
    { category: 'ריהוט', value: 2780 },
  ]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" tickFormatter={hebrewFormatter} />
        <YAxis
          type="category"
          dataKey="category"
          width={100}
          tick={{ textAnchor: 'end' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="value"
          fill="#8b5cf6"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

## 3.3 Stacked Bar Chart

```tsx
function StackedBarChart() {
  return (
    <BarChart data={data}>
      <XAxis dataKey="month" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Bar dataKey="online" stackId="a" fill="#8b5cf6" name="אונליין" />
      <Bar dataKey="store" stackId="a" fill="#22c55e" name="חנות" />
    </BarChart>
  )
}
```

---

# 4. PIE & DONUT CHARTS

## 4.1 Pie Chart

```tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#8b5cf6', '#22c55e', '#f97316', '#0ea5e9', '#eab308']

function BasicPieChart() {
  const data = [
    { name: 'אלקטרוניקה', value: 400 },
    { name: 'ביגוד', value: 300 },
    { name: 'מזון', value: 200 },
    { name: 'ריהוט', value: 278 },
  ]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={100}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

## 4.2 Donut Chart

```tsx
function DonutChart() {
  return (
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={60}  // ← יוצר חור באמצע
        outerRadius={100}
        paddingAngle={2}
        dataKey="value"
      >
        {data.map((_, index) => (
          <Cell key={index} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      {/* Label במרכז */}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
        <tspan x="50%" dy="-0.5em" className="text-2xl font-bold fill-slate-900 dark:fill-white">
          ₪{total.toLocaleString('he-IL')}
        </tspan>
        <tspan x="50%" dy="1.5em" className="text-sm fill-slate-500">
          סה"כ מכירות
        </tspan>
      </text>
    </PieChart>
  )
}
```

---

# 5. AREA CHART

```tsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function GradientAreaChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="month" />
        <YAxis tickFormatter={hebrewFormatter} />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="sales"
          stroke="#8b5cf6"
          strokeWidth={2}
          fill="url(#colorSales)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

---

# 6. CUSTOM TOOLTIP (חובה לעברית!)

```tsx
interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
      <p className="font-medium text-slate-900 dark:text-white mb-2">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {entry.name}
              </span>
            </div>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {new Intl.NumberFormat('he-IL').format(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

# 7. LEGEND בעברית

```tsx
import { Legend } from 'recharts'

// ✅ Legend מותאם לעברית
<Legend
  align="right"
  verticalAlign="top"
  wrapperStyle={{ paddingBottom: 20 }}
  formatter={(value) => (
    <span className="text-sm text-slate-600 dark:text-slate-400">
      {value}
    </span>
  )}
/>

// Custom Legend
function CustomLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  return (
    <div className="flex flex-wrap justify-end gap-4 mb-4">
      {payload?.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}
```

---

# 8. DASHBOARD CARD

```tsx
interface ChartCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  action?: React.ReactNode
}

function ChartCard({ title, subtitle, children, action }: ChartCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// שימוש
<ChartCard
  title="מכירות חודשיות"
  subtitle="6 חודשים אחרונים"
  action={
    <select className="text-sm border rounded-lg px-3 py-1">
      <option>שנה נוכחית</option>
      <option>שנה קודמת</option>
    </select>
  }
>
  <SalesLineChart />
</ChartCard>
```

---

# 9. STAT CARDS

```tsx
interface StatCardProps {
  title: string
  value: string | number
  change?: number
  icon: React.ReactNode
}

function StatCard({ title, value, change, icon }: StatCardProps) {
  const isPositive = change && change > 0

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {typeof value === 'number'
              ? new Intl.NumberFormat('he-IL').format(value)
              : value
            }
          </p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${
              isPositive ? 'text-green-600' : 'text-red-600'
            }`}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{Math.abs(change)}%</span>
              <span className="text-slate-500">מהחודש שעבר</span>
            </div>
          )}
        </div>
        <div className="p-3 bg-primary/10 rounded-xl">
          {icon}
        </div>
      </div>
    </div>
  )
}
```

---

# 10. LOADING & EMPTY STATES

```tsx
// Skeleton לגרף
function ChartSkeleton() {
  return (
    <div className="w-full h-[300px] animate-pulse">
      <div className="h-full bg-slate-100 dark:bg-slate-800 rounded-lg" />
    </div>
  )
}

// Empty State לגרף
function ChartEmptyState() {
  return (
    <div className="w-full h-[300px] flex flex-col items-center justify-center text-center">
      <BarChart3 className="w-12 h-12 text-slate-300 mb-4" />
      <p className="text-slate-500">אין נתונים להצגה</p>
      <p className="text-sm text-slate-400">נתונים יופיעו כאן כשיהיו זמינים</p>
    </div>
  )
}

// Error State
function ChartErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="w-full h-[300px] flex flex-col items-center justify-center text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
      <p className="text-slate-900 dark:text-white font-medium">שגיאה בטעינת הנתונים</p>
      <button
        onClick={onRetry}
        className="mt-4 text-sm text-primary hover:underline"
      >
        נסה שוב
      </button>
    </div>
  )
}
```

---

# 11. MINI CHARTS (לכרטיסי סטטיסטיקות)

```tsx
// Sparkline - גרף מיני ללא צירים
function Sparkline({ data, color = '#8b5cf6' }: { data: number[]; color?: string }) {
  const chartData = data.map((value, index) => ({ value, index }))

  return (
    <div className="w-24 h-8">
      <ResponsiveContainer>
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Mini Bar
function MiniBar({ data, color = '#8b5cf6' }: { data: number[]; color?: string }) {
  const chartData = data.map((value, index) => ({ value, index }))

  return (
    <div className="w-24 h-8">
      <ResponsiveContainer>
        <BarChart data={chartData}>
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

# 12. BEST PRACTICES

## Do's ✅

```tsx
// ✅ תמיד ResponsiveContainer
<ResponsiveContainer width="100%" height={300}>

// ✅ Custom Tooltip בעברית
<Tooltip content={<CustomTooltip />} />

// ✅ פורמט מספרים בעברית
tickFormatter={(value) => new Intl.NumberFormat('he-IL').format(value)}

// ✅ Bar אופקי לטקסט עברי
<BarChart layout="vertical">

// ✅ Legend מימין
<Legend align="right" />

// ✅ צבעים סמנטיים
const COLORS = {
  primary: '#8b5cf6',
  success: '#22c55e',
  warning: '#f97316',
  error: '#ef4444',
}
```

## Don'ts ❌

```tsx
// ❌ גובה/רוחב קבועים
<LineChart width={600} height={300}>

// ❌ Tooltip ברירת מחדל (לא בעברית)
<Tooltip />

// ❌ יותר מדי נתונים בגרף אחד
data.length > 50 // קשה לקריאה

// ❌ צבעים דומים מדי
['#8b5cf6', '#7c3aed', '#6d28d9'] // קשה להבחין
```
