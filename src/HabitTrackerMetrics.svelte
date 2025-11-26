<script lang="ts">
	import {debugLog, pluralize} from './utils'
	import {onMount, onDestroy} from 'svelte'
	import {
		calculateLongestStreakInRange,
		calculateLongestStreakEver,
		calculateTotalDaysMetric,
		calculatePerfectDays
	} from './utils.js'

	import {TFile, TFolder, parseYaml, type Plugin} from 'obsidian'
	import {getDateAsString} from './utils.js'
	import {
		eachDayOfInterval,
		format,
		parseISO,
		subDays,
	} from 'date-fns'

	// TypeScript interfaces
	interface HabitTrackerSettings {
		path: string
		lastDisplayedDate: string
		daysToShow: number
		debug: boolean
	}

	interface HabitData {
		[x: string]: any
		file: TFile
		entries: string[]
		name: string
		path: string
	}

	interface HabitMetrics {
		name: string
		path: string
		longestStreakDisplayed: number
		longestStreakEver: number
		totalDays: {
			ever: {
				fraction: string
				percentage: string
			}
			displayed: {
				fraction: string
				percentage: string
			}
		}
	}

	interface ComputedState {
		dates: string[]
		habits: HabitData[]
		metrics: HabitMetrics[]
		perfectDays: {
			allDays: number
			visibleDays: number
			threshold: number
			totalHabits: number
		}
	}

	interface UIState {
		fatalError: string
		habitSource: TFile | TFolder | null
	}

	interface HabitTrackerState {
		settings: HabitTrackerSettings
		computed: ComputedState
		ui: UIState
	}

	export let app: Plugin['app']
	export let pluginName: string
	export let globalSettings: {
		path: string
		daysToShow: number
		debug: boolean
		perfectDayPercentage: number
	}
	export let userSettings: Partial<{
		path: string
		lastDisplayedDate: Date
		daysToShow: number
		debug: boolean
		perfectDayPercentage: number
	}>

	// Default settings
	const createDefaultSettings = (): HabitTrackerSettings => ({
		path: globalSettings.path,
		lastDisplayedDate: getDateAsString(new Date()),
		daysToShow: globalSettings.daysToShow,
		debug: globalSettings.debug,
	})

	// Initialize unified state
	let state: HabitTrackerState = {
		settings: createDefaultSettings(),
		computed: {
			dates: [],
			habits: [],
			metrics: [],
			perfectDays: {
				allDays: 0,
				visibleDays: 0,
				threshold: 0,
				totalHabits: 0
			}
		},
		ui: {
			fatalError: '',
			habitSource: null,
		},
	}

	const init = async function (userSettings: Partial<HabitTrackerSettings>) {
		// Clean up path (remove trailing slash)
		if (userSettings.path) {
			userSettings.path = userSettings.path.replace(/\/$/, '')
		}

		// Merge user settings with defaults
		state.settings = {
			path: userSettings.path || state.settings.path,
			daysToShow: userSettings.daysToShow || state.settings.daysToShow,
			lastDisplayedDate:
				userSettings.lastDisplayedDate || state.settings.lastDisplayedDate,
			debug:
				userSettings.debug !== undefined
					? userSettings.debug
					: state.settings.debug,
		}

		// Validate essentials
		try {
			await validateEssentials(state.settings)
		} catch (error) {
			state.ui.fatalError = `Could not start: ${error.message}`
			console.error(`[${pluginName}] ${state.ui.fatalError}`)
			return
		}
		debugLog(state.settings, state.settings.debug)

		const firstDisplayedDate = getDateAsString(
			subDays(
				parseISO(state.settings.lastDisplayedDate),
				state.settings.daysToShow - 1,
			),
		)

		state.computed.dates = eachDayOfInterval({
			start: parseISO(firstDisplayedDate),
			end: parseISO(state.settings.lastDisplayedDate),
		}).map((date) => getDateAsString(date))

		debugLog(`Will show metrics for the following dates:`, state.settings.debug)
		debugLog(state.computed.dates, state.settings.debug)

		// Load habits
		const habitFiles = getHabits(state.settings.path)
		if (!habitFiles || habitFiles.length === 0) {
			state.ui.fatalError = `No habits found at "${state.settings.path}"`
			debugLog(
				`No habits found at ${state.settings.path}`,
				state.settings.debug,
				undefined,
				pluginName,
			)
			return
		}

		// Load entries for each habit
		state.computed.habits = []
		for (const file of habitFiles) {
			try {
				const habitData = await loadHabitData(file)
				if (habitData) {
					state.computed.habits.push(habitData)
				}
			} catch (error) {
				debugLog(
					`Error loading habit ${file.path}: ${error.message}`,
					state.settings.debug,
					undefined,
					pluginName,
				)
			}
		}

		if (state.computed.habits.length === 0) {
			state.ui.fatalError = `No valid habits found at "${state.settings.path}"`
			return
		}

		// Calculate metrics for each habit
		state.computed.metrics = state.computed.habits.map(habit => {
			const longestStreakDisplayed = calculateLongestStreakInRange(
				habit.entries,
				state.computed.dates
			)
			const longestStreakEver = calculateLongestStreakEver(habit.entries)
			const totalDays = calculateTotalDaysMetric(habit.entries, state.computed.dates)

			return {
				name: habit.name,
				path: habit.path,
				longestStreakDisplayed,
				longestStreakEver,
				totalDays
			}
		})

		// Calculate perfect days
		const perfectDayPercentage = userSettings.perfectDayPercentage !== undefined
			? userSettings.perfectDayPercentage
			: globalSettings.perfectDayPercentage

		const perfectDaysResult = calculatePerfectDays(
			state.computed.habits,
			perfectDayPercentage,
			state.computed.dates
		)

		// Calculate threshold (number of habits needed for perfect day)
		const totalHabits = state.computed.habits.length
		const perfectDayThreshold = Math.floor((perfectDayPercentage / 100) * totalHabits)

		state.computed.perfectDays = {
			...perfectDaysResult,
			threshold: perfectDayThreshold,
			totalHabits: totalHabits
		}

		debugLog(`Metrics calculation completed successfully`, state.settings.debug)
	}

	const validateEssentials = async function (
		settings: Partial<HabitTrackerSettings>,
	) {
		if (!settings.path) {
			throw new Error('path is required - where should I load habits from?')
		}

		const source = app.vault.getAbstractFileByPath(settings.path)
		if (!source) {
			const mdSource = app.vault.getAbstractFileByPath(`${settings.path}.md`)
			if (!mdSource) {
				throw new Error(`"${settings.path}" doesn't exist in your vault`)
			}
		}

		debugLog(`Final settings are valid ↴`, state.settings.debug)
		return true
	}

	const getHabits = function (path: string): TFile[] {
		debugLog(`Loading habits`, state.settings.debug)
		state.ui.habitSource = app.vault.getAbstractFileByPath(path)

		if (state.ui.habitSource && state.ui.habitSource instanceof TFolder) {
			const allItems = state.ui.habitSource.children
			const filesOnly = allItems.filter((item) => item instanceof TFile)
			const count = filesOnly.length
			debugLog(
				`"${path}" points to a folder with ${count} ${pluralize(count, 'file')} inside`,
				state.settings.debug,
				undefined,
				pluginName,
			)
			const sortedFiles = filesOnly.sort((a, b) => a.basename.localeCompare(b.basename))
			return sortedFiles as TFile[]
		}

		if (state.ui.habitSource && state.ui.habitSource instanceof TFile) {
			debugLog(`${path} points to a file`, state.settings.debug)
			return [state.ui.habitSource as TFile]
		}

		state.ui.habitSource = app.vault.getAbstractFileByPath(`${path}.md`)
		if (state.ui.habitSource) {
			debugLog(
				`Adjusted ${path} to ${path}.md and found a file`,
				state.settings.debug,
				undefined,
				pluginName,
			)
			return [state.ui.habitSource as TFile]
		}

		debugLog(`${path} is not found`, state.settings.debug)
		return []
	}

	const loadHabitData = async function (file: TFile): Promise<HabitData | null> {
		try {
			const content = await app.vault.read(file)
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
			
			let entries: string[] = []
			let name = file.basename

			if (frontmatterMatch) {
				const frontmatter = parseYaml(frontmatterMatch[1])
				entries = frontmatter?.entries || []
				name = frontmatter?.title || name
			}

			// Sort entries
			entries = entries.sort()

			return {
				file,
				entries,
				name,
				path: file.path
			}
		} catch (error) {
			debugLog(
				`Error loading habit ${file.path}: ${error.message}`,
				state.settings.debug,
				undefined,
				pluginName,
			)
			return null
		}
	}

	// Listen for settings refresh events
	let refreshEventListener: (event: CustomEvent) => void

	onMount(() => {
		debugLog('Component mounted, setting up refresh listener')
		refreshEventListener = (event: CustomEvent) => {
			console.log(
				'[HabitTrackerMetrics] Refresh event received:',
				event.detail.settings,
			)
			globalSettings = event.detail.settings
			state.settings = createDefaultSettings()
			console.log('[HabitTrackerMetrics] Calling init with updated settings')
			init(userSettings)
		}

		document.addEventListener('habit-tracker-refresh', refreshEventListener)
		debugLog('Refresh event listener added to document')
	})

	onDestroy(() => {
		if (refreshEventListener) {
			document.removeEventListener(
				'habit-tracker-refresh',
				refreshEventListener,
			)
		}
	})

	init(userSettings)
