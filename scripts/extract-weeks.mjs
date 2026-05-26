import fs from "node:fs";

const payoutRatios = {
  15: 0.45,
  14: 0.25,
  13: 0.18,
  12: 0.12,
};

const weeklyPools = [
  9850000,
  12400000,
  7600000,
  18400000,
  15100000,
  21350000,
  16800000,
];

const weeklyWinners = [
  { 15: 3, 14: 27, 13: 224, 12: 1680 },
  { 15: 1, 14: 18, 13: 173, 12: 1412 },
  { 15: 4, 14: 33, 13: 256, 12: 1944 },
  { 15: 0, 14: 21, 13: 198, 12: 1550 },
  { 15: 2, 14: 29, 13: 237, 12: 1830 },
  { 15: 1, 14: 14, 13: 142, 12: 1218 },
  { 15: 2, 14: 24, 13: 205, 12: 1695 },
];

function readCsv(path, leagueName) {
  const lines = fs.readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  const index = Object.fromEntries(headers.map((name, idx) => [name, idx]));

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return {
      date: cells[index.Date],
      time: cells[index.Time],
      league: leagueName,
      home: cells[index.HomeTeam],
      away: cells[index.AwayTeam],
      homeGoals: Number(cells[index.FTHG]),
      awayGoals: Number(cells[index.FTAG]),
      result: resultCode(cells[index.FTR]),
    };
  }).filter((match) => match.home && Number.isFinite(match.homeGoals));
}

function resultCode(ftr) {
  if (ftr === "H") return "1";
  if (ftr === "D") return "X";
  return "2";
}

function isoDate(date) {
  const [day, month, year] = date.split("/");
  return `${year}-${month}-${day}`;
}

function formatFixture(match, weekIndex, matchIndex) {
  return {
    id: `W${weekIndex + 1}-${String(matchIndex + 1).padStart(2, "0")}`,
    league: match.league,
    date: isoDate(match.date),
    time: match.time,
    home: match.home,
    away: match.away,
    score: `${match.homeGoals}-${match.awayGoals}`,
    result: match.result,
  };
}

function categoryRows(pool, winners) {
  return Object.keys(payoutRatios).sort((a, b) => Number(b) - Number(a)).map((key) => {
    const categoryPool = Math.round(pool * payoutRatios[key]);
    const winnerCount = winners[key];
    return {
      correct: Number(key),
      winners: winnerCount,
      sharedPrize: categoryPool,
      prizePerWinner: winnerCount > 0 ? Math.floor(categoryPool / winnerCount) : 0,
    };
  });
}

const epl = readCsv("data/epl-2025-26.csv", "Premier League");
const laliga = readCsv("data/laliga-2025-26.csv", "La Liga");

const weeks = Array.from({ length: 7 }, (_, weekIndex) => {
  const eplWeek = epl.slice(weekIndex * 10, weekIndex * 10 + 10);
  const laLigaWeek = laliga.slice(weekIndex * 10, weekIndex * 10 + 5);
  const matches = [...eplWeek, ...laLigaWeek].map((match, matchIndex) => (
    formatFixture(match, weekIndex, matchIndex)
  ));

  return {
    id: weekIndex + 1,
    title: `Week ${weekIndex + 1}`,
    pool: weeklyPools[weekIndex],
    minimumStake: 100,
    payoutRatios,
    payoutSummary: categoryRows(weeklyPools[weekIndex], weeklyWinners[weekIndex]),
    matches,
  };
});

fs.writeFileSync(
  "src/data/weeks.js",
  `export const weeks = ${JSON.stringify(weeks, null, 2)};\n`,
);

console.log(`Wrote ${weeks.length} weeks and ${weeks.reduce((sum, week) => sum + week.matches.length, 0)} matches.`);
