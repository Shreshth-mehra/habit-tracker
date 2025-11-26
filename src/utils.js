import {
	format,
	parseISO,
	isToday,
} from 'date-fns';

const getDateAsString = function(date) {
	const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'yyyy-MM-dd')
}

const getDayOfTheWeek = function(date) {
	return format(parseISO(date),'EEEE').toLowerCase();
}

// TODO make it somehow that i don't have to pass the debug level every time?
// TODO add different levels of debugging, store them in a object or something so they have labels maybe?
const debugLog = function(message, currentDebugLevel, requiredLevel, pluginName = 'Habit Tracker 21') {
	if(!currentDebugLevel) return null;

	if(requiredLevel && requiredLevel!==currentDebugLevel) return null;

	console.log(`[${pluginName}]`, message);
}

const pluralize = function(count, singular, plural) {
	if (count === 1) return singular
	return plural || singular + 's'
}

const renderPrettyDate = function (dateString) {
		// Parse the input date string into a Date object
		const date = parseISO(dateString)

		// Format the date using date-fns
		let prettyDate = format(date, 'MMMM d, yyyy')

		if (isToday(date)) {
			prettyDate = `Today, ${prettyDate}`
		}

		return prettyDate
	}

const isValidCSSColor = function (color) {
	if (!color) return false
	const tempEl = document.createElement('div')
	tempEl.style.color = color
	return tempEl.style.color !== ''
}

const calculateLongestStreakInRange = function (entries, dateRange) {
	if (!entries || entries.length === 0 || !dateRange || dateRange.length === 0) {
		return 0;
	}

	// Convert entries to Set for faster lookup
	const entrySet = new Set(entries);
	
	let maxStreak = 0;
	let currentStreak = 0;

	// Iterate through the date range
	for (const date of dateRange) {
		if (entrySet.has(date)) {
			currentStreak++;
			maxStreak = Math.max(maxStreak, currentStreak);
		} else {
			currentStreak = 0;
		}
	}

	return maxStreak;
}

const calculateLongestStreakEver = function (entries) {
	if (!entries || entries.length === 0) {
		return 0;
	}

	// Sort entries chronologically
	const sortedEntries = [...entries].sort();
	
	let maxStreak = 1;
	let currentStreak = 1;

	for (let i = 1; i < sortedEntries.length; i++) {
		const prevDate = parseISO(sortedEntries[i - 1]);
		const currDate = parseISO(sortedEntries[i]);
		
		// Calculate days difference
		const daysDiff = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
		
		if (daysDiff === 1) {
			// Consecutive day
			currentStreak++;
			maxStreak = Math.max(maxStreak, currentStreak);
		} else {
			// Streak broken
			currentStreak = 1;
		}
	}

	return maxStreak;
}

const calculateTotalDaysMetric = function (entries, dateRange) {
	if (!entries || entries.length === 0) {
		return { 
			ever: { fraction: '0/0', percentage: '0%', entries: 0, totalDays: 0 },
			displayed: { fraction: '0/0', percentage: '0%', entries: 0, totalDays: 0 }
		};
	}

	const entryCount = entries.length;
	const sortedEntries = [...entries].sort();
	const oldestEntry = parseISO(sortedEntries[0]);
	const today = new Date();
	
	// Calculate total days from oldest entry to today (inclusive) - Ever
	const totalDaysEver = Math.max(1, Math.round((today - oldestEntry) / (1000 * 60 * 60 * 24)) + 1);
	const percentageEver = totalDaysEver > 0 ? ((entryCount / totalDaysEver) * 100).toFixed(1) : '0';
	
	// Calculate displayed days metric
	let totalDaysDisplayed = 0;
	let percentageDisplayed = '0';
	let displayedEntryCount = 0;
	
	if (dateRange && dateRange.length > 0) {
		// Find the earliest entry date
		const earliestEntryDate = sortedEntries[0];
		
		// Find the oldest displayed date
		const sortedDateRange = [...dateRange].sort();
		const oldestDisplayedDate = sortedDateRange[0];
		
		// Use the earlier of: oldest displayed date or earliest entry date
		const startDate = earliestEntryDate < oldestDisplayedDate ? earliestEntryDate : oldestDisplayedDate;
		const endDate = sortedDateRange[sortedDateRange.length - 1];
		
		const startDateObj = parseISO(startDate);
		const endDateObj = parseISO(endDate);
		
		// Calculate total days from start to end (inclusive)
		totalDaysDisplayed = Math.max(1, Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1);
		
		// Count entries within the displayed range
		const dateRangeSet = new Set(dateRange);
		displayedEntryCount = entries.filter(entry => dateRangeSet.has(entry)).length;
		
		percentageDisplayed = totalDaysDisplayed > 0 ? ((displayedEntryCount / totalDaysDisplayed) * 100).toFixed(1) : '0';
	}
	
	return {
		ever: {
			fraction: `${entryCount}/${totalDaysEver}`,
			percentage: `${percentageEver}%`,
			entries: entryCount,
			totalDays: totalDaysEver
		},
		displayed: {
			fraction: `${displayedEntryCount}/${totalDaysDisplayed}`,
			percentage: `${percentageDisplayed}%`,
			entries: displayedEntryCount,
			totalDays: totalDaysDisplayed
		}
	};
}