</script>

{#if state.ui.fatalError}
	<div>
		<strong>🛑 {pluginName}</strong>
	</div>
	{state.ui.fatalError}
{:else if !state.computed.metrics.length}
	<div>
		<strong>😕 {pluginName}</strong>
	</div>
	No habits to show at "{state.settings.path}"
{:else}
	<div class="habit-tracker-metrics">
		<table class="habit-tracker-metrics__table">
			<thead>
				<tr>
					<th class="habit-tracker-metrics__cell habit-tracker-metrics__cell--header">Habit</th>
					<th class="habit-tracker-metrics__cell habit-tracker-metrics__cell--header">Longest Streak (Displayed)</th>
					<th class="habit-tracker-metrics__cell habit-tracker-metrics__cell--header">Longest Streak (Ever)</th>
					<th class="habit-tracker-metrics__cell habit-tracker-metrics__cell--header">Total Days (Displayed)</th>
					<th class="habit-tracker-metrics__cell habit-tracker-metrics__cell--header">Total Days (Ever)</th>
				</tr>
			</thead>
			<tbody>
				{#each state.computed.metrics as metric}
					<tr>
						<td class="habit-tracker-metrics__cell habit-tracker-metrics__cell--name">
							<a
								href={metric.path}
								aria-label={metric.path}
								class="internal-link">{metric.name}</a>
						</td>
						<td class="habit-tracker-metrics__cell habit-tracker-metrics__cell--number">
							{metric.longestStreakDisplayed}
						</td>
						<td class="habit-tracker-metrics__cell habit-tracker-metrics__cell--number">
							{metric.longestStreakEver}
						</td>
						<td class="habit-tracker-metrics__cell habit-tracker-metrics__cell--number">
							{metric.totalDays.displayed.fraction} ({metric.totalDays.displayed.percentage})
						</td>
						<td class="habit-tracker-metrics__cell habit-tracker-metrics__cell--number">
							{metric.totalDays.ever.fraction} ({metric.totalDays.ever.percentage})
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<div class="habit-tracker-metrics__perfect-days">
			<div class="habit-tracker-metrics__perfect-days-threshold">
				<strong>Perfect Day Threshold:</strong> {state.computed.perfectDays.threshold} of {state.computed.perfectDays.totalHabits} habits required
			</div>
			<div class="habit-tracker-metrics__perfect-days-item">
				<strong>Perfect Days (All Time):</strong> {state.computed.perfectDays.allDays}
			</div>
			<div class="habit-tracker-metrics__perfect-days-item">
				<strong>Perfect Days (Visible Days):</strong> {state.computed.perfectDays.visibleDays}
			</div>
		</div>
	</div>
{/if}

