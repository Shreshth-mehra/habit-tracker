# Habit Tracker Metrics Feature

## Overview

This update adds a new `habittrackermetrics` codeblock that displays comprehensive analytics and statistics for your habits. Unlike the interactive `habittracker` codeblock, the metrics view provides a read-only table with calculated metrics and perfect day statistics.

## Features Added

### 1. New Codeblock: `habittrackermetrics`

A new markdown codeblock processor that displays habit metrics in a table format. It accepts the same parameters as the existing `habittracker` codeblock but shows analytics instead of an interactive UI.

### 2. New Setting: Perfect Day Percentage

Added a global setting `perfectDayPercentage` (default: 60) that determines the threshold for what constitutes a "perfect day". A perfect day is when at least this percentage of habits have entries on the same date.

- **Range**: 0-100
- **Default**: 60
- **Usage**: Can be overridden per codeblock using `perfectDayPercentage` in the codeblock JSON

### 3. Metrics Displayed

The metrics table shows the following columns for each habit:

#### Longest Streak (Displayed)
- Calculates the longest consecutive streak within the displayed date range
- Only counts days that are visible in the current view
- If a streak continues beyond the visible range, only the visible portion is counted

#### Longest Streak (Ever)
- Calculates the longest consecutive streak across all entries in the habit file
- Not limited to the displayed date range
- Provides a historical view of your best streak

#### Total Days (Displayed)
- Shows: `entries_in_range / total_days_in_range`
- Displays as both fraction and percentage (e.g., "5/21 (23.8%)")
- Uses the earlier of: oldest displayed date or earliest entry date as the start date
- Only counts entries within the displayed date range

#### Total Days (Ever)
- Shows: `total_entries / days_since_oldest_entry`
- Displays as both fraction and percentage (e.g., "45/120 (37.5%)")
- Calculates from the oldest entry date to today
- Provides an overall completion rate

### 4. Perfect Days Statistics

Below the metrics table, two perfect day statistics are displayed:

#### Perfect Day Threshold
- Shows how many habits need to be completed for a day to be considered "perfect"
- Calculated as: `floor(perfectDayPercentage / 100 * total_habits)`
- Example: With 7 habits and 60% threshold = 4 habits required

#### Perfect Days (All Time)
- Counts all perfect days from the oldest entry date across all habits to today
- A day is perfect if at least the threshold number of habits have entries on that date

#### Perfect Days (Visible Days)
- Counts perfect days only within the displayed date range
- Uses the same threshold calculation as "All Time"

## Usage

### Basic Usage

```markdown
```habittrackermetrics
{
  "path": "habits"
}
```
```

### With Custom Settings

```markdown
```habittrackermetrics
{
  "path": "habits",
  "daysToShow": 30,
  "lastDisplayedDate": "2024-12-31",
  "perfectDayPercentage": 70,
  "debug": false
}
```
```

### Parameters

All parameters from `habittracker` are supported:

- `path` (string, required): Path to habit folder or file
- `daysToShow` (number, optional): Number of days to display (defaults to global setting)
- `lastDisplayedDate` (Date/string, optional): Last date to show (defaults to today)
- `perfectDayPercentage` (number, optional): Override global perfect day percentage (0-100)
- `debug` (boolean, optional): Enable debug logging

## Technical Implementation

### New Files Created

1. **`src/HabitTrackerMetrics.svelte`**
   - Main component for rendering the metrics table
   - Loads habits and calculates all metrics
   - Handles settings and date range calculations

2. **`src/HabitTrackerMetricsError.svelte`**
   - Error handling component for invalid codeblock configurations
   - Mirrors the error handling pattern from `HabitTrackerError.svelte`

### Modified Files

1. **`src/main.ts`**
   - Added `perfectDayPercentage` to `HabitTrackerSettings` interface
   - Added setting UI in `HabitTrackerSettingTab`
   - Registered new `habittrackermetrics` codeblock processor

2. **`src/utils.js`**
   - Added `calculateLongestStreakInRange()`: Calculates streaks within a date range
   - Added `calculateLongestStreakEver()`: Calculates longest streak across all entries
   - Added `calculateTotalDaysMetric()`: Calculates total days metrics (ever and displayed)
   - Added `calculatePerfectDays()`: Calculates perfect days statistics

3. **`styles.css`**
   - Added styles for `.habit-tracker-metrics` and related classes
   - Matches existing habit tracker design language
   - Responsive table layout with sticky first column
   - Removed width constraint from `.habit-tracker--match-line-length` to ensure consistent width behavior between both codeblocks

### Key Algorithms

#### Perfect Day Calculation
- Uses `Math.floor()` for threshold calculation (not `Math.ceil()`)
- Example: 60% of 7 habits = `floor(0.6 * 7)` = 4 habits required
- Counts dates where at least threshold number of habits have entries

#### Streak Calculation
- **In Range**: Iterates through date range, counts consecutive days with entries
- **Ever**: Sorts all entries, finds longest sequence of consecutive dates

#### Total Days Calculation
- **Displayed**: Uses earlier of (oldest displayed date, earliest entry) to end of displayed range
- **Ever**: Uses oldest entry date to today
- Both include the start and end dates (inclusive)

## Design Decisions

1. **Read-Only Display**: Metrics view is intentionally non-interactive to focus on analytics
2. **Consistent Styling**: Reuses existing CSS variables and design patterns
3. **Error Handling**: Mirrors existing error handling for consistency
4. **Settings Inheritance**: Supports both global and per-codeblock settings
5. **Date Range Logic**: Uses earlier of displayed start or entry start for displayed metrics
6. **Width Consistency**: Both `habittracker` and `habittrackermetrics` codeblocks now have consistent width behavior. I have adjusted the normal line width in my obsidian from 40 to 55. habittracker codeblock did not take up the full space.


## Examples

### Example Output

```
Habit                          | Longest Streak (Displayed) | Longest Streak (Ever) | Total Days (Displayed) | Total Days (Ever)
-------------------------------|---------------------------|----------------------|------------------------|------------------
🧘 Meditation                  | 5                         | 12                   | 8/21 (38.1%)           | 45/120 (37.5%)
💪 Daily Exercise              | 7                         | 15                   | 12/21 (57.1%)          | 89/120 (74.2%)
📚 Read Books                  | 3                         | 8                    | 5/21 (23.8%)           | 32/120 (26.7%)

Perfect Day Threshold: 4 of 7 habits required
Perfect Days (All Time): 45
Perfect Days (Visible Days): 8
```

## Testing Recommendations

1. Test with various date ranges and `daysToShow` values
2. Test with habits that have entries before/after displayed range
3. Test perfect day calculation with different percentages and habit counts
4. Test edge cases: empty habits, single habit, no entries
5. Verify threshold calculation with different percentages (especially edge cases like 0%, 100%)
6. Test error handling with invalid paths and malformed JSON

## Future Enhancements (Potential)

- Export metrics to CSV/JSON
- Additional metrics (average streak, completion rate trends)
- Date range picker for custom analysis periods
- Comparison between different time periods
- Visual charts/graphs for metrics

