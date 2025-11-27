<script>
	import {
		debugLog,
		isValidCSSColor,
		resolveStreakFreezeDays,
		resolveMaxFreezesPerWeek,
		resolveFreezePenalty,
		computeFreezeDates,
		isGapFrozen,
		countFrozenDays,
	} from './utils'

	import {parseYaml, TFile} from 'obsidian'
	import {getDateAsString, getDayOfTheWeek} from './utils'
	import {addDays, parseISO, differenceInCalendarDays} from 'date-fns'

	export let app
	export let name
	export let path
	export let dates
	export let debug
	export let pluginName
	export let userSettings
	export let globalSettings

	let entries = []
	let frontmatter = {}
	let habitName = name
	let customStyles = ''
	let habitFreezeDays = 0
	let habitMaxFreezes = 0
	let freezePenalty = 0
	let freezeEmoji = '❄️'
	let entriesInRange = {}

	// Reactive color resolution - updates whenever frontmatter, userSettings, or globalSettings change
	$: {
		const resolvedColor = frontmatter.color || userSettings.color || globalSettings.defaultColor
		if (resolvedColor && isValidCSSColor(resolvedColor)) {
			customStyles = `--habit-bg-ticked: ${resolvedColor}`
		} else {
			customStyles = ''
		}
	}
	$: freezeEmoji = ((userSettings?.streakFreezeEmoji ?? globalSettings.streakFreezeEmoji) || '❄️').trim() || '❄️'
	$: habitFreezeDays = resolveStreakFreezeDays(
		frontmatter?.streak_freeze,
		globalSettings.streakFreezeDays,
	)
	$: habitMaxFreezes = resolveMaxFreezesPerWeek(
		frontmatter?.max_freezes,
		globalSettings.maxFreezesPerWeek,
	)
	$: freezePenalty = resolveFreezePenalty(
		frontmatter?.freeze_penalty,
		globalSettings.freezePenalty,
	)
	$: entriesInRange = buildEntriesInRange(
		dates,
		entries,
		habitFreezeDays,
		habitMaxFreezes,
		freezePenalty,
	)

	let savingChanges = false

	$: getClasses = function (date) {
		const cellState = getCellState(date)
		let classes = [
			'habit-tracker__cell',
			`habit-tracker__cell--${getDayOfTheWeek(date)}`,
			'habit-tick',
		]

		if (cellState.ticked) {
			classes.push('habit-tick--ticked')
		}

		if (cellState.isFreeze) {
			classes.push('habit-tick--freeze')
			return classes.join(' ')
		}

		// Only add streak classes if streaks are enabled
		const showStreaksEnabled = userSettings.showStreaks !== undefined ? userSettings.showStreaks : globalSettings.showStreaks
		if (showStreaksEnabled) {
			const streak = cellState.streak
			if (streak) {
				classes.push('habit-tick--streak')
			}
			if (streak == 1) {
				classes.push('habit-tick--streak-start')
			}

			let isNextDayTicked = false
			const nextDate = getDateAsString(addDays(parseISO(date), 1))
			if (date === dates[dates.length - 1]) {
				// last in the dates in range
				isNextDayTicked = entries.includes(nextDate)
			} else {
				isNextDayTicked = entriesInRange[nextDate]?.ticked
			}

			if (cellState.ticked && !isNextDayTicked) {
				classes.push('habit-tick--streak-end')
			}
		}

		return classes.join(' ')
	}

	const buildEntriesInRange = function (
		dateRange,
		habitEntries,
		freezeDays,
		maxFreezesPerWeek,
		penaltyValue,
	) {
		if (!dateRange || !dateRange.length) {
			return {}
		}

		const displayDates = [...dateRange].sort()
		const displayDateSet = new Set(displayDates)
		const sortedEntries = [...habitEntries].sort()
		const entrySet = new Set(sortedEntries)
		const freezeDates = computeFreezeDates(sortedEntries, freezeDays, maxFreezesPerWeek)

		const firstDisplayDate = parseISO(displayDates[0])
		const lastDisplayDate = parseISO(displayDates[displayDates.length - 1])
		const earliestEntryCandidate = sortedEntries.length
			? parseISO(sortedEntries[0])
			: null
		const startDate =
			earliestEntryCandidate && earliestEntryCandidate < firstDisplayDate
				? earliestEntryCandidate
				: firstDisplayDate
		const result = {}

		let cursor = new Date(startDate)
		let lastTickDate = null
		let streakValue = 0

		while (cursor <= lastDisplayDate) {
			const cursorStr = getDateAsString(cursor)
			const ticked = entrySet.has(cursorStr)
			let isFreeze = freezeDates.has(cursorStr)
			let displayStreak = 0

			if (ticked) {
				if (!lastTickDate) {
					streakValue = 1
				} else {
					const lastTickStr = getDateAsString(lastTickDate)
					const currentStr = getDateAsString(cursor)
					const gapBridged = isGapFrozen(lastTickStr, currentStr, freezeDates)
					if (gapBridged) {
						const frozenDays = penaltyValue
							? countFrozenDays(lastTickStr, currentStr, freezeDates)
							: 0
						const penaltyAmount = penaltyValue * frozenDays
						streakValue = Math.max(1, streakValue + 1 - penaltyAmount)
					} else {
						streakValue = 1
					}
				}
				displayStreak = streakValue
				lastTickDate = new Date(cursor)
				isFreeze = false
			} else if (lastTickDate && isFreeze) {
				displayStreak = streakValue
			} else if (lastTickDate) {
				lastTickDate = null
				streakValue = 0
			}

			if (displayDateSet.has(cursorStr)) {
				result[cursorStr] = {
					ticked,
					streak: displayStreak,
					isFreeze,
				}
			}

			cursor.setDate(cursor.getDate() + 1)
		}

		displayDates.forEach((date) => {
			if (!result[date]) {
				result[date] = {
					ticked: false,
					streak: 0,
					isFreeze: false,
				}
			}
		})

		return result
	}

	const getCellState = function (date) {
		return (
			entriesInRange[date] || {
				ticked: false,
				streak: 0,
				isFreeze: false,
			}
		)
	}


	const init = async function () {
		debugLog(`Loading habit ${habitName}`, debug, undefined, pluginName)

		const getFrontmatter = async function (path) {
			const file = this.app.vault.getAbstractFileByPath(path)

			if (!file || !(file instanceof TFile)) {
				debugLog(
					`No file found for path: ${path}`,
					debug,
					undefined,
					pluginName,
				)
				return {}
			}

			try {
				return await this.app.vault.read(file).then((result) => {
					const frontmatter = result.split('---')[1]

					if (!frontmatter){
						return {"entries": []};
					}
					fmParsed = parseYaml(frontmatter)
					if(fmParsed["entries"] == undefined){
						fmParsed["entries"] = [];
					}
					
					return fmParsed;
				})
			} catch (error) {
				debugLog(
					`Error in habit ${habitName}: error.message`,
					debug,
					undefined,
					pluginName,
				)
				return {}
			}
		}

		frontmatter = await getFrontmatter(path)
		debugLog(`Frontmatter for ${path} ↴`, debug)
		debugLog(frontmatter, debug)
		entries = frontmatter.entries
		entries = entries.sort()
		habitName = frontmatter.title || habitName


		debugLog(`Habit "${habitName}": Found ${entries.length} entries`, debug)
		debugLog(entries, debug, undefined, pluginName)

		// TODO though this looks to be performing ok, i think i should set the watchers more efficiently
		app.vault.on('modify', (file) => {
			if (file.path === path) {
				if (!savingChanges) {
					console.log('oh shit, i was modified')
					init()
				}
				savingChanges = false
			}
		})
	}

	const toggleHabit = function (date) {
		const file = this.app.vault.getAbstractFileByPath(path)
		if (!file || !(file instanceof TFile)) {
			new Notice(`${pluginName}: file missing while trying to toggle habit`)
			return
		}

		const cellState = getCellState(date)
		const isTicked = cellState.ticked

		let newEntries = [...entries]
		if (isTicked) {
			newEntries = newEntries.filter((e) => e !== date)
		} else {
			newEntries.push(date)
		}
		entries = newEntries.sort()

		savingChanges = true

		this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter['entries'] = entries
		})
	}

	init()
</script>

<!-- <div bind:this={rootElement}> -->
<div class="habit-tracker__row" style={customStyles}>
	<div class="habit-tracker__cell--name habit-tracker__cell">
		<a
			href={path}
			aria-label={path}
			class="internal-link">{habitName}</a
		>
	</div>
	{#if Object.keys(entriesInRange).length}
		{#each dates as date}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<div
				class={getClasses(date)}
				ticked={entriesInRange[date]?.ticked}
				streak={entriesInRange[date]?.streak}
				data-freeze={entriesInRange[date]?.isFreeze ? 'true' : 'false'}
				on:click={() => toggleHabit(date)}
			>
				{#if entriesInRange[date]?.isFreeze}
					<span class="habit-tick__freeze-emoji" aria-label="Streak frozen">{freezeEmoji}</span>
				{/if}
			</div>
		{/each}
	{/if}
</div>