const calculatePerfectDays = function (habitsData, percentage, dateRange) {
	if (!habitsData || habitsData.length === 0) {
		return { allDays: 0, visibleDays: 0 };
	}

	const totalHabits = habitsData.length;
	const threshold = Math.floor((percentage / 100) * totalHabits);
	
	// Find the oldest entry date across all habits
	let oldestDate = null;
	
	habitsData.forEach(habit => {
		if (habit.entries && habit.entries.length > 0) {
			habit.entries.forEach(entryDate => {
				if (!oldestDate || entryDate < oldestDate) {
					oldestDate = entryDate;
				}
			});
		}
	});

	if (!oldestDate) {
		return { allDays: 0, visibleDays: 0 };
	}

	// Generate all dates from oldest entry to today
	const today = new Date();
	const oldestDateObj = parseISO(oldestDate);
	const allDates = [];
	
	let currentDate = new Date(oldestDateObj);
	while (currentDate <= today) {
		allDates.push(getDateAsString(currentDate));
		currentDate.setDate(currentDate.getDate() + 1);
	}

	// Create a map of date -> count of habits with entries on that date
	const allDateCounts = new Map();
	const visibleDateCounts = new Map();
	const visibleDateSet = new Set(dateRange || []);

	// Initialize all dates
	allDates.forEach(date => {
		allDateCounts.set(date, 0);
	});

	if (dateRange && dateRange.length > 0) {
		dateRange.forEach(date => {
			visibleDateCounts.set(date, 0);
		});
	}

	// Count entries for each habit
	habitsData.forEach(habit => {
		if (habit.entries && habit.entries.length > 0) {
			habit.entries.forEach(entryDate => {
				// Count for all days
				if (allDateCounts.has(entryDate)) {
					allDateCounts.set(entryDate, allDateCounts.get(entryDate) + 1);
				}
				
				// Count for visible days only
				if (visibleDateSet.has(entryDate)) {
					visibleDateCounts.set(entryDate, visibleDateCounts.get(entryDate) + 1);
				}
			});
		}
	});

	// Count perfect days
	let allDaysPerfect = 0;
	let visibleDaysPerfect = 0;

	allDateCounts.forEach((count, date) => {
		if (count >= threshold) {
			allDaysPerfect++;
		}
	});

	visibleDateCounts.forEach((count, date) => {
		if (count >= threshold) {
			visibleDaysPerfect++;
		}
	});

	return {
		allDays: allDaysPerfect,
		visibleDays: visibleDaysPerfect
	};
}

export {
	getDateAsString,
	getDayOfTheWeek,
	debugLog,
	renderPrettyDate,
	pluralize,
	isValidCSSColor,
	calculateLongestStreakInRange,
	calculateLongestStreakEver,
	calculateTotalDaysMetric,
	calculatePerfectDays
};
