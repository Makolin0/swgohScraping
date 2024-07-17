const puppeteer = require("puppeteer");
const { KnownDevices } = require("puppeteer");
const iPhone = KnownDevices["iPhone 13"];

const generatePlayerCSV = async (link, page) => {
	const targetURL = link + "characters/?sort=name";

	// // Launch the headless browser
	// const browser = await puppeteer.launch();

	// // Create a page
	// const page = await browser.newPage();
	// await page.emulate(iPhone);

	// Go to your site
	await page.goto(targetURL);
	console.log("Page loaded");

	const playerName = await page.$eval(".m-0", (e) => {
		return e.textContent.split("'s ")[0];
	});

	// scrape all at once
	const data = await page.$$eval(".unit-card__primary", (cards) => {
		return cards.map((card) => {
			const name = card
				.getElementsByClassName("unit-card__content")[0]
				.getElementsByClassName("unit-card__name")[0]
				.textContent.trim();

			const portrait = card
				.getElementsByClassName("unit-card__portrait")[0]
				.getElementsByClassName("character-portrait")[0]
				.getElementsByTagName("div")[0]
				.getElementsByClassName("character-portrait__primary")[0];

			const relic =
				parseInt(
					portrait
						?.getElementsByClassName("character-portrait__relic")[0]
						?.getElementsByClassName("relic-badge")[0]
						?.getElementsByTagName("svg")[0]
						?.getElementsByTagName("text")[0]?.textContent
				) || 0;

			const gear = portrait?.getElementsByClassName(
				"character-portrait__rframe"
			)[0]
				? 13
				: parseInt(
						portrait
							?.getElementsByClassName("character-portrait__gframe")[0]
							?.classList[1].split("tier-")[1]
				  );

			const level =
				parseInt(
					portrait
						?.getElementsByClassName("character-portrait__level")[0]
						?.getElementsByTagName("svg")[0]
						?.getElementsByTagName("text")[0].textContent
				) || 85;

			const zeta =
				parseInt(
					portrait
						?.getElementsByClassName("character-portrait__zeta")[0]
						?.getElementsByTagName("svg")[0]
						?.getElementsByTagName("text")[0].textContent
				) || 0;

			const omnicron =
				parseInt(
					portrait
						?.getElementsByClassName("character-portrait__omicron")[0]
						?.getElementsByTagName("svg")[0]
						?.getElementsByTagName("text")[0].textContent
				) || 0;

			return [name, level, gear, relic, zeta, omnicron];
		});
	});
	console.log(data);

	let csvContent =
		"name,level,gear,relic,zeta,omnicron,\n" +
		data.map((e) => e.join(";")).join("\n");

	// Define the file path where you want to save the CSV
	const filePath = playerName + ".csv";

	const fs = require("fs");
	// Write the CSV string to the file
	fs.writeFile(filePath, csvContent, "utf8", (err) => {
		if (err) {
			console.error("Error writing the file:", err);
		} else {
			console.log("File saved successfully!");
		}
	});
};

const generateGuildCSV = async () => {
	const targetURL = "https://swgoh.gg/g/4snJvbTlT6KgeMo-B-8ETg/";

	// Launch the headless browser
	const browser = await puppeteer.launch();

	// Create a page
	const page = await browser.newPage();
	await page.emulate(iPhone);

	// Go to your site
	await page.goto(targetURL);

	const players = await page.$eval(".data-table", (table) => {
		const players = table
			.getElementsByTagName("tbody")[0]
			.getElementsByTagName("tr");

		return Array.from(players).map((player) => {
			return player.getElementsByTagName("td")[0].getElementsByTagName("a")[0]
				.href;
		});

		return players[1].getElementsByTagName("td")[0].getElementsByTagName("a")[0]
			.href;
	});

	console.log(players);
	console.log(players.length);

	for (i = 0; i < players.length; i++) {
		await generatePlayerCSV(players[i], page);
	}

	// await players.forEach((link) => {
	// 	generatePlayerCSV(link, page);
	// });

	// Close browser
	await browser.close();
};

// download user id from guild
// download characters for every player in guild

// generatePlayerCSV(PLAYER_ID);
generateGuildCSV();
