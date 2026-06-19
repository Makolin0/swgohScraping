import puppeteer from 'puppeteer'
import { KnownDevices } from 'puppeteer'
import cliProgress from 'cli-progress'
import fs from 'fs'
import path from 'path'

const iPhone = KnownDevices['iPhone 13']

// =====
// setup
// =====

const browser = await puppeteer.launch()
const page = await browser.newPage()
await page.emulate(iPhone)

const multibar = new cliProgress.MultiBar(
	{
		clearOnComplete: false,
		hideCursor: true,
		format: ' {bar} | {percentage}% | {value}/{total} | {msg}'
	},
	cliProgress.Presets.shades_grey
)

if (process.argv.length !== 4) {
	console.log('Usage: node script.js <player|guild> <id>')
	process.exit(1)
}

const type = process.argv[2]
const id = process.argv[3]

// =========
// helpers
// =========

// Cleanly escapes CSV fields that might contain commas or quotes (like character names)
const convertToCSV = (units) => {
	const headers = [
		'name',
		'power',
		'zeta',
		'relic',
		'rarity',
		'omnicron',
		'gear'
	]
	const csvRows = [headers.join(',')]

	for (const unit of units) {
		const values = headers.map((header) => {
			const val =
				unit[header] === null || unit[header] === undefined ? '' : unit[header]
			// If the value is a string and contains commas/quotes, wrap it in quotes
			if (
				typeof val === 'string' &&
				(val.includes(',') || val.includes('"') || val.includes('\n'))
			) {
				return `"${val.replace(/"/g, '""')}"`
			}
			return val
		})
		csvRows.push(values.join(','))
	}

	return csvRows.join('\n')
}

const savePlayerCSV = (playerData) => {
	const outputDir = './output_csv'
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true })
	}

	// Sanitize player name for file systems
	const safeName = playerData.playerName
		.replace(/[^a-z0-9_-]/gi, '_')
		.toLowerCase()
	const filePath = path.join(outputDir, `${safeName}_units.csv`)

	const csvContent = convertToCSV(playerData.units)
	fs.writeFileSync(filePath, csvContent, 'utf8')
}

// =========
// functions
// =========

const generateUnitData = async (playerId, unitId) => {
	try {
		await page.goto(`https://swgoh.gg/p/${playerId}/unit/${unitId}/`, {
			waitUntil: 'domcontentloaded'
		})

		const name = await page.$eval('.unit-card__name', (e) =>
			e.textContent.trim()
		)

		const zeta = await page.$$eval('.character-portrait__zeta', (els) => {
			return els.length > 0 ? parseInt(els[0].textContent.trim()) || 0 : 0
		})

		const relic = await page.$$eval('.relic-badge', (els) => {
			return els.length > 0 ? parseInt(els[0].textContent.trim()) || 0 : 0
		})

		const rarity = await page.$eval('.rarity-range', (e) =>
			parseInt(e.childElementCount)
		)

		const omnicron = await page.$$eval(
			'.character-portrait__omicron',
			(els) => {
				return els.length > 0 ? parseInt(els[0].textContent.trim()) || 0 : 0
			}
		)

		const power = await page.$eval('.stat-table-data', (e) => {
			const firstChild = e.firstElementChild
			if (!firstChild) return null
			const nestedFirstChild = firstChild.firstElementChild
			if (!nestedFirstChild) return null
			const targetChild = nestedFirstChild.children[1]
			return targetChild
				? parseInt(targetChild.textContent.trim().replace(/,/g, ''), 10)
				: null
		})

		const gear = await page.$eval('.character-portrait__primary', (e) => {
			return e.getElementsByClassName('character-portrait__rframe')[0]
				? 13
				: parseInt(
						e
							?.getElementsByClassName('character-portrait__gframe')[0]
							?.classList[1].split('tier-')[1]
					) || 0
		})

		return { name, power, zeta, relic, rarity, omnicron, gear }
	} catch (error) {
		multibar.log(`Failed to fetch data for unit ${unitId}: ${error.message}\n`)
		return null
	}
}

const generatePlayerData = async (playerId) => {
	const playerBar = multibar.create(0, 0, {
		msg: `Fetching player roster...`
	})

	await page.goto(`https://swgoh.gg/p/${playerId}/characters/`, {
		waitUntil: 'domcontentloaded'
	})

	const { unitIds, playerName } = await page.$$eval(
		'a',
		(links, id) => {
			const pattern = new RegExp(`^/p/${id}/unit/([^/]+)/?$`)
			const targetProfileHref = `/p/${id}/`

			let detectedName = null
			const ids = []

			links.forEach((link) => {
				const href = link.getAttribute('href')
				const hasClass = link.getAttribute('class') !== null
				if (!href) return

				if (href === targetProfileHref && !hasClass) {
					detectedName = link.innerText.trim()
				}

				if (pattern.test(href)) {
					ids.push(href.match(pattern)[1])
				}
			})

			return { unitIds: ids, playerName: detectedName }
		},
		playerId
	)

	const uniqueUnitIds = [...new Set(unitIds)]

	if (playerBar) {
		playerBar.start(uniqueUnitIds.length, 0, {
			msg: `Player ${playerName || playerId}`
		})
	}

	const unitsData = []

	for (const unitId of uniqueUnitIds) {
		const data = await generateUnitData(playerId, unitId)
		if (data) {
			unitsData.push(data)
		}
		if (playerBar) {
			playerBar.increment(1)
		}
	}

	multibar.remove(playerBar)

	const resultData = {
		playerName: playerName || `Unknown_${playerId}`,
		units: unitsData
	}

	// Save single player file immediately
	savePlayerCSV(resultData)

	return resultData
}

const generateGuildData = async (guildId) => {
	await page.goto(`https://swgoh.gg/g/${guildId}/`, {
		waitUntil: 'domcontentloaded'
	})

	const guildName = await page.$eval('h1', (e) => {
		return e.textContent.trim()
	})

	const playerIds = await page.$$eval('a', (links) => {
		const pattern = new RegExp('^/p/([^/]+)/?$')
		return links
			.map((link) => link.getAttribute('href'))
			.filter((href) => href && pattern.test(href))
			.map((href) => href.match(pattern)[1])
	})

	const uniquePlayerIds = [...new Set(playerIds)]

	const guildBar = multibar.create(uniquePlayerIds.length, 0, {
		msg: `Total Guild Progress: ${guildName}`
	})

	const guildData = []

	for (const playerId of uniquePlayerIds) {
		// FIXED: Removed undefined 'playerBar' argument passing
		const data = await generatePlayerData(playerId)
		if (data) {
			guildData.push(data)
		}

		guildBar.increment(1)
	}

	multibar.stop()
	return guildData
}

// ====
// run
// ====

let result = null // FIXED: Changed from const to let so it can be reassigned

switch (type) {
	case 'player':
		result = await generatePlayerData(id)
		break
	case 'guild':
		result = await generateGuildData(id)
		break
	default:
		console.log('unknown type')
		process.exit(1)
}

await browser.close()

const totalPlayersSaved = Array.isArray(result) ? result.length : 1
console.log(
	`\nSuccessfully saved data for ${totalPlayersSaved} player(s) as CSV files inside './output_csv/'`
)
